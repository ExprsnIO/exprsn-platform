/**
 * Rate Limiting Middleware
 * Uses Redis for distributed rate limiting
 */

const redis = require('../config/redis');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * Rate limit configuration presets
 */
const RATE_LIMITS = {
  // Public endpoints (no auth)
  public: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
  },

  // Authenticated users
  authenticated: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // 1000 requests per window
  },

  // Strict limits for sensitive operations
  strict: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 requests per window
  },

  // Login attempts
  login: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
  },

  // Certificate operations
  certificates: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // 50 requests per window
  },

  // Token operations
  tokens: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100, // 100 requests per window
  },

  // Webhook operations
  webhooks: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 200, // 200 requests per window
  },
};

/**
 * Get client identifier (IP or user ID)
 */
function getClientId(req) {
  // Prefer authenticated user ID
  if (req.auth && req.auth.userId) {
    return `user:${req.auth.userId}`;
  }

  // Fall back to IP address
  const ip = req.ip || req.connection.remoteAddress;
  return `ip:${ip}`;
}

/**
 * Create rate limiter middleware
 */
function createRateLimiter(options = {}) {
  const {
    windowMs = RATE_LIMITS.public.windowMs,
    max = RATE_LIMITS.public.max,
    keyPrefix = 'ratelimit',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = options;

  return async (req, res, next) => {
    try {
      const clientId = getClientId(req);
      const key = `${keyPrefix}:${clientId}`;
      const now = Date.now();
      const windowStart = now - windowMs;

      // Use Redis sorted set for sliding window
      const multi = redis.client.multi();

      // Remove old entries
      multi.zremrangebyscore(key, 0, windowStart);

      // Count requests in current window
      multi.zcard(key);

      // Add current request
      multi.zadd(key, now, `${now}:${Math.random()}`);

      // Set expiry on key
      multi.expire(key, Math.ceil(windowMs / 1000));

      const results = await multi.exec();
      const count = results[1][1]; // Get count from ZCARD

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count - 1));
      res.setHeader('X-RateLimit-Reset', new Date(now + windowMs).toISOString());

      if (count >= max) {
        logger.warn('Rate limit exceeded', {
          clientId,
          path: req.path,
          count,
          max,
          requestId: req.requestId,
        });

        return res.status(429).json({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later',
            retryAfter: Math.ceil(windowMs / 1000),
            requestId: req.requestId,
          },
        });
      }

      // Store original end function to track response status
      const originalEnd = res.end;
      res.end = function (...args) {
        // If we should skip successful/failed requests, remove from count
        if (
          (skipSuccessfulRequests && res.statusCode < 400) ||
          (skipFailedRequests && res.statusCode >= 400)
        ) {
          // Remove the last added entry
          redis.client.zremrangebyrank(key, -1, -1).catch(err => {
            logger.error('Failed to remove rate limit entry', { error: err.message });
          });
        }

        originalEnd.apply(res, args);
      };

      next();
    } catch (error) {
      logger.error('Rate limiting error', {
        error: error.message,
        path: req.path,
        requestId: req.requestId,
      });

      // Don't block request on rate limiting errors
      next();
    }
  };
}

/**
 * Preset rate limiters
 */
const publicRateLimit = createRateLimiter({
  ...RATE_LIMITS.public,
  keyPrefix: 'ratelimit:public',
});

const authenticatedRateLimit = createRateLimiter({
  ...RATE_LIMITS.authenticated,
  keyPrefix: 'ratelimit:authenticated',
});

const strictRateLimit = createRateLimiter({
  ...RATE_LIMITS.strict,
  keyPrefix: 'ratelimit:strict',
});

const loginRateLimit = createRateLimiter({
  ...RATE_LIMITS.login,
  keyPrefix: 'ratelimit:login',
  skipSuccessfulRequests: true,
});

const certificateRateLimit = createRateLimiter({
  ...RATE_LIMITS.certificates,
  keyPrefix: 'ratelimit:certificates',
});

const tokenRateLimit = createRateLimiter({
  ...RATE_LIMITS.tokens,
  keyPrefix: 'ratelimit:tokens',
});

const webhookRateLimit = createRateLimiter({
  ...RATE_LIMITS.webhooks,
  keyPrefix: 'ratelimit:webhooks',
});

/**
 * Token usage rate limiting (for use-based tokens)
 */
async function tokenUsageLimit(req, res, next) {
  if (!req.auth || !req.auth.token) {
    return next();
  }

  const token = req.auth.token;

  // Check rate limit configuration
  if (!token.rate_limit) {
    return next();
  }

  try {
    const { requests, window_ms } = token.rate_limit;
    const key = `token:ratelimit:${token.id}`;
    const now = Date.now();
    const windowStart = now - window_ms;

    // Use Redis sorted set for sliding window
    const multi = redis.client.multi();
    multi.zremrangebyscore(key, 0, windowStart);
    multi.zcard(key);
    multi.zadd(key, now, `${now}:${Math.random()}`);
    multi.expire(key, Math.ceil(window_ms / 1000));

    const results = await multi.exec();
    const count = results[1][1];

    if (count >= requests) {
      logger.warn('Token rate limit exceeded', {
        tokenId: token.id,
        count,
        max: requests,
        requestId: req.requestId,
      });

      return res.status(429).json({
        error: {
          code: 'TOKEN_RATE_LIMIT_EXCEEDED',
          message: 'Token rate limit exceeded',
          retryAfter: Math.ceil(window_ms / 1000),
          requestId: req.requestId,
        },
      });
    }

    next();
  } catch (error) {
    logger.error('Token usage limit error', {
      error: error.message,
      tokenId: token.id,
      requestId: req.requestId,
    });

    // Don't block on errors
    next();
  }
}

/**
 * Token quota limiting
 */
async function tokenQuotaLimit(req, res, next) {
  if (!req.auth || !req.auth.token) {
    return next();
  }

  const token = req.auth.token;

  // Check if token has quota limits
  if (!token.quotas) {
    return next();
  }

  try {
    // This would be implemented based on specific quota types
    // For now, just pass through
    next();
  } catch (error) {
    logger.error('Token quota limit error', {
      error: error.message,
      tokenId: token.id,
      requestId: req.requestId,
    });

    next();
  }
}

module.exports = {
  createRateLimiter,
  publicRateLimit,
  authenticatedRateLimit,
  strictRateLimit,
  loginRateLimit,
  certificateRateLimit,
  tokenRateLimit,
  webhookRateLimit,
  tokenUsageLimit,
  tokenQuotaLimit,
  RATE_LIMITS,
};
