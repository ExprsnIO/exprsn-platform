/**
 * Permission Middleware
 *
 * Validates that the authenticated token has the required permissions for the route.
 */

const logger = require('../config/logger');

/**
 * Create permission checking middleware based on lexicon permission config
 * @param {Object} permissionConfig - Permission configuration from lexicon
 * @returns {Function} Express middleware function
 */
function createPermissionMiddleware(permissionConfig) {
  return async (req, res, next) => {
    try {
      // Skip if no permissions required
      if (!permissionConfig) {
        return next();
      }

      // Check if token exists (should be set by auth middleware)
      if (!req.token) {
        return res.status(401).json({
          error: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required to check permissions'
        });
      }

      const tokenPermissions = req.token.permissions || {};
      const requiredPermissions = permissionConfig;

      // Check each required permission
      for (const [permission, required] of Object.entries(requiredPermissions)) {
        if (required && !tokenPermissions[permission]) {
          logger.warn('Permission denied', {
            userId: req.token.userId,
            tokenId: req.token.id,
            required: permission,
            granted: tokenPermissions
          });

          return res.status(403).json({
            error: 'INSUFFICIENT_PERMISSIONS',
            message: `Missing required permission: ${permission}`,
            required: requiredPermissions,
            granted: tokenPermissions
          });
        }
      }

      // All permissions granted
      next();
    } catch (error) {
      logger.error('Permission middleware error:', error);
      return res.status(500).json({
        error: 'PERMISSION_CHECK_ERROR',
        message: 'Failed to validate permissions'
      });
    }
  };
}

/**
 * Check if token has specific permission
 * @param {Object} token - Validated token
 * @param {string} permission - Permission to check
 * @returns {boolean} True if permission granted
 */
function hasPermission(token, permission) {
  if (!token || !token.permissions) {
    return false;
  }
  return token.permissions[permission] === true;
}

/**
 * Check if token has any of the specified permissions
 * @param {Object} token - Validated token
 * @param {Array<string>} permissions - Permissions to check
 * @returns {boolean} True if any permission granted
 */
function hasAnyPermission(token, permissions) {
  if (!token || !token.permissions) {
    return false;
  }
  return permissions.some(p => token.permissions[p] === true);
}

/**
 * Check if token has all of the specified permissions
 * @param {Object} token - Validated token
 * @param {Array<string>} permissions - Permissions to check
 * @returns {boolean} True if all permissions granted
 */
function hasAllPermissions(token, permissions) {
  if (!token || !token.permissions) {
    return false;
  }
  return permissions.every(p => token.permissions[p] === true);
}

module.exports = {
  createPermissionMiddleware,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions
};
