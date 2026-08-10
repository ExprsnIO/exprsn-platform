const { Secret } = require('../models');
const encryptionService = require('./encryptionService');
const keyService = require('./keyService');
const auditService = require('./auditService');
const logger = require('../utils/logger');

/**
 * Secret Management Service
 * Handles CRUD operations for secrets with encryption
 */
class SecretService {
  /**
   * Create a new secret
   * @param {Object} data - Secret data
   * @param {string} actor - User or service creating the secret
   * @returns {Object} Created secret (without decrypted value)
   */
  async createSecret(data, actor) {
    const startTime = Date.now();

    try {
      const {
        path,
        key,
        value,
        encryptionKeyId,
        metadata = {},
        rotationPolicy,
        expiresAt
      } = data;

      // Validate path
      if (!path || !path.startsWith('/')) {
        throw new Error('Secret path must start with /');
      }

      // Check if secret already exists
      const existing = await Secret.findOne({ where: { path } });
      if (existing) {
        throw new Error(`Secret already exists at path: ${path}`);
      }

      // Get or use default encryption key
      let keyId = encryptionKeyId;
      if (!keyId) {
        const defaultKey = await keyService.getKeyByName('default', actor);
        keyId = defaultKey.id;
      }

      // Get decrypted encryption key
      const dek = await keyService.getDecryptedKey(keyId);

      // Encrypt the secret value
      const { encryptedData, iv, authTag } = encryptionService.encrypt(value, dek);

      // Create secret record
      const secret = await Secret.create({
        path,
        key,
        encryptedValue: encryptedData,
        encryptionKeyId: keyId,
        iv,
        authTag,
        version: 1,
        metadata,
        rotationPolicy,
        expiresAt,
        createdBy: actor,
        status: 'active'
      });

      // Audit log
      await auditService.log({
        action: 'create',
        resourceType: 'secret',
        resourceId: secret.id,
        resourcePath: path,
        actor,
        success: true,
        duration: Date.now() - startTime,
        metadata: { version: 1 }
      });

      logger.info('Secret created', {
        secretId: secret.id,
        path,
        actor
      });

      return this.sanitizeSecret(secret);
    } catch (error) {
      logger.error('Failed to create secret', { error: error.message, path: data.path, actor });

      await auditService.log({
        action: 'create',
        resourceType: 'secret',
        resourcePath: data.path,
        actor,
        success: false,
        errorMessage: error.message,
        duration: Date.now() - startTime
      });

      throw error;
    }
  }

  /**
   * Get a secret by path (decrypted)
   * @param {string} path - Secret path
   * @param {string} actor - User or service requesting the secret
   * @param {boolean} includeValue - Whether to include decrypted value
   * @returns {Object} Secret data
   */
  async getSecret(path, actor, includeValue = true) {
    const startTime = Date.now();

    try {
      const secret = await Secret.findOne({
        where: { path, status: 'active' }
      });

      if (!secret) {
        throw new Error(`Secret not found at path: ${path}`);
      }

      // Check expiration
      if (secret.expiresAt && new Date(secret.expiresAt) < new Date()) {
        throw new Error('Secret has expired');
      }

      let decryptedValue = null;

      if (includeValue) {
        // Get decrypted encryption key
        const dek = await keyService.getDecryptedKey(secret.encryptionKeyId);

        // Decrypt the secret value
        decryptedValue = encryptionService.decrypt(
          secret.encryptedValue,
          secret.iv,
          secret.authTag,
          dek
        );
      }

      await auditService.log({
        action: 'read',
        resourceType: 'secret',
        resourceId: secret.id,
        resourcePath: path,
        actor,
        success: true,
        duration: Date.now() - startTime,
        metadata: { includeValue }
      });

      const sanitized = this.sanitizeSecret(secret);
      if (includeValue) {
        sanitized.value = decryptedValue;
      }

      return sanitized;
    } catch (error) {
      logger.error('Failed to get secret', { error: error.message, path, actor });

      await auditService.log({
        action: 'read',
        resourceType: 'secret',
        resourcePath: path,
        actor,
        success: false,
        errorMessage: error.message,
        duration: Date.now() - startTime
      });

      throw error;
    }
  }

  /**
   * Update a secret
   * @param {string} path - Secret path
   * @param {Object} data - Updated data
   * @param {string} actor - User or service updating the secret
   * @returns {Object} Updated secret
   */
  async updateSecret(path, data, actor) {
    const startTime = Date.now();

    try {
      const secret = await Secret.findOne({ where: { path, status: 'active' } });

      if (!secret) {
        throw new Error(`Secret not found at path: ${path}`);
      }

      const updates = { updatedBy: actor };

      // If value is being updated, re-encrypt
      if (data.value) {
        const dek = await keyService.getDecryptedKey(secret.encryptionKeyId);
        const { encryptedData, iv, authTag } = encryptionService.encrypt(data.value, dek);

        updates.encryptedValue = encryptedData;
        updates.iv = iv;
        updates.authTag = authTag;
        updates.version = secret.version + 1;
      }

      // Update metadata if provided
      if (data.metadata) {
        updates.metadata = { ...secret.metadata, ...data.metadata };
      }

      // Update rotation policy if provided
      if (data.rotationPolicy !== undefined) {
        updates.rotationPolicy = data.rotationPolicy;
      }

      // Update expiration if provided
      if (data.expiresAt !== undefined) {
        updates.expiresAt = data.expiresAt;
      }

      await secret.update(updates);

      await auditService.log({
        action: 'update',
        resourceType: 'secret',
        resourceId: secret.id,
        resourcePath: path,
        actor,
        success: true,
        duration: Date.now() - startTime,
        metadata: {
          oldVersion: secret.version,
          newVersion: updates.version || secret.version
        }
      });

      logger.info('Secret updated', {
        secretId: secret.id,
        path,
        actor
      });

      return this.sanitizeSecret(secret);
    } catch (error) {
      logger.error('Failed to update secret', { error: error.message, path, actor });

      await auditService.log({
        action: 'update',
        resourceType: 'secret',
        resourcePath: path,
        actor,
        success: false,
        errorMessage: error.message,
        duration: Date.now() - startTime
      });

      throw error;
    }
  }

  /**
   * Delete a secret (soft delete)
   * @param {string} path - Secret path
   * @param {string} actor - User or service deleting the secret
   */
  async deleteSecret(path, actor) {
    const startTime = Date.now();

    try {
      const secret = await Secret.findOne({ where: { path, status: 'active' } });

      if (!secret) {
        throw new Error(`Secret not found at path: ${path}`);
      }

      // Soft delete
      await secret.destroy();

      await auditService.log({
        action: 'delete',
        resourceType: 'secret',
        resourceId: secret.id,
        resourcePath: path,
        actor,
        success: true,
        duration: Date.now() - startTime
      });

      logger.warn('Secret deleted', {
        secretId: secret.id,
        path,
        actor
      });
    } catch (error) {
      logger.error('Failed to delete secret', { error: error.message, path, actor });

      await auditService.log({
        action: 'delete',
        resourceType: 'secret',
        resourcePath: path,
        actor,
        success: false,
        errorMessage: error.message,
        duration: Date.now() - startTime
      });

      throw error;
    }
  }

  /**
   * List secrets with filters
   * @param {Object} filters - Filter options
   * @param {string} actor - User or service listing secrets
   * @returns {Array} List of secrets
   */
  async listSecrets(filters = {}, actor) {
    try {
      const {
        pathPrefix,
        status = 'active',
        limit = 100,
        offset = 0
      } = filters;

      const where = { status };

      if (pathPrefix) {
        where.path = {
          [Secret.sequelize.Op.like]: `${pathPrefix}%`
        };
      }

      const secrets = await Secret.findAll({
        where,
        limit,
        offset,
        order: [['createdAt', 'DESC']]
      });

      return secrets.map(secret => this.sanitizeSecret(secret));
    } catch (error) {
      logger.error('Failed to list secrets', { error: error.message, actor });
      throw error;
    }
  }

  /**
   * Rotate a secret
   * @param {string} path - Secret path
   * @param {string} newValue - New secret value (if not provided, generates random)
   * @param {string} actor - User or service rotating the secret
   * @returns {Object} Updated secret
   */
  async rotateSecret(path, newValue, actor) {
    const startTime = Date.now();

    try {
      const secret = await Secret.findOne({ where: { path, status: 'active' } });

      if (!secret) {
        throw new Error(`Secret not found at path: ${path}`);
      }

      // Generate new value if not provided
      const value = newValue || encryptionService.generatePassword(32);

      // Re-encrypt with current or new key
      const dek = await keyService.getDecryptedKey(secret.encryptionKeyId);
      const { encryptedData, iv, authTag } = encryptionService.encrypt(value, dek);

      await secret.update({
        encryptedValue: encryptedData,
        iv,
        authTag,
        version: secret.version + 1,
        lastRotatedAt: new Date(),
        updatedBy: actor
      });

      await auditService.log({
        action: 'rotate',
        resourceType: 'secret',
        resourceId: secret.id,
        resourcePath: path,
        actor,
        success: true,
        duration: Date.now() - startTime,
        metadata: {
          oldVersion: secret.version - 1,
          newVersion: secret.version
        }
      });

      logger.info('Secret rotated', {
        secretId: secret.id,
        path,
        actor
      });

      return this.sanitizeSecret(secret);
    } catch (error) {
      logger.error('Failed to rotate secret', { error: error.message, path, actor });

      await auditService.log({
        action: 'rotate',
        resourceType: 'secret',
        resourcePath: path,
        actor,
        success: false,
        errorMessage: error.message,
        duration: Date.now() - startTime
      });

      throw error;
    }
  }

  /**
   * Remove sensitive data from secret object
   * @param {Object} secret - Secret object
   * @returns {Object} Sanitized secret
   */
  sanitizeSecret(secret) {
    const sanitized = secret.toJSON ? secret.toJSON() : secret;
    delete sanitized.encryptedValue;
    delete sanitized.iv;
    delete sanitized.authTag;
    return sanitized;
  }
}

module.exports = new SecretService();
