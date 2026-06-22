/**
 * Rate Limiting Middleware
 * Protects API endpoints from abuse with Redis-backed rate limiting
 */

const rateLimit = require('express-rate-limit');
const rateLimitRedis = require('rate-limit-redis');
const RedisStore = rateLimitRedis.default || rateLimitRedis;
const { createClient } = require('redis');
const { createLogger } = require('@exprsn/shared');

const logger = createLogger('exprsn-spark:rate-limit');

/**
 * Create rate limiter with Redis store
 */
function createRateLimiter(options = {}) {
  const {
    windowMs = 60000, // 1 minute
    max = 60, // 60 requests per window
    message = 'Too many requests, please try again later',
    keyGenerator = (req) => req.user?.id || req.ip,
    skipSuccessfulRequests = false,
    skipFailedRequests = false
  } = options;

  const config = {
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    skipSuccessfulRequests,
    skipFailedRequests,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        userId: req.user?.id,
        ip: req.ip,
        path: req.path,
        limit: max,
        window: windowMs
      });
      res.status(429).json({
        error: message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  };

  // Use Redis store if enabled
  if (process.env.REDIS_ENABLED === 'true') {
    try {
      const redisClient = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });

      redisClient.on('error', (err) => {
        logger.error('Redis client error for rate limiting', { error: err.message });
      });

      // Connect to Redis
      redisClient.connect().catch((err) => {
        logger.error('Failed to connect Redis for rate limiting', { error: err.message });
      });

      // Initialize RedisStore with sendCommand method
      config.store = new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
        prefix: 'spark:ratelimit:'
      });
    } catch (err) {
      logger.warn('Redis rate limiting disabled due to error', { error: err.message });
    }
  }

  return rateLimit(config);
}

/**
 * Rate limit for message sending
 * 60 messages per minute per user
 */
const messageRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  message: 'Too many messages sent, please slow down',
  keyGenerator: (req) => req.user?.id || req.ip
});

/**
 * Rate limit for file uploads
 * 10 uploads per 5 minutes per user
 */
const uploadRateLimit = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10,
  message: 'Too many file uploads, please try again later',
  keyGenerator: (req) => req.user?.id || req.ip
});

/**
 * Rate limit for conversation creation
 * 10 conversations per hour per user
 */
const conversationRateLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: 'Too many conversations created, please try again later',
  keyGenerator: (req) => req.user?.id || req.ip
});

/**
 * Rate limit for search queries
 * 100 queries per minute per user
 */
const searchRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: 'Too many search queries, please slow down',
  keyGenerator: (req) => req.user?.id || req.ip
});

/**
 * General API rate limit
 * 1000 requests per 15 minutes per IP
 */
const apiRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  message: 'Too many API requests, please try again later',
  keyGenerator: (req) => req.ip
});

/**
 * Rate limit for typing indicators
 * 20 typing events per minute per user
 */
const typingRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: 'Too many typing indicators',
  keyGenerator: (req) => req.user?.id || req.ip,
  skipSuccessfulRequests: true
});

/**
 * Rate limit for read receipts
 * 100 read receipts per minute per user
 */
const readReceiptRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: 'Too many read receipt updates',
  keyGenerator: (req) => req.user?.id || req.ip,
  skipSuccessfulRequests: true
});

module.exports = {
  createRateLimiter,
  messageRateLimit,
  uploadRateLimit,
  conversationRateLimit,
  searchRateLimit,
  apiRateLimit,
  typingRateLimit,
  readReceiptRateLimit
};
