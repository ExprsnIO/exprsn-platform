/**
 * ═══════════════════════════════════════════════════════════
 * Rate Limiting Middleware
 * Redis-backed rate limiting for Exprsn services
 * ═══════════════════════════════════════════════════════════
 */

const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { createClient } = require('redis');
const logger = require('../utils/logger');
const { verifyServiceToken } = require('../utils/serviceToken');

let redisClient = null;

/**
 * Initialize Redis client for rate limiting
 */
async function initRedisClient() {
  if (process.env.REDIS_ENABLED !== 'true') {
    if (process.env.NODE_ENV === 'production') {
      logger.error('Redis disabled in production: rate limiting DEGRADED to per-process memory store');
    }
    return null;
  }

  try {
    redisClient = createClient({
      url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 500)
      }
    });

    redisClient.on('error', (err) => {
      logger.error('Redis client error', { error: err.message });
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected for rate limiting');
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      // In production a memory store means limits are per-process and reset
      // on restart — rate limiting is effectively degraded.
      logger.error('Redis unavailable in production: rate limiting DEGRADED to per-process memory store', {
        error: error.message
      });
    } else {
      logger.warn('Failed to connect to Redis, rate limiting will use memory store', {
        error: error.message
      });
    }
    redisClient = null;
    return null;
  }
}

/**
 * Create rate limiter middleware
 * @param {Object} options - Rate limit options
 * @returns {Function} Express middleware
 */
function createRateLimiter(options = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100, // Limit each IP to 100 requests per windowMs
    message = 'Too many requests, please try again later',
    skipSuccessfulRequests = false,
    skipFailedRequests = false
  } = options;

  const limiterConfig = {
    windowMs,
    max,
    message: {
      error: 'RATE_LIMIT_EXCEEDED',
      message
    },
    skipSuccessfulRequests,
    skipFailedRequests,
    standardHeaders: true,
    legacyHeaders: false,
    // BUG-034 (authorized by Rick 2026-07-17): in the unified gateway every
    // module's internal call arrives from 127.0.0.1, so ALL in-process traffic
    // shared one per-IP bucket — one busy admin console 429'd every module's
    // token validation (and logins) platform-wide for a full window. A request
    // that PROVES a service identity — X-Service-ID plus the constant-time-
    // verified HMAC X-Service-Token derived from SERVICE_TOKEN_SECRET — is
    // exempt: external callers cannot forge the HMAC, so per-IP abuse
    // protection for real clients is unchanged. Absent/invalid service
    // headers always count normally (verifyServiceToken fails closed).
    skip: (req) => {
      const serviceId = req.get('x-service-id');
      const serviceToken = req.get('x-service-token');
      if (!serviceId || !serviceToken) return false;
      try {
        return verifyServiceToken(serviceId, serviceToken) === true;
      } catch {
        return false;
      }
    },
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        userId: req.userId
      });

      res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message
      });
    }
  };

  // Use Redis store if available
  if (redisClient) {
    limiterConfig.store = new RedisStore({
      // @ts-expect-error - Known issue: the `call` function is not present in @types/redis
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: 'rl:'
    });
  }

  return rateLimit(limiterConfig);
}

/**
 * Strict rate limiter for sensitive operations
 */
const strictLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per 15 minutes
  message: 'Too many requests for this operation'
});

/**
 * Standard rate limiter for general API endpoints
 */
const standardLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100
});

/**
 * Relaxed rate limiter for read operations
 */
const relaxedLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 300
});

module.exports = {
  initRedisClient,
  createRateLimiter,
  strictLimiter,
  standardLimiter,
  relaxedLimiter
};
