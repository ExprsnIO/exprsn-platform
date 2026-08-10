/**
 * ═══════════════════════════════════════════════════════════
 * CA Token Validation Middleware
 * Validates tokens from the Exprsn Certificate Authority
 * See: TOKEN_SPECIFICATION_V1.0.md
 * ═══════════════════════════════════════════════════════════
 */

const forge = require('node-forge');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const { AppError } = require('./errorHandler');

/**
 * Load CA public key from file
 */
function loadCAPublicKey() {
  try {
    const keyPath = path.resolve(config.ca.publicKeyPath);
    if (!fs.existsSync(keyPath)) {
      logger.warn('CA public key not found at ' + keyPath + '. Token validation will fail.');
      return null;
    }
    const pemKey = fs.readFileSync(keyPath, 'utf8');
    return forge.pki.publicKeyFromPem(pemKey);
  } catch (error) {
    logger.error('Failed to load CA public key:', error);
    return null;
  }
}

let caPublicKey = null;
if (config.ca.verifyTokens) {
  caPublicKey = loadCAPublicKey();
}

/**
 * Validate CA token structure and signature
 */
function validateCAToken(token) {
  if (!token || typeof token !== 'object') {
    throw new AppError('Invalid token format', 401);
  }

  // Required fields
  const requiredFields = ['id', 'version', 'userId', 'certificateId', 'signature', 'checksum'];
  for (const field of requiredFields) {
    if (!token[field]) {
      throw new AppError('Missing required token field: ' + field, 401);
    }
  }

  // Verify checksum
  const tokenCopy = { ...token };
  delete tokenCopy.signature;
  const checksumData = JSON.stringify(tokenCopy);
  const md = forge.md.sha256.create();
  md.update(checksumData, 'utf8');
  const computedChecksum = md.digest().toHex();

  if (computedChecksum !== token.checksum) {
    throw new AppError('Token checksum validation failed', 401);
  }

  // Verify signature if CA public key is available
  if (caPublicKey && config.ca.verifyTokens) {
    try {
      const signatureBytes = forge.util.decode64(token.signature);
      const md = forge.md.sha256.create();
      md.update(checksumData, 'utf8');
      
      const verified = caPublicKey.verify(md.digest().bytes(), signatureBytes);
      if (!verified) {
        throw new AppError('Token signature verification failed', 401);
      }
    } catch (error) {
      logger.error('Signature verification error:', error);
      throw new AppError('Token signature verification failed', 401);
    }
  }

  // Check expiration
  if (token.expiryType === 'time') {
    const now = Date.now();
    if (token.expiresAt && token.expiresAt < now) {
      throw new AppError('Token has expired', 401, { code: 'TOKEN_EXPIRED' });
    }
    if (token.notBefore && token.notBefore > now) {
      throw new AppError('Token not yet valid', 401, { code: 'TOKEN_NOT_YET_VALID' });
    }
  }

  // Check usage limits
  if (token.expiryType === 'use') {
    if (token.usesRemaining !== undefined && token.usesRemaining <= 0) {
      throw new AppError('Token usage limit exceeded', 401, { code: 'TOKEN_USAGE_EXCEEDED' });
    }
  }

  // Check token status
  if (token.status && token.status !== 'active') {
    const statusCode = 'TOKEN_' + token.status.toUpperCase();
    throw new AppError('Token is ' + token.status, 401, { code: statusCode });
  }

  return true;
}

/**
 * Check if token has required permissions
 */
function checkPermissions(token, requiredPermissions = {}) {
  for (const [permission, required] of Object.entries(requiredPermissions)) {
    const permissionKey = 'permission' + permission.charAt(0).toUpperCase() + permission.slice(1);
    if (required && !token[permissionKey]) {
      throw new AppError('Missing required permission: ' + permission, 403);
    }
  }
  return true;
}

/**
 * Middleware to require CA token authentication
 */
function requireCAToken(options = {}) {
  return async (req, res, next) => {
    try {
      // Development bypass for local testing without CA service
      const isDevelopment = process.env.NODE_ENV === 'development';
      const bypassEnabled = process.env.CA_TOKEN_VALIDATION_ENABLED === 'false';

      if (isDevelopment && bypassEnabled) {
        logger.warn('[CA Auth] Development bypass enabled - using dummy user');
        req.user = {
          id: 'dev-user-00000000-0000-0000-0000-000000000000',
          certificateId: 'dev-cert-00000000-0000-0000-0000-000000000000',
          username: 'developer',
          email: 'dev@localhost'
        };
        req.caToken = {
          id: 'dev-token',
          version: '1.0',
          userId: req.user.id,
          certificateId: req.user.certificateId,
          permissionRead: true,
          permissionWrite: true,
          permissionUpdate: true,
          permissionDelete: true,
          permissionAppend: true
        };
        return next();
      }

      // Extract token from header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AppError('No token provided', 401);
      }

      const tokenString = authHeader.substring(7);
      
      // Parse token JSON
      let token;
      try {
        token = JSON.parse(tokenString);
      } catch (error) {
        throw new AppError('Invalid token format', 401);
      }

      // Validate token
      validateCAToken(token);

      // Check permissions if specified
      if (options.requiredPermissions) {
        checkPermissions(token, options.requiredPermissions);
      }

      // Attach token and user info to request
      req.caToken = token;
      req.user = {
        id: token.userId,
        certificateId: token.certificateId
      };

      logger.info('CA token validated', {
        tokenId: token.id,
        userId: token.userId,
        url: req.url
      });

      next();
    } catch (error) {
      if (error instanceof AppError) {
        next(error);
      } else {
        logger.error('Token validation error:', error);
        next(new AppError('Token validation failed', 401));
      }
    }
  };
}

/**
 * Optional CA token authentication (sets user if token is valid)
 */
function optionalCAToken() {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const tokenString = authHeader.substring(7);
        const token = JSON.parse(tokenString);
        
        validateCAToken(token);
        
        req.caToken = token;
        req.user = {
          id: token.userId,
          certificateId: token.certificateId
        };
      }
    } catch (error) {
      // Silently fail for optional auth
      logger.debug('Optional token validation failed:', error.message);
    }
    next();
  };
}

module.exports = {
  requireCAToken,
  optionalCAToken,
  validateCAToken,
  checkPermissions
};
