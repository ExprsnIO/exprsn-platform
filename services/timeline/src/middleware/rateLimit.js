/**
 * ═══════════════════════════════════════════════════════════
 * Rate Limiting Middleware
 * Protect API endpoints from abuse
 * ═══════════════════════════════════════════════════════════
 */

const rateLimit = require('express-rate-limit');
const rateLimitRedis = require('rate-limit-redis');
const RedisStore = rateLimitRedis.default || rateLimitRedis;
const { createClient } = require('redis');
const { AppError } = require('@exprsn/shared');

// Redis client for rate limiting (separate from main client)
let redisClient;
if (process.env.REDIS_ENABLED === 'true') {
  redisClient = createClient({
    url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
  });

  redisClient.on('error', (err) => {
    console.error('Redis rate limit client error:', err);
  });

  // Connect to Redis
  redisClient.connect().catch((err) => {
    console.error('Failed to connect Redis for rate limiting:', err);
  });
}

/**
 * Default rate limit handler
 */
const rateLimitHandler = (req, res) => {
  throw new AppError(
    'Too many requests, please try again later',
    429,
    'RATE_LIMIT_EXCEEDED'
  );
};

/**
 * Skip rate limiting for certain conditions
 */
const skipRateLimit = (req) => {
  // Skip rate limiting in test environment
  if (process.env.NODE_ENV === 'test') {
    return true;
  }

  // Skip for health checks
  if (req.path.startsWith('/health')) {
    return true;
  }

  return false;
};

/**
 * Key generator using user ID if available, otherwise IP
 */
const keyGenerator = (req) => {
  // Use userId if authenticated
  if (req.userId) {
    return `user:${req.userId}`;
  }

  // Fall back to IP address
  return `ip:${req.ip}`;
};

/**
 * Global rate limiter
 * Applied to all routes as a baseline
 */
const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per window per IP/user
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  store: redisClient ? new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:global:'
  }) : undefined,
  skip: skipRateLimit,
  keyGenerator,
  handler: rateLimitHandler
});

/**
 * Strict rate limiter for write operations
 * POST, PUT, DELETE endpoints
 */
const writeRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 write requests per window
  message: 'Too many write requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
  store: redisClient ? new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:write:'
  }) : undefined,
  skip: skipRateLimit,
  keyGenerator,
  handler: rateLimitHandler
});

/**
 * Post creation rate limiter
 * Prevent spam posting
 */
const postCreationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 posts per hour
  message: 'Post creation limit reached, please wait before posting again',
  standardHeaders: true,
  legacyHeaders: false,
  store: redisClient ? new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:post-create:'
  }) : undefined,
  skip: skipRateLimit,
  keyGenerator,
  handler: rateLimitHandler
});

/**
 * Interaction rate limiter
 * Likes, comments, reposts
 */
const interactionRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 200, // 200 interactions per 5 minutes
  message: 'Too many interactions, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
  store: redisClient ? new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:interaction:'
  }) : undefined,
  skip: skipRateLimit,
  keyGenerator,
  handler: rateLimitHandler
});

/**
 * Search rate limiter
 * Prevent abuse of search endpoints
 */
const searchRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // 50 searches per 5 minutes
  message: 'Too many search requests, please wait before searching again',
  standardHeaders: true,
  legacyHeaders: false,
  store: redisClient ? new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:search:'
  }) : undefined,
  skip: skipRateLimit,
  keyGenerator,
  handler: rateLimitHandler
});

/**
 * Login/Auth rate limiter
 * Prevent brute force attacks
 */
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 auth attempts per 15 minutes
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  store: redisClient ? new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:auth:'
  }) : undefined,
  skip: (req) => {
    // Only apply to auth endpoints
    return !req.path.includes('/auth') && !req.path.includes('/login');
  },
  keyGenerator: (req) => `ip:${req.ip}`, // Always use IP for auth
  handler: rateLimitHandler
});

/**
 * Timeline generation rate limiter
 * Prevent excessive timeline fetching
 */
const timelineRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 timeline requests per minute
  message: 'Too many timeline requests, please wait',
  standardHeaders: true,
  legacyHeaders: false,
  store: redisClient ? new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:timeline:'
  }) : undefined,
  skip: skipRateLimit,
  keyGenerator,
  handler: rateLimitHandler
});

/**
 * Custom rate limiter factory
 * Create custom rate limiter with specific config
 */
function createRateLimiter(options = {}) {
  const defaults = {
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipRateLimit,
    keyGenerator,
    handler: rateLimitHandler
  };

  const config = { ...defaults, ...options };

  if (redisClient && !config.store) {
    config.store = new RedisStore({
      client: redisClient,
      prefix: options.prefix || 'custom'
    });
  }

  return rateLimit(config);
}

/**
 * Close Redis client gracefully
 */
async function closeRateLimitRedis() {
  if (redisClient) {
    await redisClient.quit();
    console.log('Rate limit Redis client closed');
  }
}

module.exports = {
  globalRateLimiter,
  writeRateLimiter,
  postCreationRateLimiter,
  interactionRateLimiter,
  searchRateLimiter,
  authRateLimiter,
  timelineRateLimiter,
  createRateLimiter,
  closeRateLimitRedis
};
