/**
 * Group Secret Service (Phase 6 — Shared keys / secrets for groups)
 *
 * Manages the SecretGroupAccess ACL: which nexus group may use which secret,
 * at what level, plus the controlled admin reveal path.
 *
 * SECURITY: list/grant/revoke operate on METADATA ONLY and NEVER decrypt or
 * return plaintext. Decryption happens exclusively in revealSecret(), which is
 * an explicit, admin-only, audited action.
 */

const { Op } = require('sequelize');
const { Secret, SecretGroupAccess } = require('../models');
const secretService = require('./secretService');
const auditService = require('./auditService');
const logger = require('../utils/logger');

class GroupSecretService {
  /**
   * Find an active secret by path, or throw a 404-shaped error.
   * @param {string} path - Secret path
   * @returns {Promise<Object>} Secret instance
   */
  async findSecretOrThrow(path) {
    const secret = await Secret.findOne({ where: { path, status: 'active' } });
    if (!secret) {
      const err = new Error(`Secret not found at path: ${path}`);
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }
    return secret;
  }

  /**
   * Project an ACL row (with its joined secret) to a metadata-only DTO.
   * NEVER includes encryptedValue / iv / authTag / plaintext value.
   * @param {Object} access - SecretGroupAccess instance (with `secret` include)
   * @returns {Object} Metadata DTO
   */
  toMetadata(access) {
    const secret = access.secret || {};
    return {
      secretId: access.secretId,
      path: secret.path || null,
      key: secret.key || null,
      permission: access.permission,
      grantedBy: access.grantedBy,
      expiresAt: access.expiresAt,
      // ACL grant timestamps
      grantedAt: access.createdAt,
      updatedAt: access.updatedAt,
      // secret lifecycle metadata (no secret material)
      secretCreatedAt: secret.createdAt || null,
      secretUpdatedAt: secret.updatedAt || null,
      secretVersion: secret.version || null
    };
  }

  /**
   * List secrets shared with a group — METADATA ONLY.
   * @param {string} groupId - Group id
   * @returns {Promise<Array<Object>>} Metadata DTOs (no plaintext)
   */
  async listGroupSecrets(groupId) {
    const rows = await SecretGroupAccess.findAll({
      where: { groupId },
      include: [{
        model: Secret,
        as: 'secret',
        required: true,
        where: { status: 'active' },
        // explicitly exclude secret material from the join
        attributes: ['id', 'path', 'key', 'version', 'createdAt', 'updatedAt']
      }],
      order: [['createdAt', 'DESC']]
    });

    return rows.map((row) => this.toMetadata(row));
  }

  /**
   * Grant (or update) a group's access to an existing secret.
   * @param {Object} params - { groupId, path, permission, expiresAt }
   * @param {string} actor - Granting user id (audit)
   * @returns {Promise<Object>} Metadata DTO of the grant
   */
  async shareSecret({ groupId, path, permission = 'read', expiresAt = null }, actor) {
    const startTime = Date.now();
    try {
      const secret = await this.findSecretOrThrow(path);

      const [access, created] = await SecretGroupAccess.findOrCreate({
        where: { secretId: secret.id, groupId },
        defaults: {
          secretId: secret.id,
          groupId,
          permission,
          grantedBy: actor,
          expiresAt
        }
      });

      // An existing grant was found — update permission/expiry/grantedBy.
      if (!created) {
        await access.update({ permission, expiresAt, grantedBy: actor });
      }

      await auditService.log({
        action: 'share',
        resourceType: 'group_secret',
        resourceId: secret.id,
        resourcePath: path,
        actor,
        success: true,
        duration: Date.now() - startTime,
        metadata: { groupId, permission, expiresAt, updated: !created }
      });

      logger.info('Secret shared with group', { secretId: secret.id, path, groupId, permission, actor });

      const reloaded = await SecretGroupAccess.findByPk(access.id, {
        include: [{
          model: Secret,
          as: 'secret',
          attributes: ['id', 'path', 'key', 'version', 'createdAt', 'updatedAt']
        }]
      });
      return this.toMetadata(reloaded);
    } catch (error) {
      await auditService.log({
        action: 'share',
        resourceType: 'group_secret',
        resourcePath: path,
        actor,
        success: false,
        errorMessage: error.message,
        duration: Date.now() - startTime,
        metadata: { groupId }
      });
      throw error;
    }
  }

  /**
   * Revoke a group's access to a secret.
   * @param {Object} params - { groupId, path }
   * @param {string} actor - Revoking user id (audit)
   * @returns {Promise<void>}
   */
  async revokeSecret({ groupId, path }, actor) {
    const startTime = Date.now();
    try {
      const secret = await this.findSecretOrThrow(path);

      const access = await SecretGroupAccess.findOne({
        where: { secretId: secret.id, groupId }
      });
      if (!access) {
        const err = new Error('Group does not have access to this secret');
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      await access.destroy();

      await auditService.log({
        action: 'revoke',
        resourceType: 'group_secret',
        resourceId: secret.id,
        resourcePath: path,
        actor,
        success: true,
        duration: Date.now() - startTime,
        metadata: { groupId }
      });

      logger.warn('Secret access revoked from group', { secretId: secret.id, path, groupId, actor });
    } catch (error) {
      await auditService.log({
        action: 'revoke',
        resourceType: 'group_secret',
        resourcePath: path,
        actor,
        success: false,
        errorMessage: error.message,
        duration: Date.now() - startTime,
        metadata: { groupId }
      });
      throw error;
    }
  }

  /**
   * Find a live (non-expired) grant for a group on a secret, or throw.
   * @param {string} secretId - Secret id
   * @param {string} groupId - Group id
   * @returns {Promise<Object>} SecretGroupAccess instance
   */
  async requireLiveGrant(secretId, groupId) {
    const access = await SecretGroupAccess.findOne({
      where: {
        secretId,
        groupId,
        [Op.or]: [
          { expiresAt: null },
          { expiresAt: { [Op.gt]: new Date() } }
        ]
      }
    });
    if (!access) {
      const err = new Error('Secret is not shared with this group');
      err.statusCode = 403;
      err.code = 'NOT_SHARED';
      throw err;
    }
    return access;
  }

  /**
   * Explicit, admin-only reveal of a single secret's plaintext for a group.
   * Requires a live ACL grant for the group on the secret. Decryption reuses
   * the existing secretService.getSecret (which also writes a 'read' audit);
   * we additionally write a dedicated 'reveal' audit for the group context.
   *
   * @param {Object} params - { groupId, path }
   * @param {string} actor - Revealing user id (audit)
   * @returns {Promise<Object>} { path, key, value, ...metadata }
   */
  async revealSecret({ groupId, path }, actor) {
    const startTime = Date.now();
    try {
      const secret = await this.findSecretOrThrow(path);
      await this.requireLiveGrant(secret.id, groupId);

      // Authorization here is group membership (admin) + the ACL grant, NOT the
      // user's own token path scope — pass null authContext to bypass per-token
      // path scoping. getSecret performs the decrypt + writes a 'read' audit.
      const revealed = await secretService.getSecret(path, actor, true, null);

      await auditService.log({
        action: 'reveal',
        resourceType: 'group_secret',
        resourceId: secret.id,
        resourcePath: path,
        actor,
        success: true,
        duration: Date.now() - startTime,
        metadata: { groupId }
      });

      logger.warn('Group secret revealed', { secretId: secret.id, path, groupId, actor });
      return revealed;
    } catch (error) {
      await auditService.log({
        action: 'reveal',
        resourceType: 'group_secret',
        resourcePath: path,
        actor,
        success: false,
        errorMessage: error.message,
        duration: Date.now() - startTime,
        metadata: { groupId }
      });
      throw error;
    }
  }
}

module.exports = new GroupSecretService();
