/**
 * ═══════════════════════════════════════════════════════════════════════
 * Token Service - Implementation of Exprsn CA Token Specification v1.1
 * See: TOKEN_SPECIFICATION_V1.1.md (ExprsnIO/jsonlexicon-nodejs)
 * ═══════════════════════════════════════════════════════════════════════
 */

const { Token, Certificate, Group, UserGroup, AuditLog } = require('../models');
const crypto = require('../crypto');
const { getStorage } = require('../storage');
const config = require('../config');
const logger = require('../utils/logger');
const redisClient = require('../utils/redis');

/**
 * Build a typed service error carrying an HTTP-style status code
 * @param {string} code - Machine-readable error code
 * @param {string} message - Human-readable message
 * @param {number} status - HTTP status code
 * @returns {Error}
 */
function serviceError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

/**
 * Group types that count as an "organization" for token scoping.
 */
const ORGANIZATION_GROUP_TYPES = ['organizational_unit', 'department'];

class TokenService {
  /**
   * Is the user an admin (role admin/owner) of the given CA directory group?
   * @param {string} userId
   * @param {string} groupId
   * @returns {Promise<boolean>}
   */
  async isGroupAdmin(userId, groupId) {
    if (!userId || !groupId) {
      return false;
    }
    const membership = await UserGroup.findOne({
      where: { userId, groupId, role: ['admin', 'owner'] }
    });
    return !!membership;
  }

  /**
   * May the actor invalidate this token? (spec v1.1 §10)
   * Allowed: the token owner, a system admin, or an admin/owner of the
   * token's group or organization scope.
   * @param {Object} token - Token instance
   * @param {string} actorId - Acting user id
   * @param {Object} [options] - { isAdmin }
   * @returns {Promise<boolean>}
   */
  async canInvalidateToken(token, actorId, options = {}) {
    if (options.isAdmin) {
      return true;
    }
    if (actorId && token.userId === actorId) {
      return true;
    }
    if (token.groupId && await this.isGroupAdmin(actorId, token.groupId)) {
      return true;
    }
    if (token.organizationId && await this.isGroupAdmin(actorId, token.organizationId)) {
      return true;
    }
    return false;
  }

  /**
   * Resolve and validate a group/organization scope for token issuance.
   * Non-admin issuers must be an active member of the scope group.
   * @param {string} groupId - ca.groups id
   * @param {string} userId - Issuing user
   * @param {Object} options - { isAdmin, organization: bool }
   * @returns {Promise<Object>} Group instance
   */
  async resolveScopeGroup(groupId, userId, { isAdmin = false, organization = false } = {}) {
    const group = await Group.findByPk(groupId);
    if (!group || group.status !== 'active') {
      throw serviceError(
        organization ? 'ORGANIZATION_NOT_FOUND' : 'GROUP_NOT_FOUND',
        `${organization ? 'Organization' : 'Group'} not found or not active`,
        404
      );
    }
    if (organization && !ORGANIZATION_GROUP_TYPES.includes(group.type)) {
      throw serviceError(
        'NOT_AN_ORGANIZATION',
        'organizationId must reference an organizational unit or department group',
        400
      );
    }
    if (!isAdmin) {
      const membership = await UserGroup.findOne({ where: { userId, groupId } });
      if (!membership) {
        throw serviceError(
          'SCOPE_MEMBERSHIP_REQUIRED',
          `You are not a member of the requested ${organization ? 'organization' : 'group'} scope`,
          403
        );
      }
    }
    return group;
  }

  /**
   * Generate token (Section 8 of specification)
   * @param {Object} params - Token generation parameters
   * @param {string} userId - User ID generating the token
   * @param {Object} [options] - Options ({ isAdmin })
   * @returns {Promise<Object>} Generated token
   */
  async generateToken(params, userId, options = {}) {
    try {
      logger.info('Generating token...', { userId, resourceType: params.resourceType });

      // Get certificate for signing
      const certificate = await Certificate.findByPk(params.certificateId);
      if (!certificate) {
        throw serviceError('CERTIFICATE_NOT_FOUND', 'Certificate not found', 404);
      }

      if (!certificate.isValid()) {
        throw serviceError('CERTIFICATE_INVALID', 'Certificate is not valid for signing', 400);
      }

      // CA certificates must never be used for token signing
      if (certificate.type === 'root' || certificate.type === 'intermediate') {
        throw serviceError(
          'FORBIDDEN_CERTIFICATE_TYPE',
          'Tokens may not be signed with root or intermediate CA certificates',
          403
        );
      }

      // Owner scoping: non-admins may only sign with their own certificates
      if (!options.isAdmin && certificate.userId && certificate.userId !== userId) {
        throw serviceError(
          'CERTIFICATE_OWNERSHIP',
          'You do not own the certificate requested for token signing',
          403
        );
      }

      // Group/organization scoping (spec v1.1): validate the referenced groups
      // and (for non-admins) the issuer's membership in them.
      let groupId = null;
      let organizationId = null;
      if (params.groupId) {
        const group = await this.resolveScopeGroup(params.groupId, userId, {
          isAdmin: options.isAdmin
        });
        groupId = group.id;
      }
      if (params.organizationId) {
        const organization = await this.resolveScopeGroup(params.organizationId, userId, {
          isAdmin: options.isAdmin,
          organization: true
        });
        organizationId = organization.id;
      }

      // Get private key from storage
      const storage = getStorage();
      const privateKey = await storage.getPrivateKey(certificate.id);

      // Generate timestamps
      const issuedAt = Date.now();
      const notBefore = params.notBefore || issuedAt;

      // Calculate expiration
      let expiresAt = null;
      let usesRemaining = null;
      let maxUses = null;

      if (params.expiryType === 'time') {
        // Callers may pass an absolute expiresAt (the API schema's shape) or a
        // relative expirySeconds; absolute wins when both are present.
        if (params.expiresAt && params.expiresAt > issuedAt) {
          expiresAt = params.expiresAt;
        } else {
          const expirySeconds = params.expirySeconds || config.token.defaults.expirySeconds;
          expiresAt = issuedAt + (expirySeconds * 1000);
        }
      } else if (params.expiryType === 'use') {
        maxUses = params.maxUses || config.token.defaults.maxUses;
        usesRemaining = maxUses;
      }
      // For 'persistent', both remain null

      // Create token record
      const token = await Token.create({
        version: config.token.version,
        userId,
        certificateId: certificate.id,
        groupId,
        organizationId,
        permissionRead: params.permissions.read || false,
        permissionWrite: params.permissions.write || false,
        permissionAppend: params.permissions.append || false,
        permissionDelete: params.permissions.delete || false,
        permissionUpdate: params.permissions.update || false,
        resourceType: params.resourceType,
        resourceValue: params.resourceValue,
        expiryType: params.expiryType || 'time',
        issuedAt,
        notBefore,
        expiresAt,
        usesRemaining,
        maxUses,
        tokenData: params.data || null,
        status: 'active',
        checksum: '', // Will be calculated below
        signature: '' // Will be calculated below
      });

      // Build token object for checksum (Section 8.5)
      const tokenForChecksum = {
        id: token.id,
        version: token.version,
        issuer: {
          domain: config.ca.domain,
          certificateSerial: certificate.serialNumber
        },
        permissions: token.getPermissions(),
        resource: {
          [token.resourceType]: token.resourceValue
        },
        data: token.tokenData,
        issuedAt: token.issuedAt,
        notBefore: token.notBefore,
        expiresAt: token.expiresAt,
        expiryType: token.expiryType
      };

      // Add use-based fields if applicable
      if (token.expiryType === 'use') {
        tokenForChecksum.usesRemaining = token.usesRemaining;
        tokenForChecksum.maxUses = token.maxUses;
      }

      // Add scope fields if applicable (v1.1). Conditional so pre-1.1 tokens
      // (which have no scope) keep verifying against their original payload.
      if (token.groupId) {
        tokenForChecksum.groupId = token.groupId;
      }
      if (token.organizationId) {
        tokenForChecksum.organizationId = token.organizationId;
      }

      // Calculate checksum (Section 4.2.5)
      const checksum = crypto.calculateChecksum(tokenForChecksum);
      token.checksum = checksum;

      // Create signature (Section 8.6)
      const canonicalData = JSON.stringify(tokenForChecksum, Object.keys(tokenForChecksum).sort());
      const signature = crypto.signData(canonicalData, privateKey);
      token.signature = signature;

      await token.save();

      // Audit log
      await AuditLog.log({
        userId,
        action: 'token.generate',
        resourceType: 'token',
        resourceId: token.id,
        status: 'success',
        severity: 'info',
        message: `Token generated for ${params.resourceType}: ${params.resourceValue}`,
        details: {
          tokenId: token.id,
          expiryType: token.expiryType,
          permissions: token.getPermissions()
        }
      });

      logger.info('Token generated successfully', { tokenId: token.id });

      // Return full token object (Section 8.7)
      return {
        ...tokenForChecksum,
        checksum,
        signature
      };

    } catch (error) {
      logger.error('Failed to generate token:', error);

      await AuditLog.log({
        userId,
        action: 'token.generate',
        resourceType: 'token',
        status: 'error',
        severity: 'error',
        message: `Failed to generate token: ${error.message}`,
        details: { error: error.message }
      });

      throw error;
    }
  }

  /**
   * Validate token (Section 9 of specification)
   * @param {string} tokenId - Token ID
   * @param {Object} validationParams - Validation parameters
   * @returns {Promise<Object>} Validation result
   */
  async validateToken(tokenId, validationParams = {}) {
    try {
      logger.info('Validating token...', { tokenId });

      // Check cache first (skip for use-based tokens to ensure atomic decrement)
      const cacheKey = `token:validation:${tokenId}`;
      const cachedResult = await redisClient.get(cacheKey);

      if (cachedResult && cachedResult.expiryType !== 'use') {
        // Verify cached result is still valid (time-based check)
        if (cachedResult.valid && cachedResult.expiresAt && Date.now() >= cachedResult.expiresAt) {
          // Token expired since caching - invalidate cache
          await redisClient.del(cacheKey);
        } else {
          logger.debug('Token validation cache hit', { tokenId });
          return cachedResult;
        }
      }

      // Step 1: Retrieve token (Section 9.1.1)
      const token = await Token.findByPk(tokenId, {
        include: [{ association: 'certificate' }]
      });

      if (!token) {
        return {
          valid: false,
          error: 'TOKEN_NOT_FOUND',
          message: 'Token does not exist'
        };
      }

      // Step 2: Check token status (Section 9.1.2)
      if (token.status === 'revoked') {
        return {
          valid: false,
          error: 'TOKEN_REVOKED',
          message: 'Token has been revoked',
          revokedAt: token.revokedAt,
          revokedReason: token.revokedReason
        };
      }

      // Step 3: Check time-based expiration (Section 9.1.3)
      if (token.expiryType === 'time' && Date.now() >= token.expiresAt) {
        // Update status
        token.status = 'expired';
        await token.save();

        return {
          valid: false,
          error: 'TOKEN_EXPIRED',
          message: 'Token has expired',
          expiresAt: token.expiresAt
        };
      }

      // Step 4: Check notBefore (Section 9.1.3)
      if (token.notBefore && Date.now() < token.notBefore) {
        return {
          valid: false,
          error: 'TOKEN_NOT_YET_VALID',
          message: 'Token is not yet valid',
          notBefore: token.notBefore
        };
      }

      // Step 5: Check use-based expiration (Section 9.1.4)
      if (token.expiryType === 'use' && token.usesRemaining <= 0) {
        token.status = 'exhausted';
        await token.save();

        return {
          valid: false,
          error: 'TOKEN_NO_USES_REMAINING',
          message: 'Token has no uses remaining',
          useCount: token.useCount
        };
      }

      // Step 5b: Check scope groups (spec v1.1) — a token scoped to a group or
      // organization is only valid while that group/organization stays active
      // (deactivating/archiving the scope invalidates its tokens).
      if (token.groupId || token.organizationId) {
        const scopeIds = [token.groupId, token.organizationId].filter(Boolean);
        const scopeGroups = await Group.findAll({ where: { id: scopeIds } });
        const inactive = scopeIds.find(id => {
          const g = scopeGroups.find(sg => sg.id === id);
          return !g || g.status !== 'active';
        });
        if (inactive) {
          return {
            valid: false,
            error: 'SCOPE_INACTIVE',
            message: 'Token group/organization scope is not active',
            scopeId: inactive
          };
        }
      }

      // Step 6: Verify certificate (Section 9.1.5)
      const certificate = token.certificate;
      if (!certificate) {
        return {
          valid: false,
          error: 'CERTIFICATE_NOT_FOUND',
          message: 'Associated certificate not found'
        };
      }

      if (certificate.status === 'revoked') {
        return {
          valid: false,
          error: 'CERTIFICATE_REVOKED',
          message: 'Certificate has been revoked',
          certificateId: certificate.id
        };
      }

      if (certificate.isExpired()) {
        return {
          valid: false,
          error: 'CERTIFICATE_EXPIRED',
          message: 'Certificate has expired',
          certificateId: certificate.id
        };
      }

      // Step 7: Verify signature (Section 9.1.6)
      const tokenForVerification = {
        id: token.id,
        version: token.version,
        issuer: {
          domain: config.ca.domain,
          certificateSerial: certificate.serialNumber
        },
        permissions: token.getPermissions(),
        resource: {
          [token.resourceType]: token.resourceValue
        },
        data: token.tokenData,
        issuedAt: token.issuedAt,
        notBefore: token.notBefore,
        expiresAt: token.expiresAt,
        expiryType: token.expiryType
      };

      if (token.expiryType === 'use') {
        // The signature was created at issuance, when usesRemaining === maxUses.
        // Reconstruct with the issuance values — using the current (decremented)
        // usesRemaining would fail verification after the first use.
        tokenForVerification.usesRemaining = token.maxUses;
        tokenForVerification.maxUses = token.maxUses;
      }

      // Scope fields are part of the signed payload for v1.1 tokens (conditional
      // so pre-1.1 tokens keep verifying against their original payload).
      if (token.groupId) {
        tokenForVerification.groupId = token.groupId;
      }
      if (token.organizationId) {
        tokenForVerification.organizationId = token.organizationId;
      }

      const canonicalData = JSON.stringify(tokenForVerification, Object.keys(tokenForVerification).sort());
      const signatureValid = crypto.verifySignature(canonicalData, token.signature, certificate.publicKey);

      if (!signatureValid) {
        await AuditLog.log({
          userId: token.userId,
          action: 'token.validate',
          resourceType: 'token',
          resourceId: token.id,
          status: 'failure',
          severity: 'warning',
          message: 'Token signature verification failed',
          details: { tokenId: token.id }
        });

        return {
          valid: false,
          error: 'INVALID_SIGNATURE',
          message: 'Token signature verification failed'
        };
      }

      // Step 8: Check permissions (Section 9.1.7)
      const permissions = token.getPermissions();

      // Support both single permission and multiple permissions
      if (validationParams.requiredPermission) {
        if (!permissions[validationParams.requiredPermission]) {
          return {
            valid: false,
            error: 'INSUFFICIENT_PERMISSIONS',
            message: `Token does not have ${validationParams.requiredPermission} permission`,
            hasPermissions: permissions,
            requiredPermission: validationParams.requiredPermission
          };
        }
      }

      // Support multiple required permissions (object format)
      if (validationParams.requiredPermissions) {
        for (const [perm, required] of Object.entries(validationParams.requiredPermissions)) {
          if (required && !permissions[perm]) {
            return {
              valid: false,
              error: 'INSUFFICIENT_PERMISSIONS',
              message: `Token does not have required permission: ${perm}`,
              hasPermissions: permissions,
              requiredPermissions: validationParams.requiredPermissions
            };
          }
        }
      }

      // Step 9: Check resource match (Section 9.1.8)
      if (validationParams.resourceValue) {
        if (!this.matchesResource(validationParams.resourceValue, token.resourceValue)) {
          return {
            valid: false,
            error: 'RESOURCE_MISMATCH',
            message: 'Token resource does not match requested resource',
            tokenResource: token.resourceValue,
            requestedResource: validationParams.resourceValue
          };
        }
      }

      // Step 10: Update token usage (Section 9.3)
      if (token.expiryType === 'use') {
        // Atomic decrement (Section 9.3)
        const [affectedRows] = await Token.update(
          {
            usesRemaining: token.usesRemaining - 1,
            useCount: token.useCount + 1,
            lastUsedAt: Date.now()
          },
          {
            where: {
              id: token.id,
              usesRemaining: { [require('sequelize').Op.gt]: 0 },
              status: 'active'
            }
          }
        );

        if (affectedRows === 0) {
          return {
            valid: false,
            error: 'TOKEN_NO_USES_REMAINING',
            message: 'Token has no uses remaining (race condition)'
          };
        }

        // Reload to get updated values
        await token.reload();
      } else {
        // Update last used timestamp
        token.lastUsedAt = Date.now();
        token.useCount += 1;
        await token.save();
      }

      // Audit log
      await AuditLog.log({
        userId: token.userId,
        action: 'token.validate',
        resourceType: 'token',
        resourceId: token.id,
        status: 'success',
        severity: 'info',
        message: 'Token validated successfully',
        details: {
          tokenId: token.id,
          usesRemaining: token.usesRemaining,
          useCount: token.useCount
        }
      });

      logger.info('Token validated successfully', { tokenId: token.id });

      // Return validation result (Section 9.4). Top-level userId/permissions/
      // tokenData let the shared validator and module middleware propagate the
      // authenticated identity (req.user.id, req.permissions). NOTE: do NOT add
      // a top-level resourcePattern — that re-enables the shared validator's
      // glob check, which rejects the '/' prefix the CA matcher already accepts.
      const validationResult = {
        valid: true,
        userId: token.userId,
        permissions: token.getPermissions(),
        tokenData: token.tokenData,
        expiryType: token.expiryType,
        expiresAt: token.expiresAt,
        token: {
          id: token.id,
          version: token.version,
          permissions: token.getPermissions(),
          resource: {
            [token.resourceType]: token.resourceValue
          },
          expiryType: token.expiryType,
          expiresAt: token.expiresAt,
          usesRemaining: token.usesRemaining,
          maxUses: token.maxUses,
          useCount: token.useCount,
          groupId: token.groupId,
          organizationId: token.organizationId,
          data: token.tokenData
        }
      };

      // Cache validation result (skip use-based tokens)
      if (token.expiryType !== 'use') {
        // Calculate TTL based on token expiry
        let cacheTTL = config.redis.ttl.token;

        if (token.expiryType === 'time') {
          const timeRemaining = Math.floor((token.expiresAt - Date.now()) / 1000);
          cacheTTL = Math.min(timeRemaining, config.redis.ttl.token);
        }

        await redisClient.set(cacheKey, validationResult, cacheTTL);
        logger.debug('Token validation result cached', { tokenId: token.id, ttl: cacheTTL });
      }

      return validationResult;

    } catch (error) {
      logger.error('Failed to validate token:', error);

      await AuditLog.log({
        action: 'token.validate',
        resourceType: 'token',
        resourceId: tokenId,
        status: 'error',
        severity: 'error',
        message: `Token validation error: ${error.message}`,
        details: { error: error.message }
      });

      throw error;
    }
  }

  /**
   * Match resource pattern (Section 7)
   * @param {string} requestedResource - Requested resource
   * @param {string} tokenResource - Token resource pattern
   * @returns {boolean} Match result
   */
  matchesResource(requestedResource, tokenResource) {
    // Exact match
    if (requestedResource === tokenResource) {
      return true;
    }

    // Wildcard matching
    if (tokenResource.includes('*')) {
      const pattern = tokenResource
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^/]*');
      const regex = new RegExp(`^${pattern}$`);
      return regex.test(requestedResource);
    }

    // Prefix matching (trailing slash)
    if (tokenResource.endsWith('/')) {
      return requestedResource.startsWith(tokenResource);
    }

    return false;
  }

  /**
   * Revoke (invalidate) a token — spec v1.1 §10.
   * Authorized principals: the token owner, a system admin, or an admin/owner
   * of the token's group or organization scope.
   */
  async revokeToken(tokenId, reason, userId = null, options = {}) {
    const token = await Token.findByPk(tokenId);
    if (!token) {
      throw serviceError('TOKEN_NOT_FOUND', 'Token not found', 404);
    }

    if (!(await this.canInvalidateToken(token, userId, options))) {
      throw serviceError(
        'REVOKE_NOT_AUTHORIZED',
        'Only the token owner, a system admin, or an admin of the token\'s group/organization may revoke it',
        403
      );
    }

    token.status = 'revoked';
    token.revokedAt = Date.now();
    token.revokedReason = reason;
    token.revokedBy = userId || null;
    await token.save();

    // Invalidate cache
    const cacheKey = `token:validation:${tokenId}`;
    await redisClient.del(cacheKey);
    logger.debug('Token validation cache invalidated', { tokenId });

    await AuditLog.log({
      userId,
      action: 'token.revoke',
      resourceType: 'token',
      resourceId: token.id,
      status: 'success',
      severity: 'warning',
      message: `Token revoked: ${reason}`,
      details: { tokenId: token.id, reason, revokedBy: userId }
    });

    return token;
  }

  /**
   * Bulk-revoke every active token in a user/group/organization scope
   * (spec v1.1 §10.2). Authorization:
   *  - scope user:         the user themself, or a system admin
   *  - scope group/org:    an admin/owner of that group/org, or a system admin
   *
   * @param {Object} scope - Exactly one of { userId, groupId, organizationId }
   * @param {string} reason - Recorded on each token
   * @param {string} actorId - Acting user id (recorded as revokedBy)
   * @param {Object} [options] - { isAdmin }
   * @returns {Promise<number>} Number of tokens revoked
   */
  async revokeTokensByScope(scope, reason, actorId, options = {}) {
    const where = { status: 'active' };

    if (scope.userId) {
      if (!options.isAdmin && scope.userId !== actorId) {
        throw serviceError(
          'REVOKE_NOT_AUTHORIZED',
          'Only the user themself or a system admin may bulk-revoke a user\'s tokens',
          403
        );
      }
      where.userId = scope.userId;
    } else if (scope.groupId || scope.organizationId) {
      const scopeGroupId = scope.groupId || scope.organizationId;
      if (!options.isAdmin && !(await this.isGroupAdmin(actorId, scopeGroupId))) {
        throw serviceError(
          'REVOKE_NOT_AUTHORIZED',
          'Only a group/organization admin or a system admin may bulk-revoke its tokens',
          403
        );
      }
      if (scope.groupId) {
        where.groupId = scope.groupId;
      } else {
        where.organizationId = scope.organizationId;
      }
    } else {
      throw serviceError('SCOPE_REQUIRED', 'A user, group, or organization scope is required', 400);
    }

    const affected = await Token.findAll({ where, attributes: ['id'] });
    if (affected.length === 0) {
      return 0;
    }

    const [count] = await Token.update(
      {
        status: 'revoked',
        revokedAt: Date.now(),
        revokedReason: reason,
        revokedBy: actorId || null
      },
      { where }
    );

    // Best-effort cache invalidation (DB rows are the source of truth).
    await Promise.all(
      affected.map(async (t) => {
        try {
          await redisClient.del(`token:validation:${t.id}`);
        } catch (cacheError) {
          logger.warn('Token cache invalidation failed during bulk revoke', {
            tokenId: t.id,
            error: cacheError.message
          });
        }
      })
    );

    await AuditLog.log({
      userId: actorId,
      action: 'token.revoke.bulk',
      resourceType: 'token',
      status: 'success',
      severity: 'warning',
      message: `Bulk token revocation (${count} token(s)): ${reason}`,
      details: { scope, reason, revokedTokenCount: count }
    });

    logger.info('Bulk token revocation complete', { scope, revokedTokenCount: count, reason });

    return count;
  }

  /**
   * Revoke ALL active tokens signed by a given certificate (revocation cascade).
   *
   * Security-critical: when a certificate is revoked, every token it signed must
   * be revoked too — otherwise a leaked/compromised signing cert keeps minting
   * trust through already-issued tokens. Called from
   * certificate.revokeCertificate and the admin revoke route.
   *
   * Best-effort cache invalidation: a Redis hiccup must not abort the bulk
   * revoke (the DB rows are the source of truth; validateToken re-reads them).
   *
   * @param {string} certificateId - Signing certificate id
   * @param {string} [reason='certificate_revoked'] - Recorded on each token
   * @param {Object} [options] - Reserved for future use
   * @returns {Promise<number>} Number of tokens transitioned to 'revoked'
   */
  async revokeTokensByCertificateId(certificateId, reason = 'certificate_revoked', options = {}) {
    // Collect affected ids first so their validation caches can be cleared.
    const affected = await Token.findAll({
      where: { certificateId, status: 'active' },
      attributes: ['id']
    });

    if (affected.length === 0) {
      return 0;
    }

    const [count] = await Token.update(
      {
        status: 'revoked',
        revokedAt: Date.now(),
        revokedReason: reason,
        revokedBy: options.revokedBy || null
      },
      {
        where: { certificateId, status: 'active' }
      }
    );

    // Invalidate each token's validation cache (mirror revokeToken). Best-effort.
    await Promise.all(
      affected.map(async (t) => {
        try {
          await redisClient.del(`token:validation:${t.id}`);
        } catch (cacheError) {
          logger.warn('Token cache invalidation failed during cascade', {
            tokenId: t.id,
            error: cacheError.message
          });
        }
      })
    );

    logger.info('Token revocation cascade complete', {
      certificateId,
      revokedTokenCount: count,
      reason
    });

    return count;
  }

  /**
   * List tokens for user (or, when userId is null, by scope filters only —
   * callers are responsible for authorizing scope-wide listings).
   */
  async listTokens(userId, filters = {}) {
    const where = {};
    if (userId) where.userId = userId;

    if (filters.status) where.status = filters.status;
    if (filters.resourceType) where.resourceType = filters.resourceType;
    if (filters.expiryType) where.expiryType = filters.expiryType;
    if (filters.groupId) where.groupId = filters.groupId;
    if (filters.organizationId) where.organizationId = filters.organizationId;
    if (filters.certificateId) where.certificateId = filters.certificateId;

    return await Token.findAll({
      where,
      include: [
        { association: 'certificate', attributes: ['id', 'commonName', 'serialNumber', 'status'] },
        { association: 'group', attributes: ['id', 'name', 'type'] },
        { association: 'organization', attributes: ['id', 'name', 'type'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: filters.limit || 50
    });
  }

  /**
   * Refresh token expiration
   * Only applies to time-based tokens
   */
  async refreshToken(tokenId, newExpiresAt, userId = null, options = {}) {
    try {
      logger.info('Refreshing token...', { tokenId, userId });

      const where = { id: tokenId };
      if (userId && !options.isAdmin) {
        where.userId = userId;
      }

      const token = await Token.findOne({ where });
      if (!token) {
        throw serviceError('TOKEN_NOT_FOUND', 'Token not found', 404);
      }

      if (token.status !== 'active') {
        throw serviceError('TOKEN_NOT_ACTIVE', `Cannot refresh ${token.status} token`, 400);
      }

      if (token.expiryType !== 'time') {
        throw serviceError('TOKEN_NOT_REFRESHABLE', 'Can only refresh time-based tokens', 400);
      }

      // Update expiration
      token.expiresAt = newExpiresAt;
      await token.save();

      // Audit log
      await AuditLog.log({
        userId,
        action: 'token.refresh',
        resourceType: 'token',
        resourceId: token.id,
        status: 'success',
        severity: 'info',
        message: 'Token expiration refreshed',
        details: {
          tokenId: token.id,
          oldExpiresAt: token.expiresAt,
          newExpiresAt
        }
      });

      logger.info('Token refreshed successfully', {
        tokenId: token.id,
        newExpiresAt
      });

      return token;
    } catch (error) {
      logger.error('Failed to refresh token:', error);

      await AuditLog.log({
        userId,
        action: 'token.refresh',
        resourceType: 'token',
        resourceId: tokenId,
        status: 'error',
        severity: 'error',
        message: `Failed to refresh token: ${error.message}`,
        details: { error: error.message }
      });

      throw error;
    }
  }

  /**
   * Introspect token (get metadata without signature)
   * Returns token information for debugging/monitoring
   * Scoped to the owning user unless options.isAdmin is true
   */
  async introspectToken(tokenId, options = {}) {
    try {
      logger.info('Introspecting token...', { tokenId });

      const where = { id: tokenId };
      if (options.userId && !options.isAdmin) {
        where.userId = options.userId;
      }

      const token = await Token.findOne({
        where,
        include: [
          {
            association: 'certificate',
            attributes: ['id', 'commonName', 'serialNumber', 'status', 'notBefore', 'notAfter']
          },
          {
            association: 'user',
            attributes: ['id', 'email', 'username']
          },
          { association: 'group', attributes: ['id', 'name', 'type'] },
          { association: 'organization', attributes: ['id', 'name', 'type'] }
        ]
      });

      if (!token) {
        throw serviceError('TOKEN_NOT_FOUND', 'Token not found', 404);
      }

      // Build introspection response
      const introspection = {
        id: token.id,
        version: token.version,
        active: token.status === 'active',
        status: token.status,
        issuer: {
          domain: config.ca.domain,
          certificateSerial: token.certificate?.serialNumber
        },
        subject: {
          userId: token.userId,
          email: token.user?.email,
          username: token.user?.username
        },
        permissions: token.getPermissions(),
        resource: {
          type: token.resourceType,
          value: token.resourceValue
        },
        expiryType: token.expiryType,
        issuedAt: token.issuedAt,
        notBefore: token.notBefore,
        expiresAt: token.expiresAt,
        lastUsedAt: token.lastUsedAt,
        useCount: token.useCount,
        createdAt: token.createdAt,
        updatedAt: token.updatedAt
      };

      // Add expiry-specific fields
      if (token.expiryType === 'time') {
        introspection.isExpired = Date.now() >= token.expiresAt;
        introspection.timeRemaining = Math.max(0, token.expiresAt - Date.now());
      } else if (token.expiryType === 'use') {
        introspection.usesRemaining = token.usesRemaining;
        introspection.maxUses = token.maxUses;
        introspection.isExhausted = token.usesRemaining <= 0;
      }

      // Add revocation info if revoked
      if (token.status === 'revoked') {
        introspection.revokedAt = token.revokedAt;
        introspection.revokedReason = token.revokedReason;
        introspection.revokedBy = token.revokedBy;
      }

      // Add scope info (v1.1)
      if (token.groupId || token.organizationId) {
        introspection.scope = {
          groupId: token.groupId,
          group: token.group ? { id: token.group.id, name: token.group.name, type: token.group.type } : undefined,
          organizationId: token.organizationId,
          organization: token.organization
            ? { id: token.organization.id, name: token.organization.name, type: token.organization.type }
            : undefined
        };
      }

      // Add certificate status
      if (token.certificate) {
        introspection.certificate = {
          id: token.certificate.id,
          commonName: token.certificate.commonName,
          serialNumber: token.certificate.serialNumber,
          status: token.certificate.status,
          notBefore: token.certificate.notBefore,
          notAfter: token.certificate.notAfter
        };
      }

      logger.info('Token introspected', { tokenId });

      return introspection;
    } catch (error) {
      logger.error('Failed to introspect token:', error);
      throw error;
    }
  }
}

module.exports = new TokenService();
