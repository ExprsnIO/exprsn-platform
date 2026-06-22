/**
 * ═══════════════════════════════════════════════════════════
 * Authentication Middleware
 * CA Token validation for Timeline service
 * ═══════════════════════════════════════════════════════════
 */

const { AppError } = require('@exprsn/shared');
const { getValidator } = require('@exprsn/shared/utils/caTokenValidator');
const { isPlatformAdmin } = require('@exprsn/shared/utils/platformAdmin');
const logger = require('../utils/logger');

// Direct token-validation client (the shared validateCAToken export is an
// Express middleware *factory*, not a (token, options) call — using it that
// way silently 401s every request).
const caValidator = getValidator({ serviceId: process.env.SERVICE_ID || 'timeline' });

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
      const validation = await caValidator.validateToken(token, {
        requiredPermissions,
        resource
      });

      if (!validation.valid) {
        throw new AppError(
          validation.message || validation.error || 'Token validation failed',
          401,
          validation.error || 'INVALID_TOKEN'
        );
      }

      // Attach user info to request
      req.userId = validation.userId;
      req.tokenData = validation.tokenData;
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
 * Require platform-admin. The CA token model has NO 'admin' permission (only
 * read/write/append/update/delete) and the CA-token path doesn't populate a
 * role, so neither the shared role-based requireAdmin() nor a permission check
 * works here. The platform's admin concept is the email allowlist
 * (PLATFORM_ADMIN_EMAILS) — the login token carries the user's email in
 * tokenData (see auth tokenService). Run AFTER requireToken so req.tokenData
 * is populated.
 */
function requireAdmin() {
  return (req, res, next) => {
    if (!req.userId) {
      return next(new AppError('Authentication required', 401, 'NOT_AUTHENTICATED'));
    }
    const email = req.tokenData && req.tokenData.email;
    if (!isPlatformAdmin(email)) {
      return next(new AppError('Platform admin required', 403, 'FORBIDDEN'));
    }
    next();
  };
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
      const validation = await caValidator.validateToken(token, {
        requiredPermissions: { read: true },
        resource: `/timeline${req.path}`
      });

      if (validation.valid) {
        req.userId = validation.userId;
        req.tokenData = validation.tokenData;
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
  requireAdmin,
  optionalToken,
  requireOwnership,
  extractToken
};
