/**
 * ═══════════════════════════════════════════════════════════════════════
 * Authentication Middleware - CA Token Validation
 * See: TOKEN_SPECIFICATION_V1.0.md Section 9 (Token Validation)
 * ═══════════════════════════════════════════════════════════════════════
 */

const logger = require('../utils/logger');

/**
 * Extract token from request
 * Checks Authorization header, query parameter, and cookies
 */
function extractToken(req) {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check query parameter
  if (req.query.token) {
    return req.query.token;
  }

  // Check cookie
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }

  return null;
}

/**
 * Mock CA token validation - replace with actual CA integration
 * TODO: Integrate with CA token validation service
 */
async function validateCAToken(token, options = {}) {
  // This is a mock implementation
  // In production, this would call the CA service to validate the token
  try {
    // Decode mock token
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));

    // Check expiration
    if (decoded.expiresAt && Date.now() > decoded.expiresAt) {
      throw new Error('TOKEN_EXPIRED');
    }

    // Check permissions
    if (options.requiredPermissions) {
      for (const [perm, required] of Object.entries(options.requiredPermissions)) {
        if (required && !decoded.permissions[perm]) {
          throw new Error('INSUFFICIENT_PERMISSIONS');
        }
      }
    }

    return {
      valid: true,
      token: {
        id: decoded.data?.tokenId || 'mock-token-id',
        data: {
          userId: decoded.data?.userId || 'mock-user-id',
          fileId: decoded.data?.fileId
        },
        permissions: decoded.permissions
      }
    };
  } catch (error) {
    logger.error('Token validation failed:', error);
    throw error;
  }
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

    // Validate token
    const validation = await validateCAToken(token);

    if (!validation.valid) {
      return res.status(401).json({
        error: 'INVALID_TOKEN',
        message: 'Token validation failed'
      });
    }

    // Attach user info to request
    req.userId = validation.token.data.userId;
    req.tokenData = validation.token.data;
    req.permissions = validation.token.permissions;

    next();
  } catch (error) {
    logger.error('Authentication error:', error);

    if (error.message === 'TOKEN_EXPIRED') {
      return res.status(401).json({
        error: 'TOKEN_EXPIRED',
        message: 'Authentication token has expired'
      });
    }

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
