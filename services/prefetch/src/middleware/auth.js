/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Prefetch - Authentication Middleware
 * Uses @exprsn/shared for token validation and permission checking
 * ═══════════════════════════════════════════════════════════════════════
 */

const {
  validateCAToken,
  requirePermissions,
  optionalToken,
  AppError,
  asyncHandler
} = require('@exprsn/shared');

/**
 * Normalize a permissions specifier into the array form expected by the
 * shared validateCAToken factory.
 * Accepts ['read', 'write'] or { read: true, write: true }.
 * @param {Array<string>|Object} permissions - Permissions specifier
 * @returns {Array<string>} Permission names
 */
function toPermissionArray(permissions) {
  if (Array.isArray(permissions)) {
    return permissions;
  }
  if (permissions && typeof permissions === 'object') {
    return Object.entries(permissions)
      .filter(([, required]) => required === true)
      .map(([perm]) => perm);
  }
  return ['read'];
}

/**
 * Require valid CA token with specified permissions
 * Composes the shared validateCAToken factory (which validates the token
 * with the CA and attaches req.userId / req.permissions) with a local
 * permission re-check.
 *
 * @param {Object} options - { requiredPermissions, resourceType }
 * @returns {Array<Function>} Express middleware chain
 */
function requireToken(options = {}) {
  const {
    requiredPermissions = { read: true },
    resourceType = null
  } = options;

  const permissionList = toPermissionArray(requiredPermissions);

  return [
    validateCAToken({
      requiredPermissions: permissionList,
      resourceType
    }),
    requirePermissions(permissionList)
  ];
}

/**
 * Require write permission for prefetch operations
 */
function requireWrite() {
  return requireToken({ requiredPermissions: ['write'] });
}

/**
 * Require delete permission for cache invalidation
 */
function requireDelete() {
  return requireToken({ requiredPermissions: ['delete'] });
}

/**
 * Optional token validation
 * Uses shared library's optionalToken middleware
 */
function requireOptionalToken(options = {}) {
  return optionalToken(options);
}

/**
 * Require that the authenticated principal matches the :userId path
 * parameter, or that the token carries the admin permission.
 * Must run AFTER requireToken/validateCAToken.
 *
 * @param {string} paramName - Path parameter holding the target user id
 * @returns {Function} Express middleware
 */
function requireSelfOrAdmin(paramName = 'userId') {
  return (req, res, next) => {
    const targetUserId = req.params[paramName];

    if (!req.userId) {
      return res.status(401).json({
        error: 'UNAUTHENTICATED',
        message: 'Authentication required'
      });
    }

    const isAdmin = req.permissions && req.permissions.admin === true;

    if (req.userId !== targetUserId && !isAdmin) {
      return res.status(403).json({
        error: 'ACCESS_DENIED',
        message: 'You may only access your own prefetch data'
      });
    }

    next();
  };
}

module.exports = {
  requireToken,
  requireWrite,
  requireDelete,
  requireSelfOrAdmin,
  optionalToken: requireOptionalToken,

  // Re-export shared utilities for convenience
  validateCAToken,
  AppError,
  asyncHandler
};
