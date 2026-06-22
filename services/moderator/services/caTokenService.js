/**
 * ═══════════════════════════════════════════════════════════
 * CA Token Service
 * Handles communication with Exprsn CA for token generation
 * and validation for inter-service authentication
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const logger = require('../src/utils/logger');

const CA_SERVICE_URL = process.env.CA_SERVICE_URL || 'http://localhost:3000';
const MODERATOR_CERT_ID = process.env.MODERATOR_CERTIFICATE_ID;

class CATokenService {
  constructor() {
    this.tokenCache = new Map();
    this.tokenExpiryBuffer = 60000; // Refresh 60s before expiry
  }

  /**
   * Generate a CA token for inter-service communication
   * @param {Object} options - Token generation options
   * @returns {Promise<string>} CA token
   */
  async generateServiceToken(options = {}) {
    try {
      const cacheKey = this._getCacheKey(options);

      // Check cache for valid token
      const cached = this.tokenCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now() + this.tokenExpiryBuffer) {
        logger.debug('Using cached CA token', { cacheKey });
        return cached.token;
      }

      logger.info('Generating new CA token', {
        certificateId: MODERATOR_CERT_ID,
        resource: options.resource
      });

      const response = await axios.post(
        `${CA_SERVICE_URL}/api/tokens/generate`,
        {
          certificateId: MODERATOR_CERT_ID,
          permissions: options.permissions || {
            read: true,
            write: true,
            append: true
          },
          resourceType: options.resourceType || 'url',
          resourceValue: options.resourceValue || '*',
          expiryType: options.expiryType || 'time',
          expirySeconds: options.expirySeconds || 3600 // 1 hour default
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this._getMasterToken()}`
          },
          timeout: 10000
        }
      );

      const token = response.data.token;
      const tokenData = response.data.tokenData;

      // Cache the token
      this.tokenCache.set(cacheKey, {
        token: token,
        expiresAt: tokenData.expiresAt || (Date.now() + 3600000)
      });

      logger.info('CA token generated successfully', {
        tokenId: tokenData.id,
        expiresAt: new Date(tokenData.expiresAt).toISOString()
      });

      return token;

    } catch (error) {
      logger.error('Failed to generate CA token', {
        error: error.message,
        certificateId: MODERATOR_CERT_ID
      });

      // Fallback to service token if available
      const fallbackToken = process.env.MODERATOR_SERVICE_TOKEN;
      if (fallbackToken) {
        logger.warn('Using fallback service token');
        return fallbackToken;
      }

      throw new Error(`CA token generation failed: ${error.message}`);
    }
  }

  /**
   * Validate a CA token
   * @param {string} token - Token to validate
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Validation result
   */
  async validateToken(token, options = {}) {
    try {
      const response = await axios.post(
        `${CA_SERVICE_URL}/api/tokens/validate`,
        {
          token: token,
          requiredPermission: options.requiredPermission,
          resourceValue: options.resourceValue
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 5000
        }
      );

      return {
        valid: response.data.valid,
        tokenData: response.data.tokenData,
        error: response.data.error
      };

    } catch (error) {
      logger.error('Token validation failed', {
        error: error.message
      });

      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Generate a token for a specific service
   * @param {string} serviceName - Name of target service
   * @returns {Promise<string>} Service token
   */
  async generateTokenForService(serviceName) {
    const serviceUrls = {
      timeline: process.env.TIMELINE_SERVICE_URL || 'http://localhost:3004',
      spark: process.env.SPARK_SERVICE_URL || 'http://localhost:3002',
      nexus: process.env.NEXUS_SERVICE_URL || 'http://localhost:3011',
      filevault: process.env.FILEVAULT_SERVICE_URL || 'http://localhost:3007',
      herald: process.env.HERALD_SERVICE_URL || 'http://localhost:3014'
    };

    const serviceUrl = serviceUrls[serviceName];
    if (!serviceUrl) {
      throw new Error(`Unknown service: ${serviceName}`);
    }

    return this.generateServiceToken({
      resourceType: 'url',
      resourceValue: `${serviceUrl}/*`,
      permissions: { read: true, write: true, append: true },
      expirySeconds: 3600
    });
  }

  /**
   * Refresh an expiring token
   * @param {string} oldToken - Token to refresh
   * @returns {Promise<string>} New token
   */
  async refreshToken(oldToken) {
    try {
      const response = await axios.post(
        `${CA_SERVICE_URL}/api/tokens/refresh`,
        { token: oldToken },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this._getMasterToken()}`
          },
          timeout: 10000
        }
      );

      return response.data.token;

    } catch (error) {
      logger.error('Token refresh failed', { error: error.message });

      // Generate new token instead
      return this.generateServiceToken();
    }
  }

  /**
   * Clear token cache
   */
  clearCache() {
    this.tokenCache.clear();
    logger.info('CA token cache cleared');
  }

  /**
   * Get cache key for token options
   */
  _getCacheKey(options) {
    return `${options.resourceType || 'url'}:${options.resourceValue || '*'}`;
  }

  /**
   * Get master service token for CA authentication
   */
  _getMasterToken() {
    // In production, this would be a long-lived certificate-based token
    // stored securely in environment variables or secrets management
    return process.env.MODERATOR_MASTER_TOKEN || process.env.MODERATOR_SERVICE_TOKEN;
  }

  /**
   * Schedule automatic token refresh
   */
  scheduleTokenRefresh(intervalMs = 300000) { // 5 minutes
    setInterval(() => {
      this._refreshExpiredTokens();
    }, intervalMs);
  }

  /**
   * Refresh tokens that are about to expire
   */
  async _refreshExpiredTokens() {
    const now = Date.now();
    const expiredKeys = [];

    for (const [key, value] of this.tokenCache.entries()) {
      if (value.expiresAt <= now + this.tokenExpiryBuffer) {
        expiredKeys.push(key);
      }
    }

    if (expiredKeys.length > 0) {
      logger.info('Refreshing expired tokens', { count: expiredKeys.length });

      for (const key of expiredKeys) {
        try {
          const [resourceType, resourceValue] = key.split(':');
          await this.generateServiceToken({ resourceType, resourceValue });
        } catch (error) {
          logger.error('Failed to refresh token', { key, error: error.message });
        }
      }
    }
  }
}

// Export singleton instance
module.exports = new CATokenService();
