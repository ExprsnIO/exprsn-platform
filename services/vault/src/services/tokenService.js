/**
 * Token Service
 * Manages Vault token lifecycle with CA/Auth integration
 */

const crypto = require('crypto');
const { VaultToken, AccessPolicy, TokenBinding } = require('../models');
const { serviceRequest, logger } = require('@exprsn/shared');
const auditService = require('./auditService');
const redisCache = require('./redisCache');

// Socket.IO will be injected after initialization
let socketService = null;
const getSocketService = () => {
  if (!socketService) {
    try {
      socketService = require('./socketService');
    } catch (error) {
      // Socket service not yet initialized
    }
  }
  return socketService;
};

class TokenService {
  /**
   * Generate a new Vault token
   * @param {Object} params - Token parameters
   * @returns {Object} Token data with actual token value
   */
  async generateToken(params, actor) {
    const startTime = Date.now();

    try {
      const {
        displayName,
        description,
        entityType,
        entityId,
        permissions = {},
        pathPrefixes = [],
        ipWhitelist = [],
        expiresAt,
        maxUses,
        policyIds = [],
        caIntegration = true,
        authSessionId,
        metadata = {}
      } = params;

      // Generate token value and ID
      const tokenValue = this._generateTokenValue();
      const tokenId = `vt_${crypto.randomBytes(16).toString('hex')}`;
      const tokenHash = this._hashToken(tokenValue);

      // Create CA token for integration if requested
      let caTokenId = null;
      if (caIntegration) {
        try {
          const caToken = await this._createCAToken({
            entityType,
            entityId,
            permissions,
            pathPrefixes,
            expiresAt
          });
          caTokenId = caToken.id;
        } catch (error) {
          logger.warn('Failed to create CA token', { error: error.message });
        }
      }

      // Calculate initial risk score
      const riskScore = await this._calculateRiskScore({
        entityType,
        permissions,
        pathPrefixes,
        ipWhitelist
      });

      // Create token record
      const token = await VaultToken.create({
        tokenId,
        tokenHash,
        displayName,
        description,
        entityType,
        entityId,
        createdBy: actor,
        permissions,
        pathPrefixes,
        ipWhitelist,
        expiresAt,
        maxUses,
        caTokenId,
        authSessionId,
        riskScore,
        metadata,
        status: 'active'
      });

      // Bind policies if provided
      if (policyIds.length > 0) {
        await this._bindPolicies(token.id, policyIds, actor);
      }

      // Cache the token in Redis
      await redisCache.cacheToken(tokenId, {
        id: token.id,
        tokenHash,
        permissions,
        pathPrefixes,
        ipWhitelist,
        status: 'active',
        expiresAt
      }, expiresAt);

      // Audit log
      await auditService.log({
        action: 'token_create',
        resourceType: 'vault_token',
        resourceId: token.id,
        actor,
        success: true,
        duration: Date.now() - startTime,
        metadata: {
          tokenId,
          entityType,
          entityId,
          caIntegration
        }
      });

      logger.info('Vault token created', {
        tokenId,
        entityType,
        entityId,
        actor
      });

      // Emit Socket.IO event
      const socket = getSocketService();
      if (socket) {
        socket.emitTokenCreated(token);
      }

      return {
        token: tokenValue, // ONLY returned once!
        tokenId,
        displayName,
        expiresAt,
        permissions,
        pathPrefixes
      };
    } catch (error) {
      logger.error('Failed to generate token', { error: error.message, actor });

      await auditService.log({
        action: 'token_create',
        resourceType: 'vault_token',
        actor,
        success: false,
        errorMessage: error.message,
        duration: Date.now() - startTime
      });

      throw error;
    }
  }

  /**
   * Validate a Vault token
   * @param {string} tokenValue - Token to validate
   * @param {Object} context - Request context (IP, path, etc.)
   * @returns {Object} Validation result
   */
  async validateToken(tokenValue, context = {}) {
    try {
      const tokenHash = this._hashToken(tokenValue);

      // Check Redis cache first
      const cached = await redisCache.getToken(tokenHash);
      if (cached) {
        if (cached.status !== 'active') {
          return { valid: false, reason: 'token_revoked' };
        }

        // Validate context
        const contextValid = this._validateContext(cached, context);
        if (!contextValid.valid) {
          return contextValid;
        }

        return {
          valid: true,
          tokenId: cached.tokenId,
          permissions: cached.permissions,
          entityType: cached.entityType,
          entityId: cached.entityId
        };
      }

      // Fallback to database
      const token = await VaultToken.findOne({
        where: { tokenHash },
        include: [{
          model: TokenBinding,
          as: 'bindings',
          include: [{ model: AccessPolicy, as: 'policy' }]
        }]
      });

      if (!token) {
        return { valid: false, reason: 'invalid_token' };
      }

      // Check status
      if (token.status !== 'active') {
        return { valid: false, reason: `token_${token.status}` };
      }

      // Check expiration
      if (token.expiresAt && new Date(token.expiresAt) < new Date()) {
        await this._expireToken(token);
        return { valid: false, reason: 'token_expired' };
      }

      // Check max uses
      if (token.maxUses && token.usageCount >= token.maxUses) {
        await this._expireToken(token);
        return { valid: false, reason: 'max_uses_exceeded' };
      }

      // Validate context (IP whitelist, path prefixes)
      const contextValid = this._validateContext(token, context);
      if (!contextValid.valid) {
        return contextValid;
      }

      // Update usage
      await token.update({
        usageCount: token.usageCount + 1,
        lastUsedAt: new Date(),
        lastUsedFrom: context.ip
      });

      // Cache for faster subsequent validations
      await redisCache.cacheToken(token.tokenId, {
        id: token.id,
        tokenHash: token.tokenHash,
        tokenId: token.tokenId,
        permissions: token.permissions,
        pathPrefixes: token.pathPrefixes,
        ipWhitelist: token.ipWhitelist,
        entityType: token.entityType,
        entityId: token.entityId,
        status: token.status,
        expiresAt: token.expiresAt
      }, token.expiresAt);

      return {
        valid: true,
        tokenId: token.tokenId,
        permissions: token.permissions,
        entityType: token.entityType,
        entityId: token.entityId
      };
    } catch (error) {
      logger.error('Token validation error', { error: error.message });
      return { valid: false, reason: 'validation_error' };
    }
  }

  /**
   * Revoke a token
   * @param {string} tokenId - Token ID to revoke
   * @param {string} reason - Revocation reason
   * @param {string} actor - Who is revoking
   */
  async revokeToken(tokenId, reason, actor) {
    const startTime = Date.now();

    try {
      const token = await VaultToken.findOne({ where: { tokenId } });

      if (!token) {
        throw new Error('Token not found');
      }

      await token.update({
        status: 'revoked',
        revokedAt: new Date(),
        revokedBy: actor,
        revocationReason: reason
      });

      // Remove from Redis cache
      await redisCache.removeToken(tokenId);

      // Revoke associated CA token if exists
      if (token.caTokenId) {
        await this._revokeCAToken(token.caTokenId, reason);
      }

      // Send notifications
      await this._notifyRevocation(token, reason, actor);

      await auditService.log({
        action: 'token_revoke',
        resourceType: 'vault_token',
        resourceId: token.id,
        actor,
        success: true,
        duration: Date.now() - startTime,
        metadata: { tokenId, reason }
      });

      logger.warn('Vault token revoked', { tokenId, reason, actor });

      // Emit Socket.IO event
      const socket = getSocketService();
      if (socket) {
        socket.emitTokenRevoked(token, reason, actor);
      }

      return { success: true, tokenId };
    } catch (error) {
      logger.error('Failed to revoke token', { error: error.message, tokenId, actor });
      throw error;
    }
  }

  /**
   * List tokens with filters
   */
  async listTokens(filters = {}, actor) {
    const {
      entityType,
      entityId,
      status,
      limit = 50,
      offset = 0
    } = filters;

    const where = {};
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (status) where.status = status;

    const tokens = await VaultToken.findAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      attributes: { exclude: ['tokenHash'] }
    });

    return tokens;
  }

  /**
   * Purge expired tokens from Redis and database
   */
  async purgeExpiredTokens() {
    try {
      const expiredTokens = await VaultToken.findAll({
        where: {
          status: 'active',
          expiresAt: {
            [VaultToken.sequelize.Op.lt]: new Date()
          }
        }
      });

      for (const token of expiredTokens) {
        await token.update({ status: 'expired' });
        await redisCache.removeToken(token.tokenId);
      }

      logger.info(`Purged ${expiredTokens.length} expired tokens`);
      return expiredTokens.length;
    } catch (error) {
      logger.error('Failed to purge expired tokens', { error: error.message });
      throw error;
    }
  }

  // Private helper methods

  _generateTokenValue() {
    return `hvs.${crypto.randomBytes(32).toString('base64url')}`;
  }

  _hashToken(tokenValue) {
    return crypto.createHash('sha256').update(tokenValue).digest('hex');
  }

  async _calculateRiskScore(params) {
    const { entityType, permissions, pathPrefixes, ipWhitelist } = params;

    let score = 0.0;

    // Higher risk for broader permissions
    const permCount = Object.keys(permissions).length;
    score += permCount * 0.1;

    // Higher risk for wildcard paths
    if (pathPrefixes.some(p => p.includes('*'))) {
      score += 0.2;
    }

    // Lower risk for IP whitelisting
    if (ipWhitelist.length > 0) {
      score -= 0.1;
    }

    // Higher risk for service tokens
    if (entityType === 'service') {
      score += 0.15;
    }

    return Math.max(0, Math.min(1, score));
  }

  _validateContext(token, context) {
    // Validate IP whitelist
    if (token.ipWhitelist && token.ipWhitelist.length > 0 && context.ip) {
      const ipAllowed = token.ipWhitelist.some(allowed => {
        return this._matchIP(context.ip, allowed);
      });

      if (!ipAllowed) {
        return { valid: false, reason: 'ip_not_whitelisted' };
      }
    }

    // Validate path prefixes
    if (token.pathPrefixes && token.pathPrefixes.length > 0 && context.path) {
      const pathAllowed = token.pathPrefixes.some(prefix => {
        return this._matchPath(context.path, prefix);
      });

      if (!pathAllowed) {
        return { valid: false, reason: 'path_not_allowed' };
      }
    }

    return { valid: true };
  }

  _matchIP(ip, pattern) {
    // Simple IP matching (could be enhanced with CIDR support)
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(ip);
    }
    return ip === pattern;
  }

  _matchPath(path, prefix) {
    if (prefix.endsWith('*')) {
      return path.startsWith(prefix.slice(0, -1));
    }
    return path === prefix;
  }

  async _expireToken(token) {
    await token.update({ status: 'expired' });
    await redisCache.removeToken(token.tokenId);
  }

  async _bindPolicies(tokenId, policyIds, actor) {
    const bindings = policyIds.map(policyId => ({
      tokenId,
      policyId,
      boundBy: actor,
      status: 'active'
    }));

    await TokenBinding.bulkCreate(bindings);
  }

  async _createCAToken(params) {
    // Integrate with CA service to create token
    try {
      const response = await serviceRequest({
        method: 'POST',
        url: 'http://localhost:3000/api/tokens/generate',
        data: {
          resource: params.pathPrefixes.join(',') || '/*',
          permissions: params.permissions,
          expiresAt: params.expiresAt
        },
        serviceName: 'exprsn-vault',
        permissions: { write: true }
      });

      return response.data.data;
    } catch (error) {
      logger.error('CA token creation failed', { error: error.message });
      throw error;
    }
  }

  async _revokeCAToken(caTokenId, reason) {
    try {
      await serviceRequest({
        method: 'POST',
        url: `http://localhost:3000/api/tokens/${caTokenId}/revoke`,
        data: { reason },
        serviceName: 'exprsn-vault',
        permissions: { write: true }
      });
    } catch (error) {
      logger.error('CA token revocation failed', { error: error.message });
    }
  }

  async _notifyRevocation(token, reason, actor) {
    // Send Herald notification
    try {
      await serviceRequest({
        method: 'POST',
        url: 'http://localhost:3014/api/notifications/send',
        data: {
          type: 'vault_token_revoked',
          recipient: token.entityId,
          data: {
            tokenId: token.tokenId,
            displayName: token.displayName,
            reason,
            revokedBy: actor
          }
        },
        serviceName: 'exprsn-vault',
        permissions: { write: true }
      });
    } catch (error) {
      logger.warn('Herald notification failed', { error: error.message });
    }

    // Send Bridge event
    try {
      await serviceRequest({
        method: 'POST',
        url: 'http://localhost:3003/api/events/publish',
        data: {
          topic: 'vault.token.revoked',
          payload: {
            tokenId: token.tokenId,
            entityType: token.entityType,
            entityId: token.entityId,
            reason,
            revokedBy: actor,
            timestamp: new Date().toISOString()
          }
        },
        serviceName: 'exprsn-vault',
        permissions: { write: true }
      });
    } catch (error) {
      logger.warn('Bridge event failed', { error: error.message });
    }
  }
}

module.exports = new TokenService();
