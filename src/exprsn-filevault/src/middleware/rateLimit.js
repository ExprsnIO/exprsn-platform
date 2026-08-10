/**
 * ═══════════════════════════════════════════════════════════════════════
 * Rate Limiting Middleware
 * ═══════════════════════════════════════════════════════════════════════
 */

const logger = require('../utils/logger');

// In-memory store for rate limiting
// In production, use Redis for distributed rate limiting
class RateLimitStore {
  constructor() {
    this.requests = new Map();
    this.cleanup();
  }

  increment(key) {
    const now = Date.now();
    const record = this.requests.get(key) || { count: 0, resetTime: now + 60000 };

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + 60000;
    } else {
      record.count++;
    }

    this.requests.set(key, record);
    return record;
  }

  reset(key) {
    this.requests.delete(key);
  }

  cleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, record] of this.requests.entries()) {
        if (now > record.resetTime + 60000) {
          this.requests.delete(key);
        }
      }
    }, 60000); // Cleanup every minute
  }
}

const store = new RateLimitStore();

/**
 * Create rate limit middleware
 */
function createRateLimiter(options = {}) {
  const {
    windowMs = 60000, // 1 minute
    max = 100, // Max requests per window
    message = 'Too many requests, please try again later',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    keyGenerator = (req) => req.ip || req.connection.remoteAddress
  } = options;

  return (req, res, next) => {
    const key = keyGenerator(req);

    if (!key) {
      return next();
    }

    const record = store.increment(key);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));
    res.setHeader('X-RateLimit-Reset', new Date(record.resetTime).toISOString());

    if (record.count > max) {
      logger.warn('Rate limit exceeded', {
        key,
        count: record.count,
        limit: max,
        path: req.path
      });

      return res.status(429).json({
        error: 'TOO_MANY_REQUESTS',
        message,
        retryAfter: Math.ceil((record.resetTime - Date.now()) / 1000)
      });
    }

    // Skip counting based on response status if configured
    if (skipSuccessfulRequests || skipFailedRequests) {
      const originalSend = res.send;
      res.send = function(data) {
        const statusCode = res.statusCode;

        if (
          (skipSuccessfulRequests && statusCode < 400) ||
          (skipFailedRequests && statusCode >= 400)
        ) {
          record.count--;
          store.requests.set(key, record);
        }

        return originalSend.call(this, data);
      };
    }

    next();
  };
}

/**
 * Rate limit for file uploads (more restrictive)
 */
const uploadRateLimit = createRateLimiter({
  windowMs: 60000, // 1 minute
  max: 10, // 10 uploads per minute
  message: 'Upload rate limit exceeded',
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise IP
    return req.user?.id || req.ip;
  }
});

/**
 * Rate limit for file downloads
 */
const downloadRateLimit = createRateLimiter({
  windowMs: 60000, // 1 minute
  max: 50, // 50 downloads per minute
  message: 'Download rate limit exceeded',
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  }
});

/**
 * Rate limit for API requests
 */
const apiRateLimit = createRateLimiter({
  windowMs: 60000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'API rate limit exceeded'
});

/**
 * Strict rate limit for authentication endpoints
 */
const authRateLimit = createRateLimiter({
  windowMs: 900000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  message: 'Too many authentication attempts',
  skipSuccessfulRequests: true
});

/**
 * Rate limit for search operations
 */
const searchRateLimit = createRateLimiter({
  windowMs: 60000, // 1 minute
  max: 30, // 30 searches per minute
  message: 'Search rate limit exceeded'
});

module.exports = {
  createRateLimiter,
  uploadRateLimit,
  downloadRateLimit,
  apiRateLimit,
  authRateLimit,
  searchRateLimit
};
