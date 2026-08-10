/**
 * Exprsn Pulse - Authentication Middleware
 */

const { validateCAToken, AppError } = require('@exprsn/shared');

/**
 * Extract token from Authorization header
 */
function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    throw new AppError('No authorization header provided', 401, 'NO_AUTH_HEADER');
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new AppError('Invalid authorization header format', 401, 'INVALID_AUTH_FORMAT');
  }

  return parts[1];
}

/**
 * Require valid CA token with specified permissions
 */
function requireToken(options = {}) {
  const {
    requiredPermissions = { read: true },
    resourcePrefix = '/analytics'
  } = options;

  return async (req, res, next) => {
    try {
      const token = extractToken(req);
      const resource = `${resourcePrefix}${req.path}`;

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

      req.userId = validation.userId;
      req.tokenData = validation.data;
      req.permissions = validation.permissions;
      next();
    } catch (error) {
      if (error.isOperational) {
        return res.status(error.statusCode).json({
          error: error.message,
          code: error.code
        });
      }

      console.error('Token validation error:', error);
      res.status(401).json({
        error: 'Authentication failed',
        code: 'AUTH_FAILED'
      });
    }
  };
}

/**
 * Require write permission
 */
function requireWrite(resourcePrefix = '/analytics') {
  return requireToken({
    requiredPermissions: { write: true },
    resourcePrefix
  });
}

/**
 * Optional token validation
 */
function optionalToken(resourcePrefix = '/analytics') {
  return async (req, res, next) => {
    try {
      const token = extractToken(req);
      const resource = `${resourcePrefix}${req.path}`;

      const validation = await validateCAToken(token, {
        requiredPermissions: { read: true },
        resource
      });

      if (validation.valid) {
        req.userId = validation.userId;
        req.tokenData = validation.data;
        req.permissions = validation.permissions;
      }
    } catch (error) {
      // Silently continue without authentication
    }

    next();
  };
}

module.exports = {
  requireToken,
  requireWrite,
  optionalToken,
  extractToken
};
