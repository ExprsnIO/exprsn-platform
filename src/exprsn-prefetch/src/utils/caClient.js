/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Prefetch - CA Token Client
 * Service-to-service CA token management using @exprsn/shared utilities
 * ═══════════════════════════════════════════════════════════════════════
 */

const { ServiceTokenCache } = require('@exprsn/shared');
const axios = require('axios');
const config = require('../config');
const logger = require('./logger');

// Use shared library's token cache
const tokenCache = new ServiceTokenCache();

/**
 * Get service-to-service CA token
 * Automatically caches and refreshes tokens using ServiceTokenCache
 * @param {string} targetService - Target service name (timeline, auth, etc.)
 * @param {Object} permissions - Permissions object (default: { read: true })
 * @returns {Promise<string>} CA token string
 */
async function getServiceToken(targetService = 'timeline', permissions = { read: true }) {
  try {
    // Create cache key based on service and permissions
    const cacheKey = `${targetService}:${JSON.stringify(permissions)}`;

    // Use ServiceTokenCache to get or generate token
    const token = await tokenCache.getOrGenerate(cacheKey, async () => {
      logger.info(`Generating new service token for ${targetService}`, { permissions });

      const caUrl = process.env.CA_URL || 'http://localhost:3000';
      const serviceUrl = config.services[targetService];

      if (!serviceUrl) {
        throw new Error(`Unknown service: ${targetService}`);
      }

      // Request service token from CA
      const response = await axios.post(
        `${caUrl}/api/tokens/service`,
        {
          serviceId: 'prefetch',
          targetService,
          permissions,
          resourceType: 'url',
          resourceValue: `${serviceUrl}/*`,
          expirySeconds: 3600 // 1 hour
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.SERVICE_CERTIFICATE_TOKEN}`,
            'Content-Type': 'application/json'
          },
          timeout: 5000
        }
      );

      if (!response.data || !response.data.token) {
        throw new Error('Invalid response from CA service');
      }

      logger.info(`Service token obtained successfully for ${targetService}`, {
        tokenId: response.data.token.id || 'unknown'
      });

      return response.data.token;
    });

    // Return token as string (handle both string and object tokens)
    return typeof token === 'string' ? token : JSON.stringify(token);

  } catch (error) {
    logger.error(`Failed to obtain service token for ${targetService}`, {
      error: error.message,
      stack: error.stack
    });

    throw new Error(`Failed to obtain CA token: ${error.message}`);
  }
}

/**
 * Clear cached service token for a specific service
 * @param {string} targetService - Target service name
 * @param {Object} permissions - Permissions object
 */
function clearServiceToken(targetService = null, permissions = null) {
  if (targetService && permissions) {
    const cacheKey = `${targetService}:${JSON.stringify(permissions)}`;
    // Note: ServiceTokenCache doesn't have individual clear, so we clear all
    tokenCache.clear();
    logger.info('Service token cache cleared', { targetService });
  } else {
    tokenCache.clear();
    logger.info('All service token caches cleared');
  }
}

/**
 * Clean up token cache on shutdown
 */
function destroyTokenCache() {
  tokenCache.destroy();
  logger.info('Token cache destroyed');
}

module.exports = {
  getServiceToken,
  clearServiceToken,
  destroyTokenCache
};
