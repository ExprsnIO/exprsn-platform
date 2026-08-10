const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const redis = require('../config/redis');

/**
 * ═══════════════════════════════════════════════════════════
 * CA Token Authentication Middleware
 * See: TOKEN_SPECIFICATION_V1.0.md Section 9
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Extract CA token from request headers
 */
function extractToken(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return null;
  }

  // Support both "Bearer <token>" and "CAToken <token>" formats
  const parts = authHeader.split(' ');
  if (parts.length !== 2) {
    return null;
  }

  const [scheme, token] = parts;
  if (scheme !== 'Bearer' && scheme !== 'CAToken') {
    return null;
  }

  return token;
}

/**
 * Validate CA token with the Certificate Authority
 * Implements caching for performance
 */
async function validateCAToken(token, options = {}) {
  try {
    // Check cache first
    const cacheKey = `token:validation:${token.substring(0, 32)}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      logger.debug('Token validation cache hit');
      return JSON.parse(cached);
    }

    // Validate with CA service
    const response = await axios.post(
      `${config.ca.serviceUrl}/api/tokens/validate`,
      {
        token,
        requiredPermissions: options.requiredPermissions || {},
        resource: options.resource
      },
      {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.data.valid) {
      throw new Error('TOKEN_INVALID');
    }

    const validation = response.data;

    // Cache valid token for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(validation));

    logger.debug('Token validated successfully', {
      userId: validation.token?.data?.userId,
      permissions: validation.token?.permissions
    });

    return validation;

  } catch (error) {
    if (error.response) {
      // CA service returned an error
      logger.warn('Token validation failed', {
        status: error.response.status,
        error: error.response.data
      });

      if (error.response.status === 401) {
        throw new Error('TOKEN_INVALID');
      } else if (error.response.status === 403) {
        throw new Error('TOKEN_INSUFFICIENT_PERMISSIONS');
      } else if (error.response.data?.error === 'TOKEN_EXPIRED') {
        throw new Error('TOKEN_EXPIRED');
      }
    } else if (error.code === 'ECONNREFUSED') {
      logger.error('CA service unavailable');
      throw new Error('CA_SERVICE_UNAVAILABLE');
    }

    throw error;
  }
}

/**
 * Middleware: Require valid CA token
 */
function requireToken(options = {}) {
  return async (req, res, next) => {
    try {
      const token = extractToken(req);

      if (!token) {
        return res.status(401).json({
          error: 'TOKEN_REQUIRED',
          message: 'Authentication token is required'
        });
      }

      // Validate token
      const validation = await validateCAToken(token, {
        requiredPermissions: options.requiredPermissions,
        resource: options.resource || req.path
      });

      // Attach user info to request
      req.token = validation.token;
      req.user = {
        id: validation.token.data.userId,
        permissions: validation.token.permissions
      };

      next();
    } catch (error) {
      logger.error('Token authentication error:', error);

      if (error.message === 'TOKEN_INVALID') {
        return res.status(401).json({
          error: 'TOKEN_INVALID',
          message: 'Invalid authentication token'
        });
      } else if (error.message === 'TOKEN_EXPIRED') {
        return res.status(401).json({
          error: 'TOKEN_EXPIRED',
          message: 'Authentication token has expired'
        });
      } else if (error.message === 'TOKEN_INSUFFICIENT_PERMISSIONS') {
        return res.status(403).json({
          error: 'INSUFFICIENT_PERMISSIONS',
          message: 'Token does not have required permissions'
        });
      } else if (error.message === 'CA_SERVICE_UNAVAILABLE') {
        return res.status(503).json({
          error: 'SERVICE_UNAVAILABLE',
          message: 'Authentication service is temporarily unavailable'
        });
      }

      return res.status(500).json({
        error: 'AUTHENTICATION_ERROR',
        message: 'An error occurred during authentication'
      });
    }
  };
}

/**
 * Middleware: Require specific permissions
 */
function requirePermissions(permissions) {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.token) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Authentication required'
        });
      }

      const userPerms = req.token.permissions || {};

      // Check each required permission
      for (const [perm, required] of Object.entries(permissions)) {
        if (required && !userPerms[perm]) {
          return res.status(403).json({
            error: 'INSUFFICIENT_PERMISSIONS',
            message: `Missing required permission: ${perm}`,
            required: permissions,
            actual: userPerms
          });
        }
      }

      next();
    } catch (error) {
      logger.error('Permission check error:', error);
      return res.status(500).json({
        error: 'PERMISSION_CHECK_ERROR',
        message: 'An error occurred while checking permissions'
      });
    }
  };
}

/**
 * Middleware: Optional token (doesn't fail if token is missing)
 */
function optionalToken(options = {}) {
  return async (req, res, next) => {
    try {
      const token = extractToken(req);

      if (!token) {
        // No token provided, continue without authentication
        return next();
      }

      // Validate token if provided
      const validation = await validateCAToken(token, options);

      req.token = validation.token;
      req.user = {
        id: validation.token.data.userId,
        permissions: validation.token.permissions
      };

      next();
    } catch (error) {
      // Log error but don't fail the request
      logger.warn('Optional token validation failed:', error.message);
      next();
    }
  };
}

module.exports = {
  extractToken,
  validateCAToken,
  requireToken,
  requirePermissions,
  optionalToken
};
