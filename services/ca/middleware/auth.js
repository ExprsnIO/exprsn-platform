/**
 * ═══════════════════════════════════════════════════════════
 * Authentication Middleware
 * ═══════════════════════════════════════════════════════════
 */

// The real winston logger (has .error/.warn/.info). `../config/logging` is only
// a config object ({ level, ... }) — importing that here made every logger.*
// call in this file throw `logger.error is not a function` (BUG-037), turning a
// service-auth failure into a 500 instead of a clean 401.
const logger = require('../utils/logger');

/**
 * Require authentication - redirect to login if not authenticated
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    // Store the original URL for redirect after login
    req.session.returnTo = req.originalUrl;

    // For API requests, return JSON error
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({
        success: false,
        error: 'AUTHENTICATION_REQUIRED',
        message: 'You must be logged in to access this resource'
      });
    }

    // For web requests, redirect to login
    return res.redirect('/auth/login');
  }

  // Attach user to res.locals for views
  res.locals.user = req.session.user;
  next();
}

/**
 * Require authentication for API endpoints - return JSON error
 */
function requireAuthAPI(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      success: false,
      error: 'AUTHENTICATION_REQUIRED',
      message: 'You must be logged in to access this resource'
    });
  }

  res.locals.user = req.session.user;
  next();
}

/**
 * Optional authentication - attach user if logged in, but don't require it
 */
function optionalAuth(req, res, next) {
  if (req.session && req.session.user) {
    res.locals.user = req.session.user;
  } else {
    res.locals.user = null;
  }
  next();
}

/**
 * Check if user is already authenticated and redirect to dashboard
 * Useful for login/register pages
 */
function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  next();
}

/**
 * Require specific permissions
 * @param {Array<string>} permissions - Array of required permissions
 */
function requirePermissions(...permissions) {
  return async (req, res, next) => {
    if (!req.session || !req.session.user) {
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({
          success: false,
          error: 'AUTHENTICATION_REQUIRED',
          message: 'You must be logged in to access this resource'
        });
      }
      return res.redirect('/auth/login');
    }

    try {
      const { User } = require('../models');
      const user = await User.findByPk(req.session.user.id, {
        include: [
          {
            association: 'roles',
            through: { attributes: [] }
          },
          {
            association: 'groups',
            include: [{
              association: 'roleSets',
              include: [{
                association: 'roles'
              }]
            }]
          }
        ]
      });

      if (!user) {
        req.session.destroy();
        if (req.path.startsWith('/api/')) {
          return res.status(401).json({
            success: false,
            error: 'USER_NOT_FOUND',
            message: 'User account not found'
          });
        }
        return res.redirect('/auth/login');
      }

      // Collect all user permissions from roles
      const userPermissions = new Set();

      // Direct roles
      if (user.roles) {
        user.roles.forEach(role => {
          if (role.permissions && Array.isArray(role.permissions)) {
            role.permissions.forEach(p => userPermissions.add(p));
          }
        });
      }

      // Roles from groups
      if (user.groups) {
        user.groups.forEach(group => {
          if (group.roleSets) {
            group.roleSets.forEach(roleSet => {
              if (roleSet.roles) {
                roleSet.roles.forEach(role => {
                  if (role.permissions && Array.isArray(role.permissions)) {
                    role.permissions.forEach(p => userPermissions.add(p));
                  }
                });
              }
            });
          }
        });
      }

      // Check if user has all required permissions
      const hasAllPermissions = permissions.every(p => userPermissions.has(p));

      if (!hasAllPermissions) {
        logger.warn('Permission denied', {
          userId: user.id,
          required: permissions,
          has: Array.from(userPermissions)
        });

        if (req.path.startsWith('/api/')) {
          return res.status(403).json({
            success: false,
            error: 'INSUFFICIENT_PERMISSIONS',
            message: 'You do not have permission to access this resource',
            required: permissions
          });
        }

        return res.status(403).render('error', {
          title: 'Access Denied',
          message: 'You do not have permission to access this resource',
          error: {
            status: 403,
            stack: process.env.NODE_ENV === 'development' ? new Error().stack : undefined
          }
        });
      }

      // Attach full user with permissions to request
      req.user = user;
      req.userPermissions = Array.from(userPermissions);
      res.locals.user = user;
      res.locals.userPermissions = Array.from(userPermissions);

      next();
    } catch (error) {
      logger.error('Error checking permissions', { error: error.message, stack: error.stack });

      if (req.path.startsWith('/api/')) {
        return res.status(500).json({
          success: false,
          error: 'PERMISSION_CHECK_FAILED',
          message: 'An error occurred while checking permissions'
        });
      }

      return res.status(500).render('error', {
        title: 'Error',
        message: 'An error occurred while checking permissions',
        error: {
          status: 500,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }
      });
    }
  };
}

/**
 * Require admin role
 */
function requireAdmin(req, res, next) {
  return requirePermissions('admin:full')(req, res, next);
}

/**
 * Admin role slugs accepted by requireAdminSession / userHasAdminRole
 */
const ADMIN_ROLE_SLUGS = ['admin', 'super-admin', 'ca-admin'];

/**
 * Check whether a user has an active admin role
 * @param {string} userId - User ID to check
 * @returns {Promise<boolean>}
 */
async function userHasAdminRole(userId) {
  if (!userId) {
    return false;
  }

  try {
    const { User, Role } = require('../models');

    const user = await User.findByPk(userId, {
      include: [{
        model: Role,
        as: 'roles',
        where: { status: 'active' },
        required: false
      }]
    });

    if (!user || !user.roles) {
      return false;
    }

    return user.roles.some(role => ADMIN_ROLE_SLUGS.includes(role.slug));
  } catch (error) {
    logger.error('Failed to check admin role', { userId, error: error.message });
    return false;
  }
}

/**
 * Require an authenticated session (JSON API) - 401 if no session user
 */
/**
 * Resolve a user from an `Authorization: Bearer <caTokenId>` header. The unified
 * SPA authenticates module APIs with a CA bearer token (the token id itself), not
 * a server session — so CA's own user routes must accept that bearer. The token
 * IS a CA token, so we validate it via the token service and load its user.
 * @returns {Promise<{id:string,email?:string}|null>}
 */
async function resolveBearerUser(req) {
  const authz = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(authz);
  if (!m) return null;
  const tokenId = m[1].trim();
  try {
    const tokenService = require('../services/token');
    const validation = await tokenService.validateToken(tokenId, {});
    if (!validation || !validation.valid || !validation.userId) return null;
    return { id: validation.userId };
  } catch (err) {
    logger.warn('CA bearer session resolution failed', { error: err.message });
    return null;
  }
}

/**
 * Require an authenticated user (JSON API). Accepts either a server session
 * (req.session.user) OR a valid CA bearer token (the unified SPA's auth). On
 * bearer auth a minimal session user ({ id }) is shimmed in so downstream
 * owner/admin checks (userHasAdminRole(id), cert.userId === id) work unchanged.
 */
async function requireSession(req, res, next) {
  if (req.session && req.session.user) {
    res.locals.user = req.session.user;
    return next();
  }

  const bearerUser = await resolveBearerUser(req);
  if (bearerUser) {
    req.session = req.session || {};
    req.session.user = bearerUser;
    res.locals.user = bearerUser;
    return next();
  }

  return res.status(401).json({
    success: false,
    error: 'AUTHENTICATION_REQUIRED',
    message: 'You must be logged in to access this resource'
  });
}

/**
 * Require an authenticated session with an admin role (JSON API)
 * 401 if no session user, 403 if the user lacks an admin role
 */
async function requireAdminSession(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      success: false,
      error: 'AUTHENTICATION_REQUIRED',
      message: 'You must be logged in to access this resource'
    });
  }

  try {
    const { User, Role } = require('../models');

    const user = await User.findByPk(req.session.user.id, {
      include: [{
        model: Role,
        as: 'roles',
        where: { status: 'active' },
        required: false
      }]
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'AUTHENTICATION_REQUIRED',
        message: 'User account not found'
      });
    }

    const hasAdminRole = user.roles && user.roles.some(role =>
      ADMIN_ROLE_SLUGS.includes(role.slug)
    );

    if (!hasAdminRole) {
      logger.warn('Admin access denied', { userId: user.id, path: req.originalUrl });
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Admin access required'
      });
    }

    req.user = user;
    req.userRoles = user.roles;
    req.isAdmin = true;
    res.locals.user = req.session.user;
    next();
  } catch (error) {
    logger.error('Admin authorization error', { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to verify admin access'
    });
  }
}

/**
 * Require either an authenticated session OR identity-bound service
 * credentials (X-Service-ID + X-Service-Token, verified as
 * HMAC-SHA256(serviceId, SERVICE_TOKEN_SECRET) via the shared layer).
 * Token validation is the platform's auth primitive, so other modules
 * must be able to call it without a browser session.
 */
function requireSessionOrService(req, res, next) {
  if (req.session && req.session.user) {
    res.locals.user = req.session.user;
    return next();
  }

  const serviceId = req.headers['x-service-id'];
  const serviceToken = req.headers['x-service-token'];

  if (serviceId && serviceToken) {
    try {
      const { verifyServiceToken } = require('../../../shared/utils/serviceToken');

      if (verifyServiceToken(serviceId, serviceToken)) {
        req.service = { id: serviceId, authenticated: true };
        return next();
      }

      logger.warn('Service authentication failed', { serviceId, path: req.originalUrl });
    } catch (error) {
      logger.error('Service authentication error', { serviceId, error: error.message });
    }
  }

  return res.status(401).json({
    success: false,
    error: 'AUTHENTICATION_REQUIRED',
    message: 'A session or valid service credentials (X-Service-ID, X-Service-Token) are required'
  });
}

/**
 * Attach user to locals middleware
 * Runs on every request to make user available in views
 */
function attachUserToLocals(req, res, next) {
  if (req.session && req.session.user) {
    res.locals.user = req.session.user;
  } else {
    res.locals.user = null;
  }

  // Attach helper function to check permissions in views
  res.locals.hasPermission = (permission) => {
    return res.locals.userPermissions && res.locals.userPermissions.includes(permission);
  };

  next();
}

module.exports = {
  requireAuth,
  requireAuthAPI,
  optionalAuth,
  redirectIfAuthenticated,
  requirePermissions,
  requireAdmin,
  requireSession,
  requireSessionOrService,
  requireAdminSession,
  userHasAdminRole,
  attachUserToLocals
};
