/**
 * ═══════════════════════════════════════════════════════════
 * Authentication Middleware
 * Simple wrapper around CA token authentication
 * ═══════════════════════════════════════════════════════════
 */

const { requireCAToken, optionalCAToken } = require('./caAuth');

/**
 * Require authentication
 * Wrapper around requireCAToken with default permissions
 */
function requireAuth(options = {}) {
  return requireCAToken({
    requiredPermissions: { read: true },
    ...options
  });
}

/**
 * Optional authentication
 * Wrapper around optionalCAToken
 */
function optionalAuth() {
  return optionalCAToken();
}

/**
 * Require specific permission
 * @param {string} permission - Permission name (read, write, update, delete, append)
 * @returns {Function} Express middleware
 */
function requirePermission(permission) {
  return requireCAToken({
    requiredPermissions: { [permission]: true }
  });
}

module.exports = {
  requireAuth,
  optionalAuth,
  requirePermission
};
