/**
 * Exprsn Vault - Authentication Middleware
 * Secrets require strict authentication using CA tokens
 */

const { validateCAToken, requirePermissions, AppError, logger } = require('@exprsn/shared');

/**
 * Require valid CA token with specific permissions for Vault operations
 * @param {Object} options - Configuration options
 * @param {Object} options.requiredPermissions - Permissions required (e.g., { read: true })
 * @param {string} options.resourcePrefix - Resource prefix for token validation
 * @returns {Function} Express middleware
 */
function requireToken(options = {}) {
  const {
    requiredPermissions = { read: true },
    resourcePrefix = '/api/secrets'
  } = options;

  return [
    // First, validate the CA token
    validateCAToken,
    // Then, check specific permissions
    requirePermissions(requiredPermissions)
  ];
}

/**
 * Require write permission for Vault operations
 * @param {string} resourcePrefix - Resource prefix for token validation
 * @returns {Function} Express middleware
 */
function requireWrite(resourcePrefix = '/api/secrets') {
  return requireToken({
    requiredPermissions: { write: true },
    resourcePrefix
  });
}

/**
 * Require delete permission for Vault operations
 * @param {string} resourcePrefix - Resource prefix for token validation
 * @returns {Function} Express middleware
 */
function requireDelete(resourcePrefix = '/api/secrets') {
  return requireToken({
    requiredPermissions: { delete: true },
    resourcePrefix
  });
}

/**
 * Require read permission for Vault operations
 * @param {string} resourcePrefix - Resource prefix for token validation
 * @returns {Function} Express middleware
 */
function requireRead(resourcePrefix = '/api/secrets') {
  return requireToken({
    requiredPermissions: { read: true },
    resourcePrefix
  });
}

module.exports = {
  requireToken,
  requireWrite,
  requireDelete,
  requireRead
};
