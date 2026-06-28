const axios = require('axios');
const { deriveServiceToken, verifyServiceToken } = require('@exprsn/shared/utils/serviceToken');
const config = require('../config');
const logger = require('../utils/logger');
const redis = require('../config/redis');

/**
 * Identity-bound service headers for CA calls. The CA's /api/tokens/validate is
 * guarded by requireSessionOrService — a server-to-server call (no browser
 * session) must present X-Service-ID/X-Service-Token or the CA returns 401.
 * Returns {} when no service identity is configured so the CA still decides.
 */
function buildServiceHeaders() {
  const serviceId = process.env.SERVICE_ID || process.env.SERVICE_NAME;
  if (!serviceId) return {};
  try {
    return { 'X-Service-ID': serviceId, 'X-Service-Token': deriveServiceToken(serviceId) };
  } catch (error) {
    logger.warn('Service identity not available for CA token validation', { error: error.message });
    return {};
  }
}

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
          'Content-Type': 'application/json',
          ...buildServiceHeaders()
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

      // Surface identity/roles in the shape the shared role guards expect
      // (req.userId + req.userRoles/req.userRole), so requireAdmin() and the
      // platform-admin override can read the CA-token role.
      attachRoleContext(req, validation.token);

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

      attachRoleContext(req, validation.token);

      next();
    } catch (error) {
      // Log error but don't fail the request
      logger.warn('Optional token validation failed:', error.message);
      next();
    }
  };
}

/**
 * Attach CA-token identity/roles to the request in the shape the shared
 * role-based guards (@exprsn/shared requireAdmin/requireRole) expect.
 * The CA token carries the user's RBAC role names in `data.roles`.
 * @param {Object} req - Express request
 * @param {Object} token - Validated CA token
 */
function attachRoleContext(req, token) {
  const data = (token && token.data) || {};
  req.userId = data.userId;
  req.userRoles = Array.isArray(data.roles) ? data.roles : [];
  req.userRole = req.userRoles[0] || null;
}

/**
 * Middleware: Require a valid per-service HMAC token (service-to-service).
 *
 * Verifies the identity-bound X-Service-ID / X-Service-Token headers
 * (HMAC-SHA256(serviceId, SERVICE_TOKEN_SECRET)) — the inverse of the
 * buildServiceHeaders() credentials nexus already presents when calling the CA.
 * Used to guard internal endpoints that must NOT accept end-user CA tokens.
 */
function requireServiceToken(req, res, next) {
  const serviceId = req.headers['x-service-id'];
  const serviceToken = req.headers['x-service-token'];

  if (!serviceId || !serviceToken) {
    return res.status(401).json({
      error: 'MISSING_SERVICE_CREDENTIALS',
      message: 'Service authentication required',
      hint: 'Include X-Service-ID and X-Service-Token headers'
    });
  }

  try {
    if (!verifyServiceToken(serviceId, serviceToken)) {
      logger.warn('Service authentication failed', { serviceId, path: req.originalUrl });
      return res.status(401).json({
        error: 'INVALID_SERVICE_TOKEN',
        message: 'Service authentication failed'
      });
    }

    req.service = { id: serviceId, authenticated: true };
    next();
  } catch (error) {
    logger.error('Service authentication error', { serviceId, error: error.message });
    return res.status(500).json({
      error: 'SERVICE_AUTH_ERROR',
      message: 'Service authentication failed'
    });
  }
}

module.exports = {
  extractToken,
  validateCAToken,
  requireToken,
  requirePermissions,
  optionalToken,
  requireServiceToken,
  attachRoleContext
};
