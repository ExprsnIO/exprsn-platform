/**
 * ═══════════════════════════════════════════════════════════
 * Prefetch Service Integration
 * Timeline caching and prefetching for improved performance
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Create Prefetch service client
 */
const prefetchClient = axios.create({
  baseURL: config.prefetch?.url || process.env.PREFETCH_SERVICE_URL || 'http://localhost:3005',
  timeout: config.prefetch?.timeout || 5000,
  headers: {
    'Content-Type': 'application/json'
  }
});

/**
 * Invalidate cached timeline for user
 *
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Invalidation result
 */
async function invalidateUserTimeline(userId) {
  if (!config.prefetch?.enabled) {
    logger.debug('Prefetch service disabled, skipping cache invalidation', { userId });
    return { success: false, reason: 'Prefetch service disabled' };
  }

  try {
    logger.debug('Invalidating user timeline cache', { userId });

    const response = await prefetchClient.post('/api/cache/invalidate', {
      userId,
      type: 'timeline'
    });

    logger.info('Timeline cache invalidated', {
      userId,
      invalidated: response.data.invalidated
    });

    return {
      success: true,
      invalidated: response.data.invalidated
    };
  } catch (error) {
    logger.error('Failed to invalidate timeline cache', {
      userId,
      error: error.message,
      status: error.response?.status
    });

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Prefetch timeline for user
 *
 * @param {string} userId - User ID
 * @param {Object} options - Prefetch options
 * @returns {Promise<Object>} - Prefetch result
 */
async function prefetchTimeline(userId, options = {}) {
  if (!config.prefetch?.enabled) {
    return { success: false, reason: 'Prefetch service disabled' };
  }

  try {
    const payload = {
      userId,
      limit: options.limit || 20,
      priority: options.priority || 'normal'
    };

    logger.debug('Requesting timeline prefetch', { userId });

    const response = await prefetchClient.post('/api/prefetch/timeline', payload);

    logger.info('Timeline prefetch initiated', {
      userId,
      jobId: response.data.jobId
    });

    return {
      success: true,
      jobId: response.data.jobId,
      status: response.data.status
    };
  } catch (error) {
    logger.error('Failed to prefetch timeline', {
      userId,
      error: error.message
    });

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get cached timeline for user
 *
 * @param {string} userId - User ID
 * @param {Object} options - Options
 * @returns {Promise<Object>} - Cached timeline or null
 */
async function getCachedTimeline(userId, options = {}) {
  if (!config.prefetch?.enabled) {
    return null;
  }

  try {
    const response = await prefetchClient.get('/api/cache/timeline', {
      params: {
        userId,
        limit: options.limit || 20,
        cursor: options.cursor
      }
    });

    if (response.data.cached) {
      logger.debug('Timeline cache hit', { userId });
      return response.data.timeline;
    }

    logger.debug('Timeline cache miss', { userId });
    return null;
  } catch (error) {
    logger.error('Failed to get cached timeline', {
      userId,
      error: error.message
    });
    return null;
  }
}

/**
 * Warm cache for multiple users
 *
 * @param {Array<string>} userIds - User IDs
 * @returns {Promise<Object>} - Warm cache result
 */
async function warmCache(userIds) {
  if (!config.prefetch?.enabled) {
    return { success: false, reason: 'Prefetch service disabled' };
  }

  try {
    const response = await prefetchClient.post('/api/cache/warm', {
      userIds,
      type: 'timeline'
    });

    logger.info('Cache warming initiated', {
      userCount: userIds.length,
      jobId: response.data.jobId
    });

    return {
      success: true,
      jobId: response.data.jobId
    };
  } catch (error) {
    logger.error('Failed to warm cache', {
      userCount: userIds.length,
      error: error.message
    });

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check Prefetch service health
 *
 * @returns {Promise<Object>} - Health check result
 */
async function checkHealth() {
  try {
    const response = await prefetchClient.get('/health', {
      timeout: 3000
    });

    return {
      status: 'connected',
      healthy: response.status === 200,
      data: response.data
    };
  } catch (error) {
    return {
      status: 'disconnected',
      healthy: false,
      error: error.message
    };
  }
}

module.exports = {
  invalidateUserTimeline,
  prefetchTimeline,
  getCachedTimeline,
  warmCache,
  checkHealth
};
