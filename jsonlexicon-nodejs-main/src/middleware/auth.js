/**
 * Authentication Middleware
 * Supports multiple authentication methods:
 * - JWT tokens
 * - Token handles (35-byte opaque tokens)
 * - Client certificates (mTLS)
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const database = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Extract token from request headers
 */
function extractToken(req) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check custom header
  const customHeader = req.headers[`${config.customHeaderPrefix}token`];
  if (customHeader) {
    return customHeader;
  }

  return null;
}

/**
 * Verify JWT token
 */
async function verifyJWT(token) {
  try {
    const decoded = jwt.verify(token, config.security.jwtSecret);

    // Check if token is blacklisted (in Redis)
    const blacklisted = await redis.client.get(`blacklist:jwt:${token}`);
    if (blacklisted) {
      throw new Error('Token has been revoked');
    }

    return decoded;
  } catch (error) {
    logger.warn('JWT verification failed', { error: error.message });
    throw error;
  }
}

/**
 * Verify token handle and retrieve full token
 */
async function verifyTokenHandle(handle) {
  try {
    // Check cache first
    const cached = await redis.client.get(`token:handle:${handle}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // Query database
    const result = await database.query(
      `SELECT t.*, th.handle
       FROM tokens t
       JOIN token_handles th ON t.id = th.token_id
       WHERE th.handle = $1
         AND t.status = 'active'
         AND (t.expires_at IS NULL OR t.expires_at > EXTRACT(EPOCH FROM NOW()))`,
      [handle]
    );

    if (!result || result.rowCount === 0) {
      throw new Error('Invalid or expired token handle');
    }

    const token = result.rows[0];

    // Cache for 5 minutes
    await redis.client.setex(
      `token:handle:${handle}`,
      300,
      JSON.stringify(token)
    );

    return token;
  } catch (error) {
    logger.warn('Token handle verification failed', { error: error.message, handle });
    throw error;
  }
}

/**
 * Verify client certificate
 */
function verifyCertificate(req) {
  const cert = req.socket.getPeerCertificate();

  if (!cert || !cert.subject) {
    throw new Error('No client certificate provided');
  }

  // Check if certificate is valid
  const now = new Date();
  const validFrom = new Date(cert.valid_from);
  const validTo = new Date(cert.valid_to);

  if (now < validFrom || now > validTo) {
    throw new Error('Client certificate is not valid');
  }

  return cert;
}

/**
 * Calculate certificate thumbprint
 */
function calculateCertThumbprint(cert) {
  if (!cert.raw) {
    throw new Error('Certificate raw data not available');
  }

  return crypto
    .createHash('sha256')
    .update(cert.raw)
    .digest('hex');
}

/**
 * Middleware: Require authentication (any method)
 */
async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);

    if (token) {
      // Check if it's a JWT or token handle
      if (token.includes('.')) {
        // JWT token
        const decoded = await verifyJWT(token);
        req.auth = {
          type: 'jwt',
          userId: decoded.sub || decoded.userId,
          email: decoded.email,
          roles: decoded.roles || [],
          permissions: decoded.permissions || {},
          token: decoded,
        };
      } else if (token.startsWith('tk_')) {
        // Token handle
        const tokenData = await verifyTokenHandle(token);
        req.auth = {
          type: 'token_handle',
          userId: tokenData.created_by,
          subject: tokenData.subject,
          permissions: tokenData.permissions || {},
          scopes: tokenData.scopes || [],
          tokenId: tokenData.id,
          token: tokenData,
        };
      } else {
        return res.status(401).json({
          error: {
            code: 'INVALID_TOKEN_FORMAT',
            message: 'Invalid token format',
            requestId: req.requestId,
          },
        });
      }

      return next();
    }

    // No token found
    return res.status(401).json({
      error: {
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
        requestId: req.requestId,
      },
    });
  } catch (error) {
    logger.error('Authentication failed', {
      error: error.message,
      requestId: req.requestId,
      path: req.path,
    });

    return res.status(401).json({
      error: {
        code: 'AUTHENTICATION_FAILED',
        message: error.message,
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Middleware: Require client certificate (mTLS)
 */
async function requireCertificate(req, res, next) {
  try {
    const cert = verifyCertificate(req);
    const thumbprint = calculateCertThumbprint(cert);

    // Check if certificate is in database and active
    const result = await database.query(
      `SELECT c.*, uc.user_id
       FROM certificates c
       LEFT JOIN user_certificates uc ON c.serial_number = uc.certificate_serial
       WHERE c.fingerprint_sha256 = $1
         AND c.status = 'active'`,
      [thumbprint]
    );

    if (!result || result.rowCount === 0) {
      return res.status(403).json({
        error: {
          code: 'CERTIFICATE_NOT_FOUND',
          message: 'Certificate not found or revoked',
          requestId: req.requestId,
        },
      });
    }

    const certData = result.rows[0];

    req.certificate = {
      ...cert,
      thumbprint,
      serial: certData.serial_number,
      userId: certData.user_id,
      dbData: certData,
    };

    next();
  } catch (error) {
    logger.error('Certificate verification failed', {
      error: error.message,
      requestId: req.requestId,
    });

    return res.status(403).json({
      error: {
        code: 'CERTIFICATE_VERIFICATION_FAILED',
        message: error.message,
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Middleware: Require specific roles
 */
function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.auth) {
      return res.status(401).json({
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required',
          requestId: req.requestId,
        },
      });
    }

    const userRoles = req.auth.roles || [];
    const hasRole = roles.some(role => userRoles.includes(role));

    if (!hasRole) {
      return res.status(403).json({
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: `Required roles: ${roles.join(', ')}`,
          requestId: req.requestId,
        },
      });
    }

    next();
  };
}

/**
 * Middleware: Require specific permissions
 */
function requirePermissions(...permissions) {
  return (req, res, next) => {
    if (!req.auth) {
      return res.status(401).json({
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required',
          requestId: req.requestId,
        },
      });
    }

    const userPermissions = req.auth.permissions || {};
    const hasPermission = permissions.every(perm => {
      const [resource, action] = perm.split(':');
      return userPermissions[resource] && userPermissions[resource].includes(action);
    });

    if (!hasPermission) {
      return res.status(403).json({
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: `Required permissions: ${permissions.join(', ')}`,
          requestId: req.requestId,
        },
      });
    }

    next();
  };
}

/**
 * Middleware: Optional authentication (sets req.auth if authenticated)
 */
async function optionalAuth(req, res, next) {
  try {
    const token = extractToken(req);

    if (token) {
      if (token.includes('.')) {
        const decoded = await verifyJWT(token);
        req.auth = {
          type: 'jwt',
          userId: decoded.sub || decoded.userId,
          email: decoded.email,
          roles: decoded.roles || [],
          permissions: decoded.permissions || {},
          token: decoded,
        };
      } else if (token.startsWith('tk_')) {
        const tokenData = await verifyTokenHandle(token);
        req.auth = {
          type: 'token_handle',
          userId: tokenData.created_by,
          subject: tokenData.subject,
          permissions: tokenData.permissions || {},
          scopes: tokenData.scopes || [],
          tokenId: tokenData.id,
          token: tokenData,
        };
      }
    }

    next();
  } catch (error) {
    // Don't fail, just continue without auth
    next();
  }
}

/**
 * Middleware: Validate token binding (for certificate-bound tokens)
 */
async function validateTokenBinding(req, res, next) {
  if (!req.auth || !req.auth.token) {
    return next();
  }

  const token = req.auth.token;

  // Check if token requires binding
  if (!token.binding_required) {
    return next();
  }

  try {
    if (token.binding_type === 'certificate') {
      // Require certificate
      if (!req.certificate) {
        const cert = verifyCertificate(req);
        req.certificate = cert;
      }

      const thumbprint = calculateCertThumbprint(req.certificate);

      if (token.binding_value !== thumbprint) {
        return res.status(403).json({
          error: {
            code: 'TOKEN_BINDING_FAILED',
            message: 'Token is bound to a different certificate',
            requestId: req.requestId,
          },
        });
      }
    } else if (token.binding_type === 'ip') {
      const clientIp = req.ip || req.connection.remoteAddress;

      if (token.binding_value !== clientIp) {
        return res.status(403).json({
          error: {
            code: 'TOKEN_BINDING_FAILED',
            message: 'Token is bound to a different IP address',
            requestId: req.requestId,
          },
        });
      }
    }

    next();
  } catch (error) {
    logger.error('Token binding validation failed', {
      error: error.message,
      requestId: req.requestId,
    });

    return res.status(403).json({
      error: {
        code: 'TOKEN_BINDING_VALIDATION_FAILED',
        message: error.message,
        requestId: req.requestId,
      },
    });
  }
}

/**
 * Middleware: Attach user object to req.auth
 */
async function attachUser(req, res, next) {
  if (!req.auth || !req.auth.userId) {
    return next();
  }

  try {
    const result = await database.query(
      'SELECT * FROM users WHERE id = $1',
      [req.auth.userId]
    );

    if (result && result.rowCount > 0) {
      req.auth.user = result.rows[0];
    }

    next();
  } catch (error) {
    logger.error('Failed to attach user', {
      error: error.message,
      userId: req.auth.userId,
    });
    next();
  }
}

module.exports = {
  requireAuth,
  requireCertificate,
  requireRoles,
  requirePermissions,
  optionalAuth,
  validateTokenBinding,
  attachUser,
  extractToken,
  verifyJWT,
  verifyTokenHandle,
  verifyCertificate,
  calculateCertThumbprint,
};
