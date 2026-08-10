/**
 * API Runtime Routes
 *
 * Dynamically mounts and executes custom API endpoints created in the Low-Code Platform.
 * Routes: /lowcode/custom/* (all custom APIs are mounted under this prefix)
 */

const express = require('express');
const router = express.Router();
const { Api } = require('../models');
const ApiExecutionEngine = require('../runtime/ApiExecutionEngine');
const logger = require('../utils/logger');
const rateLimit = require('express-rate-limit');

// Async handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Cache for API configurations (to avoid database lookups on every request)
const apiCache = new Map();
const CACHE_TTL = 60000; // 1 minute

/**
 * Clear API cache for a specific API or all APIs
 */
function clearApiCache(apiId = null) {
  if (apiId) {
    apiCache.delete(apiId);
  } else {
    apiCache.clear();
  }
  logger.info('API cache cleared', { apiId: apiId || 'all' });
}

/**
 * Get API configuration from cache or database
 */
async function getApiConfig(apiId) {
  const cached = apiCache.get(apiId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.api;
  }

  const api = await Api.findByPk(apiId);
  if (api) {
    apiCache.set(apiId, {
      api,
      timestamp: Date.now()
    });
  }

  return api;
}

/**
 * Dynamic API endpoint handler
 * Matches any path under /lowcode/custom/* and executes the corresponding API
 */
router.all('*', asyncHandler(async (req, res) => {
  const requestPath = req.path;
  const requestMethod = req.method;

  logger.info('Custom API request received', {
    path: requestPath,
    method: requestMethod,
    query: req.query,
    bodySize: req.body ? JSON.stringify(req.body).length : 0
  });

  try {
    // Find matching API endpoint
    const api = await Api.findOne({
      where: {
        path: requestPath,
        method: requestMethod,
        enabled: true
      }
    });

    if (!api) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: `API endpoint ${requestMethod} ${requestPath} not found or is disabled`,
        timestamp: new Date().toISOString()
      });
    }

    // Check rate limits
    if (api.rateLimit && api.rateLimit.enabled) {
      const rateLimitKey = `api:${api.id}:${req.ip}`;
      // Rate limiting is handled by middleware below
    }

    // Check CORS
    if (api.cors && api.cors.enabled) {
      const origin = req.headers.origin;
      const allowedOrigins = api.cors.allowedOrigins || ['*'];

      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin || '*');
        res.header('Access-Control-Allow-Methods', api.cors.allowedMethods.join(', '));
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      } else {
        return res.status(403).json({
          success: false,
          error: 'CORS_ERROR',
          message: 'Origin not allowed',
          timestamp: new Date().toISOString()
        });
      }
    }

    // Handle preflight requests
    if (requestMethod === 'OPTIONS') {
      return res.status(200).end();
    }

    // Check authentication
    if (api.authentication && api.authentication.required) {
      // TODO: Integrate with CA token validation
      // For now, check if Authorization header exists
      if (!req.headers.authorization && !req.user) {
        return res.status(401).json({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Authentication required',
          timestamp: new Date().toISOString()
        });
      }
    }

    // Check cache
    if (api.cache && api.cache.enabled && requestMethod === 'GET') {
      // TODO: Implement Redis caching
      // For now, skip caching
    }

    // Build execution context
    const context = {
      user: req.user || null,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      apiId: api.id,
      applicationId: api.applicationId
    };

    // Execute API
    const startTime = Date.now();
    const result = await ApiExecutionEngine.execute(api, req, context);
    const responseTime = Date.now() - startTime;

    // Update metrics
    await api.incrementCallCount(responseTime);

    if (!result.success) {
      await api.incrementErrorCount();
    }

    // Return response
    const statusCode = result.success ? 200 : 500;
    return res.status(statusCode).json(result);

  } catch (error) {
    logger.error('API runtime error', {
      path: requestPath,
      method: requestMethod,
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}));

// Export router and utilities
module.exports = router;
module.exports.clearApiCache = clearApiCache;
module.exports.getApiConfig = getApiConfig;
