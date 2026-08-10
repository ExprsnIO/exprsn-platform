/**
 * ═══════════════════════════════════════════════════════════
 * Rate Limiter Middleware
 * Protects API endpoints from abuse
 * ═══════════════════════════════════════════════════════════
 */

const rateLimit = require('express-rate-limit');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * General API rate limiter
 */
const rateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    success: false,
    error: {
      message: 'Too many requests, please try again later',
      statusCode: 429
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      url: req.url,
      method: req.method
    });
    res.status(429).json({
      success: false,
      error: {
        message: 'Too many requests, please try again later',
        statusCode: 429
      }
    });
  }
});

/**
 * Strict rate limiter for code execution
 */
const codeExecutionLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 10, // 10 requests per minute
  message: {
    success: false,
    error: {
      message: 'Too many code execution requests',
      statusCode: 429
    }
  }
});

/**
 * Lenient rate limiter for page views
 */
const pageViewLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 200, // 200 requests per minute
  skipSuccessfulRequests: true
});

module.exports = {
  rateLimiter,
  codeExecutionLimiter,
  pageViewLimiter
};
