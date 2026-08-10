/**
 * ═══════════════════════════════════════════════════════════
 * Authentication Middleware
 * CA Token validation for Timeline service
 * ═══════════════════════════════════════════════════════════
 */

const { validateCAToken, AppError } = require('@exprsn/shared');
const logger = require('../utils/logger');

/**
 * Extract token from Authorization header
 */
function extractToken(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new AppError('Missing Authorization header', 401, 'NO_TOKEN');
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new AppError('Invalid Authorization header format', 401, 'INVALID_TOKEN_FORMAT');
  }

  return parts[1];
}

/**
 * Validate CA token middleware
 * Requires read permission by default
 */
function requireToken(options = {}) {
  const {
    requiredPermissions = { read: true },
    resourcePrefix = '/timeline'
  } = options;

  return async (req, res, next) => {
    try {
      // Extract token from header
      const token = extractToken(req);

      // Build resource path
      const resource = `${resourcePrefix}${req.path}`;

      // Validate token
      const validation = await validateCAToken(token, {
        requiredPermissions,
        resource
      });

      if (!validation.valid) {
        throw new AppError(
          validation.error || 'Token validation failed',
          401,
          validation.code || 'INVALID_TOKEN'
        );
      }

      // Attach user info to request
      req.userId = validation.userId;
      req.tokenData = validation.data;
      req.permissions = validation.permissions;

      logger.debug('Token validated', {
        userId: req.userId,
        resource,
        permissions: req.permissions
      });

      next();
    } catch (error) {
      if (error.isOperational) {
        return next(error);
      }

      logger.error('Token validation error', {
        error: error.message,
        path: req.path
      });

      next(new AppError('Authentication failed', 401, 'AUTH_FAILED'));
    }
  };
}

/**
 * Require write permission
 */
function requireWrite(resourcePrefix = '/timeline') {
  return requireToken({
    requiredPermissions: { write: true },
    resourcePrefix
  });
}

/**
 * Require delete permission
 */
function requireDelete(resourcePrefix = '/timeline') {
  return requireToken({
    requiredPermissions: { delete: true },
    resourcePrefix
  });
}

/**
 * Require update permission
 */
function requireUpdate(resourcePrefix = '/timeline') {
  return requireToken({
    requiredPermissions: { update: true },
    resourcePrefix
  });
}

/**
 * Optional authentication - doesn't fail if no token
 */
function optionalToken() {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        return next();
      }

      const token = extractToken(req);
      const validation = await validateCAToken(token, {
        requiredPermissions: { read: true },
        resource: `/timeline${req.path}`
      });

      if (validation.valid) {
        req.userId = validation.userId;
        req.tokenData = validation.data;
        req.permissions = validation.permissions;
      }

      next();
    } catch (error) {
      // For optional auth, continue even if validation fails
      logger.debug('Optional token validation failed', {
        error: error.message
      });
      next();
    }
  };
}

/**
 * Check if user owns resource
 */
function requireOwnership(getOwnerId) {
  return async (req, res, next) => {
    try {
      if (!req.userId) {
        throw new AppError('Authentication required', 401, 'NOT_AUTHENTICATED');
      }

      const ownerId = await getOwnerId(req);

      if (req.userId !== ownerId) {
        throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  requireToken,
  requireWrite,
  requireDelete,
  requireUpdate,
  optionalToken,
  requireOwnership,
  extractToken
};
