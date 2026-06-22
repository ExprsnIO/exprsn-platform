/**
 * Exprsn Vault - Authentication Middleware
 * Secrets require strict authentication using CA tokens
 */

const { validateCAToken, logger } = require('@exprsn/shared');

/**
 * Normalize a permissions argument into the array form expected by the
 * shared validateCAToken factory.
 * Accepts ['read', 'write'] or legacy { read: true, write: true } objects.
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
 * Extract the token's resource scope string (if any) from the validated
 * token data attached by the shared middleware. CA tokens carry a resource
 * as { url | did | cid: value }; some tokens embed it in tokenData.
 * @param {Object} req - Express request (after validateCAToken)
 * @returns {string|null} Resource scope value or null when not present
 */
function getTokenResourceScope(req) {
  const tokenData = req.tokenData;
  if (!tokenData) return null;

  const resource = tokenData.resource || tokenData.resourcePattern || null;
  if (!resource) return null;

  if (typeof resource === 'string') return resource;
  if (typeof resource === 'object') {
    return resource.url || resource.did || resource.cid || null;
  }
  return null;
}

/**
 * Enforce that the request path falls under the declared resource prefix
 * and, when the validated token carries a resource scope, that the request
 * path is covered by that scope. Mismatches are denied with 403.
 *
 * Note: the CA also enforces resource matching server-side during token
 * validation (the shared middleware posts the request path as `resource`);
 * this check is defense-in-depth at the service boundary.
 *
 * @param {string} resourcePrefix - Required path prefix (e.g. '/secrets')
 * @returns {Function} Express middleware
 */
function enforceResourceScope(resourcePrefix) {
  return (req, res, next) => {
    const requestPath = `${req.baseUrl || ''}${req.path}`;

    // The resource prefix (e.g. '/secrets') must appear as a full path segment.
    // Match it anywhere in the path so the check is independent of the mount
    // point: standalone the path is '/api/secrets/...', but under the unified
    // gateway the module is mounted at '/vault', so it's '/vault/api/secrets/...'.
    const seg = resourcePrefix.replace(/^\/+/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const prefixMatches = new RegExp(`(^|/)${seg}(/|$)`).test(requestPath);

    if (!prefixMatches) {
      logger.warn('Vault resource prefix mismatch', {
        requestPath,
        resourcePrefix,
        userId: req.userId
      });
      return res.status(403).json({
        error: 'RESOURCE_NOT_AUTHORIZED',
        message: `Token is not valid for resources outside ${resourcePrefix}`
      });
    }

    // If the token declares an explicit resource scope, the request path
    // must be covered by it (exact, prefix, or trailing-* glob match).
    const scope = getTokenResourceScope(req);
    if (scope) {
      const scopePrefix = scope.endsWith('*') ? scope.slice(0, -1) : scope;
      const covered =
        requestPath === scope ||
        requestPath.startsWith(scopePrefix);

      if (!covered) {
        logger.warn('Vault token resource scope mismatch', {
          requestPath,
          scope,
          userId: req.userId
        });
        return res.status(403).json({
          error: 'RESOURCE_NOT_AUTHORIZED',
          message: 'Token resource scope does not cover the requested path'
        });
      }
    }

    // Make the authenticated principal available in the shape route
    // handlers expect (req.user.id) for actor attribution.
    if (!req.user && req.userId) {
      req.user = { id: req.userId, permissions: req.permissions };
    }

    next();
  };
}

/**
 * Require valid CA token with specific permissions for Vault operations
 * @param {string} resourcePrefix - Resource prefix the token must be scoped to
 * @param {Array<string>|Object} permissions - Permissions required (e.g. ['read'])
 * @returns {Array<Function>} Express middleware chain
 */
function requireToken(resourcePrefix = '/secrets', permissions = ['read']) {
  return [
    // First, validate the CA token (factory — must be invoked with options)
    validateCAToken({
      requiredPermissions: toPermissionArray(permissions),
      resourceType: 'vault'
    }),
    // Then, enforce the resource prefix / token scope
    enforceResourceScope(resourcePrefix)
  ];
}

/**
 * Require write permission for Vault operations
 * @param {string} resourcePrefix - Resource prefix for token validation
 * @returns {Array<Function>} Express middleware chain
 */
function requireWrite(resourcePrefix = '/secrets') {
  return requireToken(resourcePrefix, ['write']);
}

/**
 * Require delete permission for Vault operations
 * @param {string} resourcePrefix - Resource prefix for token validation
 * @returns {Array<Function>} Express middleware chain
 */
function requireDelete(resourcePrefix = '/secrets') {
  return requireToken(resourcePrefix, ['delete']);
}

/**
 * Require read permission for Vault operations
 * @param {string} resourcePrefix - Resource prefix for token validation
 * @returns {Array<Function>} Express middleware chain
 */
function requireRead(resourcePrefix = '/secrets') {
  return requireToken(resourcePrefix, ['read']);
}

/**
 * Require admin permission for Vault management operations
 * @param {string} resourcePrefix - Resource prefix for token validation
 * @returns {Array<Function>} Express middleware chain
 */
function requireAdmin(resourcePrefix = '/config') {
  return requireToken(resourcePrefix, ['admin']);
}

/**
 * Build the authenticated principal context to thread into services for
 * entity scoping of queries.
 * @param {Object} req - Express request (after requireToken middleware)
 * @returns {Object} { userId, permissions, resourceScope }
 */
function buildAuthContext(req) {
  return {
    userId: req.userId || req.user?.id || null,
    permissions: req.permissions || {},
    resourceScope: getTokenResourceScope(req)
  };
}

module.exports = {
  requireToken,
  requireWrite,
  requireDelete,
  requireRead,
  requireAdmin,
  buildAuthContext
};
