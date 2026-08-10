/**
 * ═══════════════════════════════════════════════════════════
 * Cache Middleware
 * Intelligent request/response caching with invalidation
 * ═══════════════════════════════════════════════════════════
 */

const cacheService = require('../services/cacheService');
const logger = require('../utils/logger');

/**
 * Cache middleware for GET requests
 * @param {Object} options - Cache options
 * @param {Number} options.ttl - Time to live in seconds
 * @param {Function} options.keyGenerator - Custom key generator
 * @param {Function} options.condition - Condition to cache
 */
function cacheMiddleware(options = {}) {
  const {
    ttl = 300, // 5 minutes default
    keyGenerator = defaultKeyGenerator,
    condition = () => true
  } = options;

  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Check condition
    if (!condition(req)) {
      return next();
    }

    // Generate cache key
    const cacheKey = keyGenerator(req);

    try {
      // Try to get from cache
      const cached = await cacheService.get(cacheKey);

      if (cached) {
        logger.debug('Serving from cache', { key: cacheKey });
        res.setHeader('X-Cache', 'HIT');
        return res.json(cached);
      }

      // Cache miss - intercept res.json
      res.setHeader('X-Cache', 'MISS');
      const originalJson = res.json.bind(res);

      res.json = function(data) {
        // Cache successful responses only
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cacheService.set(cacheKey, data, ttl).catch(err => {
            logger.error('Failed to cache response', { key: cacheKey, error: err.message });
          });
        }

        return originalJson(data);
      };

      next();
    } catch (error) {
      logger.error('Cache middleware error:', error);
      next();
    }
  };
}

/**
 * Default cache key generator
 */
function defaultKeyGenerator(req) {
  const userId = req.user?.id || 'anonymous';
  const queryString = Object.keys(req.query).length > 0
    ? ':' + JSON.stringify(req.query)
    : '';

  return `route:${req.originalUrl}:${userId}${queryString}`;
}

/**
 * Cache invalidation middleware
 * Invalidates cache on write operations
 */
function cacheInvalidation(entityType) {
  return async (req, res, next) => {
    // Only for write operations
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }

    // Store original res.json
    const originalJson = res.json.bind(res);

    res.json = async function(data) {
      // On successful response, invalidate cache
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const entityId = req.params.id || req.body.id || '*';
        await cacheService.invalidateEntity(entityType, entityId);
        logger.debug('Cache invalidated', { entityType, entityId });
      }

      return originalJson(data);
    };

    next();
  };
}

/**
 * Smart cache middleware with entity-based invalidation
 */
function smartCache(entityType, options = {}) {
  return [
    cacheInvalidation(entityType),
    cacheMiddleware({
      ...options,
      keyGenerator: (req) => {
        const entityId = req.params.id || 'list';
        const userId = req.user?.id || 'anonymous';
        const queryString = Object.keys(req.query).length > 0
          ? ':' + JSON.stringify(req.query)
          : '';

        return `${entityType}:${entityId}:${userId}${queryString}`;
      }
    })
  ];
}

/**
 * Cache warming - preload cache with frequently accessed data
 */
async function warmCache(dataLoader, cacheKeys, ttl = 3600) {
  try {
    logger.info('Warming cache', { keys: cacheKeys.length });

    const pairs = await Promise.all(
      cacheKeys.map(async ({ key, loader }) => {
        const data = await (loader || dataLoader)();
        return [key, data];
      })
    );

    await cacheService.mset(pairs, ttl);
    logger.info('Cache warmed successfully', { count: pairs.length });
  } catch (error) {
    logger.error('Cache warming failed:', error);
  }
}

/**
 * Cache-aside pattern wrapper
 */
async function cacheAside(key, dataLoader, ttl = 300) {
  return await cacheService.wrap(key, dataLoader, ttl);
}

/**
 * Cache statistics endpoint middleware
 */
async function cacheStats(req, res) {
  const stats = await cacheService.getStats();

  res.json({
    success: true,
    data: {
      enabled: cacheService.enabled,
      stats
    }
  });
}

/**
 * Cache flush endpoint middleware
 */
async function cacheFlush(req, res) {
  const flushed = await cacheService.flush();

  res.json({
    success: flushed,
    message: flushed ? 'Cache flushed successfully' : 'Failed to flush cache'
  });
}

module.exports = {
  cacheMiddleware,
  cacheInvalidation,
  smartCache,
  warmCache,
  cacheAside,
  cacheStats,
  cacheFlush
};
