/**
 * ═══════════════════════════════════════════════════════════
 * Prefetch Service Integration
 * Timeline caching and prefetching for improved performance
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const { getInternalHttpsAgent } = require('@exprsn/shared/utils/httpAgent');

/**
 * Create Prefetch service client
 */
const prefetchClient = axios.create({
  baseURL: config.prefetch?.url || process.env.PREFETCH_SERVICE_URL || 'http://localhost:3005',
  timeout: config.prefetch?.timeout || 5000,
  httpsAgent: getInternalHttpsAgent(),
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

    // prefetch exposes DELETE /api/cache/:userId/timeline
    await prefetchClient.delete(`/api/cache/${userId}/timeline`);

    logger.info('Timeline cache invalidated', { userId });

    return {
      success: true,
      invalidated: true
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
    logger.debug('Requesting timeline prefetch', { userId });

    // prefetch exposes POST /api/prefetch/schedule/:userId (queued, returns jobId)
    const response = await prefetchClient.post(`/api/prefetch/schedule/${userId}`, {
      priority: options.priority || 'medium'
    });

    logger.info('Timeline prefetch initiated', {
      userId,
      jobId: response.data.data?.jobId
    });

    return {
      success: true,
      jobId: response.data.data?.jobId,
      status: response.data.success ? 'scheduled' : 'failed'
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
    // prefetch exposes GET /api/cache/:userId (404 when not cached)
    const response = await prefetchClient.get(`/api/cache/${userId}`);

    if (response.data?.data) {
      logger.debug('Timeline cache hit', { userId });
      return response.data.data;
    }

    logger.debug('Timeline cache miss', { userId });
    return null;
  } catch (error) {
    // 404 = not cached; treat as a miss rather than an error
    if (error.response?.status === 404) {
      logger.debug('Timeline cache miss', { userId });
      return null;
    }
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
    // prefetch has no batch warm endpoint; schedule a low-priority job per user.
    const results = await Promise.allSettled(
      userIds.map((userId) =>
        prefetchClient.post(`/api/prefetch/schedule/${userId}`, { priority: 'low' })
      )
    );

    const scheduled = results.filter((r) => r.status === 'fulfilled').length;

    logger.info('Cache warming initiated', {
      userCount: userIds.length,
      scheduled
    });

    return {
      success: true,
      scheduled
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
