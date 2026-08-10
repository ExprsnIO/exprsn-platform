/**
 * ═══════════════════════════════════════════════════════════
 * Rate Limiter Middleware
 * Redis-based rate limiting for API endpoints
 * ═══════════════════════════════════════════════════════════
 */

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

// Create Redis client for rate limiting
let redisClient;
try {
  redisClient = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db + 1, // Use different DB for rate limiting
    keyPrefix: 'ratelimit:'
  });

  redisClient.on('error', (err) => {
    logger.error('Rate limiter Redis error', { error: err.message });
  });
} catch (error) {
  logger.error('Failed to initialize rate limiter Redis', { error: error.message });
}

/**
 * Standard rate limiter for API endpoints
 */
const standardLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: config.rateLimit.standardHeaders,
  legacyHeaders: config.rateLimit.legacyHeaders,
  store: redisClient ? new RedisStore({
    client: redisClient,
    prefix: 'rl:standard:'
  }) : undefined,
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'Too many requests, please try again later'
  },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  },
  keyGenerator: (req) => {
    // Use token ID if authenticated, otherwise use IP
    return req.token?.id || req.ip;
  }
});

/**
 * Strict rate limiter for moderation actions
 */
const moderationActionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // 50 actions per 5 minutes
  store: redisClient ? new RedisStore({
    client: redisClient,
    prefix: 'rl:action:'
  }) : undefined,
  message: {
    error: 'TOO_MANY_ACTIONS',
    message: 'Too many moderation actions, please slow down'
  },
  keyGenerator: (req) => {
    return req.moderatorId || req.token?.userId || req.ip;
  }
});

/**
 * Lenient rate limiter for content classification
 */
const classificationLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200, // 200 classifications per minute
  store: redisClient ? new RedisStore({
    client: redisClient,
    prefix: 'rl:classify:'
  }) : undefined,
  message: {
    error: 'TOO_MANY_CLASSIFICATIONS',
    message: 'Classification rate limit exceeded'
  },
  keyGenerator: (req) => {
    return req.serviceHostname || req.token?.issuer?.domain || req.ip;
  }
});

/**
 * Report submission rate limiter
 */
const reportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 reports per 15 minutes
  store: redisClient ? new RedisStore({
    client: redisClient,
    prefix: 'rl:report:'
  }) : undefined,
  message: {
    error: 'TOO_MANY_REPORTS',
    message: 'Too many reports submitted, please wait before submitting more'
  },
  keyGenerator: (req) => {
    return req.token?.userId || req.ip;
  }
});

/**
 * Appeal submission rate limiter
 */
const appealLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 appeals per hour
  store: redisClient ? new RedisStore({
    client: redisClient,
    prefix: 'rl:appeal:'
  }) : undefined,
  message: {
    error: 'TOO_MANY_APPEALS',
    message: 'Too many appeals submitted, please wait before submitting more'
  },
  keyGenerator: (req) => {
    return req.token?.userId || req.ip;
  }
});

module.exports = {
  standardLimiter,
  moderationActionLimiter,
  classificationLimiter,
  reportLimiter,
  appealLimiter
};
