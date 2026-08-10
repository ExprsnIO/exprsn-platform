/**
 * ═══════════════════════════════════════════════════════════════════════
 * Token Service - CA Token Validation
 * See: TOKEN_SPECIFICATION_V1.0.md Section 9
 * ═══════════════════════════════════════════════════════════════════════
 */

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const crypto = require('crypto');
const fs = require('fs');

class TokenService {
  constructor() {
    this.caServiceUrl = config.ca.caServiceUrl;
    this.rootCert = null;
    this.cache = new Map(); // Simple in-memory cache
  }

  /**
   * Load CA root certificate
   */
  loadRootCert() {
    if (!this.rootCert && fs.existsSync(config.ca.rootCertPath)) {
      this.rootCert = fs.readFileSync(config.ca.rootCertPath, 'utf8');
      logger.info('CA root certificate loaded');
    }
    return this.rootCert;
  }

  /**
   * Validate CA token
   * @param {string} token - Token to validate
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Validation result
   */
  async validateToken(token, options = {}) {
    try {
      const {
        requiredPermissions = {},
        resource = null,
        action = null
      } = options;

      // Check cache first
      const cacheKey = `${token}:${JSON.stringify(options)}`;
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (cached.expiresAt > Date.now()) {
          logger.debug('Token validation - cache hit');
          return cached.result;
        }
        this.cache.delete(cacheKey);
      }

      // Call CA service to validate token
      const response = await axios.post(
        `${this.caServiceUrl}/api/tokens/validate`,
        {
          token,
          requiredPermissions,
          resource,
          action
        },
        {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      const result = response.data;

      if (!result.valid) {
        logger.warn('Token validation failed', {
          reason: result.reason,
          resource
        });
        return {
          valid: false,
          reason: result.reason || 'INVALID_TOKEN',
          error: result.error
        };
      }

      // Cache successful validation
      const cacheEntry = {
        result,
        expiresAt: Date.now() + (config.redis.ttl * 1000)
      };
      this.cache.set(cacheKey, cacheEntry);

      // Clean cache periodically
      if (this.cache.size > 1000) {
        this.cleanCache();
      }

      logger.info('Token validated successfully', {
        userId: result.token?.userId,
        resource
      });

      return result;

    } catch (error) {
      logger.error('Token validation error:', {
        error: error.message,
        resource: options.resource
      });

      // If CA service is unavailable, fail closed (reject token)
      return {
        valid: false,
        reason: 'VALIDATION_ERROR',
        error: error.message
      };
    }
  }

  /**
   * Extract token from request
   * @param {Object} req - Express request object
   * @returns {string|null} Token or null
   */
  extractToken(req) {
    // Check Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check query parameter
    if (req.query.token) {
      return req.query.token;
    }

    // Check cookie
    if (req.cookies && req.cookies.caToken) {
      return req.cookies.caToken;
    }

    return null;
  }

  /**
   * Generate a new token via CA service
   * @param {Object} params - Token parameters
   * @returns {Promise<Object>} Generated token
   */
  async generateToken(params) {
    try {
      const response = await axios.post(
        `${this.caServiceUrl}/api/tokens/generate`,
        {
          certificateId: config.ca.certificateSerial,
          ...params
        },
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.ca.certificateSerial}` // Service authentication
          }
        }
      );

      logger.info('Token generated', {
        tokenId: response.data.token.id,
        permissions: params.permissions
      });

      return response.data;

    } catch (error) {
      logger.error('Token generation error:', error);
      throw new Error('Failed to generate token: ' + error.message);
    }
  }

  /**
   * Revoke a token via CA service
   * @param {string} tokenId - Token ID to revoke
   * @param {string} reason - Revocation reason
   * @returns {Promise<boolean>}
   */
  async revokeToken(tokenId, reason) {
    try {
      await axios.post(
        `${this.caServiceUrl}/api/tokens/${tokenId}/revoke`,
        { reason },
        {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('Token revoked', { tokenId, reason });
      return true;

    } catch (error) {
      logger.error('Token revocation error:', error);
      return false;
    }
  }

  /**
   * Clean expired cache entries
   */
  cleanCache() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
    logger.debug('Token cache cleaned', { size: this.cache.size });
  }

  /**
   * Check permissions
   * @param {Object} token - Validated token
   * @param {Object} required - Required permissions
   * @returns {boolean}
   */
  hasPermissions(token, required) {
    if (!token || !token.permissions) {
      return false;
    }

    for (const [permission, value] of Object.entries(required)) {
      if (value && !token.permissions[permission]) {
        return false;
      }
    }

    return true;
  }
}

// Singleton instance
const tokenService = new TokenService();

module.exports = tokenService;
