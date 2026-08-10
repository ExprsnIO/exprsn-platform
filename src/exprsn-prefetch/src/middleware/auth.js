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
 * Require valid CA token with specified permissions
 * Wrapper around shared library's validation with prefetch-specific defaults
 */
function requireToken(options = {}) {
  const {
    requiredPermissions = { read: true },
    resourcePrefix = '/prefetch'
  } = options;

  return requirePermissions({
    ...requiredPermissions,
    resourcePrefix
  });
}

/**
 * Require write permission for prefetch operations
 */
function requireWrite(resourcePrefix = '/prefetch') {
  return requirePermissions({
    write: true,
    resourcePrefix
  });
}

/**
 * Require delete permission for cache invalidation
 */
function requireDelete(resourcePrefix = '/prefetch') {
  return requirePermissions({
    delete: true,
    resourcePrefix
  });
}

/**
 * Optional token validation
 * Uses shared library's optionalToken middleware
 */
function requireOptionalToken(resourcePrefix = '/prefetch') {
  return optionalToken(resourcePrefix);
}

module.exports = {
  requireToken,
  requireWrite,
  requireDelete,
  optionalToken: requireOptionalToken,

  // Re-export shared utilities for convenience
  validateCAToken,
  AppError,
  asyncHandler
};
