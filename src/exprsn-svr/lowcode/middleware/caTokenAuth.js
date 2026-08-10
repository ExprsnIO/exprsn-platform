/**
 * CA Token Authentication Middleware
 *
 * Validates CA tokens from exprsn-ca service for production use.
 * Provides fallback to development mode for local testing.
 *
 * Security Features:
 * - CA token signature verification
 * - OCSP certificate status checking
 * - Token permission validation
 * - Token expiry validation
 * - Audit logging for all authentication attempts
 * - Rate limiting integration
 */

const { validateCAToken, requirePermissions, logger } = require('@exprsn/shared');

const DEV_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'developer@exprsn.local',
  username: 'developer',
  role: 'admin',
  permissions: {
    read: true,
    write: true,
    delete: true,
    update: true,
    append: true
  }
};

/**
 * Production CA Token Authentication
 * Validates tokens against exprsn-ca service
 */
async function caTokenAuth(req, res, next) {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const bypassEnabled = process.env.LOW_CODE_DEV_AUTH === 'true';

  // Development bypass (ONLY if explicitly enabled)
  if (isDevelopment && bypassEnabled) {
    logger.warn('[CA Auth] Development bypass enabled - using dummy user');
    req.user = DEV_USER;
    req.token = {
      id: 'dev-token',
      version: '1.0',
      permissions: DEV_USER.permissions,
      data: { userId: DEV_USER.id }
    };
    return next();
  }

  // Production mode - require CA token
  try {
    // Use shared validation middleware
    await validateCAToken(req, res, (err) => {
      if (err) {
        // Authentication failed
        logger.error('[CA Auth] Token validation failed:', {
          error: err.message,
          ip: req.ip,
          path: req.path
        });
        return res.status(401).json({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Valid CA token required'
        });
      }

      // Token validated successfully
      logger.info('[CA Auth] User authenticated:', {
        userId: req.user.id,
        tokenId: req.token.id,
        path: req.path
      });

      next();
    });
  } catch (error) {
    logger.error('[CA Auth] Authentication error:', error);
    return res.status(500).json({
      success: false,
      error: 'AUTHENTICATION_ERROR',
      message: 'Authentication service error'
    });
  }
}

/**
 * Require specific permissions for an endpoint
 * Use after caTokenAuth middleware
 */
function requireLowCodePermissions(permissions = { read: true }) {
  return requirePermissions(permissions);
}

/**
 * Require admin role for management endpoints
 */
function requireLowCodeAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required'
    });
  }

  const isAdmin = req.user.role === 'admin' ||
                  req.user.permissions?.admin === true ||
                  req.user.isAdmin === true;

  if (!isAdmin) {
    logger.warn('[CA Auth] Admin access denied:', {
      userId: req.user.id,
      role: req.user.role,
      path: req.path
    });

    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'Admin access required'
    });
  }

  next();
}

/**
 * Verify user can access specific application
 */
async function requireApplicationAccess(req, res, next) {
  const appId = req.params.applicationId || req.params.appId;

  if (!appId) {
    return res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      message: 'Application ID required'
    });
  }

  // Check permissions via RBAC service
  const { RBACService } = require('../services');
  const hasAccess = await RBACService.checkPermission({
    userId: req.user.id,
    resourceType: 'Application',
    resourceId: appId,
    action: req.method === 'GET' ? 'view' : 'edit'
  });

  if (!hasAccess.allowed) {
    logger.warn('[CA Auth] Application access denied:', {
      userId: req.user.id,
      appId,
      action: req.method
    });

    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'Insufficient permissions for this application'
    });
  }

  req.rbacContext = hasAccess;
  next();
}

/**
 * Optional authentication - sets user if token present
 * but continues even if not authenticated
 */
async function optionalAuth(req, res, next) {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const bypassEnabled = process.env.LOW_CODE_DEV_AUTH === 'true';

  // Development bypass
  if (isDevelopment && bypassEnabled) {
    req.user = DEV_USER;
    req.token = {
      id: 'dev-token',
      permissions: DEV_USER.permissions
    };
    return next();
  }

  // Try to validate token if present, but don't fail if missing
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    // No token - continue as guest
    return next();
  }

  try {
    await validateCAToken(req, res, (err) => {
      // Ignore errors for optional auth
      if (err) {
        logger.debug('[CA Auth] Optional auth - token invalid, continuing as guest');
      }
      next();
    });
  } catch (error) {
    // Continue as guest on error
    logger.debug('[CA Auth] Optional auth error, continuing as guest:', error.message);
    next();
  }
}

/**
 * Audit log wrapper for authentication events
 */
function auditAuthEvent(action, details = {}) {
  logger.info(`[CA Auth Audit] ${action}`, {
    timestamp: new Date().toISOString(),
    ...details
  });
}

module.exports = {
  caTokenAuth,
  requireLowCodePermissions,
  requireLowCodeAdmin,
  requireApplicationAccess,
  optionalAuth,
  auditAuthEvent,
  DEV_USER
};
