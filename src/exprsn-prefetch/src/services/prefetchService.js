/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Prefetch - Prefetch Service
 * ═══════════════════════════════════════════════════════════════════════
 */

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const RedisCache = require('../cache/redis');
const metricsService = require('./metricsService');

// Initialize cache tiers
const hotCache = new RedisCache('hot');
const warmCache = new RedisCache('warm');

/**
 * Prefetch timeline for a user
 */
async function prefetchTimeline(userId, priority = 'medium') {
  const startTime = Date.now();

  try {
    logger.info(`Starting prefetch for user ${userId} (priority: ${priority})`);

    // Check if already cached in hot tier
    const hotCached = await hotCache.exists(userId);
    if (hotCached) {
      logger.info(`Timeline already cached in hot tier for user ${userId}`);
      return { success: true, cached: true, tier: 'hot' };
    }

    // Fetch timeline from timeline service
    const timeline = await fetchTimelineFromService(userId);

    if (!timeline) {
      throw new Error('Failed to fetch timeline');
    }

    // Determine cache tier based on priority
    const cache = priority === 'high' ? hotCache : warmCache;
    const tier = priority === 'high' ? 'hot' : 'warm';

    // Store in cache
    await cache.set(userId, {
      posts: timeline.posts,
      fetchedAt: Date.now(),
      postsCount: timeline.posts.length
    });

    const duration = Date.now() - startTime;
    logger.info(`Prefetch completed for user ${userId} in ${duration}ms (${tier} tier)`);

    // Record metrics
    await metricsService.recordPrefetchDuration(userId, duration, tier);

    return {
      success: true,
      cached: false,
      tier,
      postsCount: timeline.posts.length,
      duration
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Prefetch failed for user ${userId} after ${duration}ms:`, error);

    // Record error metric
    await metricsService.recordPrefetchError(userId, error.message);

    return {
      success: false,
      error: error.message,
      duration
    };
  }
}

/**
 * Fetch timeline from timeline service
 */
async function fetchTimelineFromService(userId) {
  const { getServiceToken, clearServiceToken } = require('../utils/caClient');

  try {
    // Get service-to-service CA token
    const token = await getServiceToken('timeline');

    const response = await axios.get(
      `${config.services.timeline}/api/timeline/user/${userId}`,
      {
        params: {
          limit: config.performance.maxTimelineSize
        },
        headers: {
          'Authorization': `Bearer ${token}`
        },
        timeout: config.performance.prefetchTimeout
      }
    );

    return response.data;
  } catch (error) {
    // If error is auth-related, clear cached token and retry once
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      logger.warn(`Auth error fetching timeline for user ${userId}, clearing token cache`);
      clearServiceToken();

      // Retry once with fresh token
      try {
        const token = await getServiceToken('timeline');
        const response = await axios.get(
          `${config.services.timeline}/api/timeline/user/${userId}`,
          {
            params: {
              limit: config.performance.maxTimelineSize
            },
            headers: {
              'Authorization': `Bearer ${token}`
            },
            timeout: config.performance.prefetchTimeout
          }
        );
        return response.data;
      } catch (retryError) {
        logger.error(`Retry failed for user ${userId}:`, retryError.message);
        return null;
      }
    }

    logger.error(`Error fetching timeline for user ${userId}:`, error.message);
    return null;
  }
}

/**
 * Get cached timeline
 */
async function getCachedTimeline(userId) {
  try {
    // Try hot cache first
    let timeline = await hotCache.get(userId);
    if (timeline) {
      await metricsService.recordCacheHit('hot', userId);
      return { ...timeline, tier: 'hot' };
    }

    // Try warm cache
    timeline = await warmCache.get(userId);
    if (timeline) {
      await metricsService.recordCacheHit('warm', userId);
      return { ...timeline, tier: 'warm' };
    }

    // Record cache miss
    await metricsService.recordCacheMiss(userId);
    return null;
  } catch (error) {
    logger.error(`Error getting cached timeline for user ${userId}:`, error);
    return null;
  }
}

/**
 * Invalidate cached timeline
 */
async function invalidateTimeline(userId) {
  try {
    await Promise.all([
      hotCache.delete(userId),
      warmCache.delete(userId)
    ]);

    logger.info(`Invalidated cache for user ${userId}`);
    return { success: true };
  } catch (error) {
    logger.error(`Error invalidating cache for user ${userId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Check cache status for user
 */
async function getCacheStatus(userId) {
  try {
    const [hotExists, warmExists] = await Promise.all([
      hotCache.exists(userId),
      warmCache.exists(userId)
    ]);

    let tier = null;
    let ttl = null;

    if (hotExists) {
      tier = 'hot';
      ttl = await hotCache.getTTL(userId);
    } else if (warmExists) {
      tier = 'warm';
      ttl = await warmCache.getTTL(userId);
    }

    return {
      cached: hotExists || warmExists,
      tier,
      ttl,
      expiresIn: ttl > 0 ? ttl * 1000 : null
    };
  } catch (error) {
    logger.error(`Error checking cache status for user ${userId}:`, error);
    return { cached: false, error: error.message };
  }
}

module.exports = {
  prefetchTimeline,
  getCachedTimeline,
  invalidateTimeline,
  getCacheStatus
};
