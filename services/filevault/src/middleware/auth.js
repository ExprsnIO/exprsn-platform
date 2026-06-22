/**
 * ═══════════════════════════════════════════════════════════════════════
 * Authentication Middleware - CA Token Validation
 * See: TOKEN_SPECIFICATION_V1.0.md Section 9 (Token Validation)
 *
 * Tokens are validated against the Certificate Authority service
 * (CA_SERVICE_URL) via the shared CATokenValidator — signature,
 * expiry, revocation, and permission checks are performed by the CA.
 * ═══════════════════════════════════════════════════════════════════════
 */

const { getValidator } = require('@exprsn/shared/utils/caTokenValidator');
const { isPlatformAdmin } = require('@exprsn/shared/utils/platformAdmin');
const caConfig = require('../config/ca');
const logger = require('../utils/logger');

/**
 * Extract token from request
 * Accepts the Authorization header and cookies only. Query-string tokens
 * are NOT accepted — they leak into access logs, referrers, and history.
 */
function extractToken(req) {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check cookie
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }

  return null;
}

/**
 * Validate a CA token against the Certificate Authority service.
 * The CA performs signature, expiry, revocation, certificate, and
 * permission checks (TOKEN_SPECIFICATION_V1.0.md Section 9).
 *
 * @param {string} token - Token to validate
 * @param {Object} options - Validation options
 * @param {Object} options.requiredPermissions - e.g. { read: true }
 * @param {string} options.resource - Resource being accessed (optional)
 * @returns {Promise<Object>} { valid, token: { id, data, permissions }, error?, message? }
 */
async function validateCAToken(token, options = {}) {
  const validator = getValidator({ caBaseUrl: caConfig.caServiceUrl });

  const result = await validator.validateToken(token, {
    requiredPermissions: options.requiredPermissions || {},
    resource: options.resource || null
  });

  if (!result.valid) {
    return {
      valid: false,
      error: result.error || 'INVALID_TOKEN',
      message: result.message || 'Token validation failed'
    };
  }

  // Normalize to the shape this module's consumers expect
  const tokenData = result.tokenData || result.token?.data || {};

  return {
    valid: true,
    token: {
      id: result.token?.id || null,
      data: {
        ...tokenData,
        userId: result.userId || tokenData.userId
      },
      permissions: result.permissions || result.token?.permissions || {}
    }
  };
}

/**
 * Authentication middleware
 * Validates CA token and attaches user info to request
 */
async function authenticate(req, res, next) {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication token required'
      });
    }

    // Validate token with the Certificate Authority
    const validation = await validateCAToken(token, {
      resource: `${req.baseUrl || ''}${req.path}`
    });

    if (!validation.valid) {
      if (validation.error === 'CA_UNAVAILABLE') {
        return res.status(503).json({
          error: 'CA_UNAVAILABLE',
          message: 'Certificate Authority is currently unavailable'
        });
      }

      return res.status(401).json({
        error: validation.error || 'INVALID_TOKEN',
        message: validation.message || 'Token validation failed'
      });
    }

    // Attach VERIFIED user info to request
    req.userId = validation.token.data.userId;
    req.tokenData = validation.token.data;
    req.permissions = validation.token.permissions;
    // Platform admins (PLATFORM_ADMIN_EMAILS) are full admins across every
    // module regardless of the token's discrete permission flags — matches CA
    // and auth. requirePermissions() short-circuits on this.
    req.isPlatformAdmin = isPlatformAdmin(validation.token.data.email);

    next();
  } catch (error) {
    logger.error('Authentication error:', error);

    res.status(401).json({
      error: 'AUTHENTICATION_FAILED',
      message: 'Authentication failed'
    });
  }
}

/**
 * Require specific permissions
 */
function requirePermissions(requiredPermissions) {
  return (req, res, next) => {
    // Platform admins satisfy any permission requirement.
    if (req.isPlatformAdmin) {
      return next();
    }

    if (!req.permissions) {
      return res.status(403).json({
        error: 'INSUFFICIENT_PERMISSIONS',
        message: 'No permissions found'
      });
    }

    for (const [perm, required] of Object.entries(requiredPermissions)) {
      if (required && !req.permissions[perm]) {
        return res.status(403).json({
          error: 'INSUFFICIENT_PERMISSIONS',
          message: `Missing required permission: ${perm}`
        });
      }
    }

    next();
  };
}

module.exports = {
  extractToken,
  validateCAToken,
  authenticate,
  requirePermissions
};
