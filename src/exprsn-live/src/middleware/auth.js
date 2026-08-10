/**
 * Authentication Middleware
 * CA token validation and user context injection
 */

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Extract token from request
 * @param {Object} req - Express request
 * @returns {string|null} Token
 */
function extractToken(req) {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check query parameter
  if (req.query.token) {
    return req.query.token;
  }

  // Check cookies
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }

  return null;
}

/**
 * Validate CA token with Certificate Authority
 * @param {string} token - CA token
 * @returns {Promise<Object>} Validation result
 */
async function validateToken(token) {
  try {
    const response = await axios.post(
      `${config.ca.baseUrl}/api/tokens/validate`,
      {
        token,
        requiredPermission: 'read' // Minimum permission
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );

    return response.data;
  } catch (error) {
    logger.error('Token validation failed:', error.message);
    return { valid: false, error: 'Token validation failed' };
  }
}

/**
 * Authentication middleware - requires valid CA token
 */
async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    // Validate token with CA
    const validation = await validateToken(token);

    if (!validation.valid) {
      return res.status(401).json({
        error: 'INVALID_TOKEN',
        message: validation.error || 'Invalid or expired token'
      });
    }

    // Attach user context to request
    req.user = {
      id: validation.userId,
      certificateId: validation.certificateId,
      permissions: validation.permissions || {},
      token
    };

    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(500).json({
      error: 'AUTH_ERROR',
      message: 'Authentication failed'
    });
  }
}

/**
 * Optional authentication - allows requests with or without token
 */
async function optionalAuth(req, res, next) {
  try {
    const token = extractToken(req);

    if (!token) {
      req.user = null;
      return next();
    }

    // Validate token with CA
    const validation = await validateToken(token);

    if (validation.valid) {
      req.user = {
        id: validation.userId,
        certificateId: validation.certificateId,
        permissions: validation.permissions || {},
        token
      };
    } else {
      req.user = null;
    }

    next();
  } catch (error) {
    logger.error('Optional auth error:', error);
    req.user = null;
    next();
  }
}

/**
 * Check if user has specific permission
 * @param {string} permission - Required permission (read, write, delete, etc.)
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    if (!req.user.permissions[permission]) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `Permission '${permission}' required`
      });
    }

    next();
  };
}

/**
 * Check if user is resource owner
 * @param {Function} getOwnerId - Function to extract owner ID from request
 */
function requireOwnership(getOwnerId) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    const ownerId = getOwnerId(req);

    if (req.user.id !== ownerId) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Access denied - you do not own this resource'
      });
    }

    next();
  };
}

/**
 * Mock authentication for development (bypass CA)
 * NEVER use in production!
 */
function mockAuth(req, res, next) {
  if (config.service.env !== 'development') {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Mock auth only available in development'
    });
  }

  req.user = {
    id: 'dev-user-123',
    certificateId: 'dev-cert-123',
    permissions: {
      read: true,
      write: true,
      delete: true
    },
    token: 'mock-token'
  };

  logger.warn('Using mock authentication - development only!');
  next();
}

module.exports = {
  requireAuth,
  optionalAuth,
  requirePermission,
  requireOwnership,
  mockAuth,
  extractToken,
  validateToken
};
