/**
 * ═══════════════════════════════════════════════════════════════════════
 * Token Service - Implementation of Exprsn CA Token Specification v1.0
 * See: TOKEN_SPECIFICATION_V1.0.md
 * ═══════════════════════════════════════════════════════════════════════
 */

const { Token, Certificate, AuditLog } = require('../models');
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

class TokenService {
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
        const expirySeconds = params.expirySeconds || config.token.defaults.expirySeconds;
        expiresAt = issuedAt + (expirySeconds * 1000);
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
        tokenForVerification.usesRemaining = token.usesRemaining;
        tokenForVerification.maxUses = token.maxUses;
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
          permissions: token.getPermissions(),
          resource: {
            [token.resourceType]: token.resourceValue
          },
          expiryType: token.expiryType,
          expiresAt: token.expiresAt,
          usesRemaining: token.usesRemaining,
          useCount: token.useCount,
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
   * Revoke token
   * Scoped to the owning user unless options.isAdmin is true
   */
  async revokeToken(tokenId, reason, userId = null, options = {}) {
    const where = { id: tokenId };
    if (userId && !options.isAdmin) {
      where.userId = userId;
    }

    const token = await Token.findOne({ where });
    if (!token) {
      throw serviceError('TOKEN_NOT_FOUND', 'Token not found', 404);
    }

    token.status = 'revoked';
    token.revokedAt = Date.now();
    token.revokedReason = reason;
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
      details: { tokenId: token.id, reason }
    });

    return token;
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
        revokedReason: reason
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
   * List tokens for user
   */
  async listTokens(userId, filters = {}) {
    const where = { userId };

    if (filters.status) where.status = filters.status;
    if (filters.resourceType) where.resourceType = filters.resourceType;
    if (filters.expiryType) where.expiryType = filters.expiryType;

    return await Token.findAll({
      where,
      include: [{ association: 'certificate', attributes: ['id', 'commonName', 'serialNumber'] }],
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
          }
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
