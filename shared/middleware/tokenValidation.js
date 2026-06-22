/**
 * ═══════════════════════════════════════════════════════════
 * Token Validation Middleware
 * Validates CA tokens for all Exprsn services
 * See: TOKEN_SPECIFICATION_V1.0.md Section 9
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const logger = require('../utils/logger');
const { deriveServiceToken } = require('../utils/serviceToken');

/**
 * Build identity-bound service headers for calls to the CA.
 * Returns {} when no service identity is configured (e.g. local dev
 * before SERVICE_TOKEN_SECRET is set) so the call still goes out and
 * the CA decides whether to accept it.
 */
function buildServiceHeaders() {
  const serviceId = process.env.SERVICE_ID || process.env.SERVICE_NAME;

  if (!serviceId) return {};

  try {
    return {
      'X-Service-ID': serviceId,
      'X-Service-Token': deriveServiceToken(serviceId)
    };
  } catch (error) {
    logger.warn('Service identity not available for CA calls', { error: error.message });
    return {};
  }
}

/**
 * Refuse plaintext token-validation URLs in production
 * @param {string} url - CA validation URL
 * @returns {string} The validated URL
 */
function assertSecureCaUrl(url) {
  if (process.env.NODE_ENV === 'production' && /^http:\/\//i.test(url)) {
    throw new Error(
      `Refusing to validate tokens over plaintext HTTP in production: ${url}. ` +
      'Configure an https:// CA URL.'
    );
  }
  return url;
}

/**
 * Validates CA token against the Certificate Authority
 * @param {Object} options - Validation options
 * @param {Array<string>} options.requiredPermissions - Required permissions (e.g., ['read', 'write'])
 * @param {string} options.resourceType - Expected resource type (optional)
 * @returns {Function} Express middleware
 */
function validateCAToken(options = {}) {
  const {
    requiredPermissions = [],
    resourceType = null,
    caUrl = process.env.CA_URL || process.env.CA_BASE_URL || process.env.CA_SERVICE_URL || 'http://localhost:3000'
  } = options;

  assertSecureCaUrl(caUrl);

  return async (req, res, next) => {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'MISSING_TOKEN',
          message: 'Authorization token required'
        });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      // Validate token with CA
      const validationResponse = await axios.post(
        `${caUrl}/api/tokens/validate`,
        {
          token,
          requiredPermissions,
          resource: req.path,
          resourceType
        },
        {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json',
            ...buildServiceHeaders()
          }
        }
      );

      if (!validationResponse.data.valid) {
        logger.warn('Token validation failed', {
          reason: validationResponse.data.reason,
          path: req.path
        });

        return res.status(403).json({
          error: 'INVALID_TOKEN',
          message: validationResponse.data.reason || 'Token validation failed'
        });
      }

      // Attach token data to request
      req.tokenData = validationResponse.data.tokenData;
      req.userId = validationResponse.data.userId;
      req.permissions = validationResponse.data.permissions;

      logger.info('Token validated successfully', {
        userId: req.userId,
        path: req.path
      });

      next();
    } catch (error) {
      logger.error('Token validation error', {
        error: error.message,
        path: req.path
      });

      // Handle CA unavailability
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        return res.status(503).json({
          error: 'CA_UNAVAILABLE',
          message: 'Certificate Authority is currently unavailable'
        });
      }

      return res.status(500).json({
        error: 'VALIDATION_ERROR',
        message: 'Failed to validate token'
      });
    }
  };
}

/**
 * Validates token permissions
 * @param {Array<string>} permissions - Required permissions
 * @returns {Function} Express middleware
 */
function requirePermissions(permissions) {
  return (req, res, next) => {
    if (!req.permissions) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'No permissions found'
      });
    }

    const hasPermissions = permissions.every(perm =>
      req.permissions[perm] === true
    );

    if (!hasPermissions) {
      logger.warn('Insufficient permissions', {
        required: permissions,
        actual: req.permissions,
        userId: req.userId
      });

      return res.status(403).json({
        error: 'INSUFFICIENT_PERMISSIONS',
        message: `Required permissions: ${permissions.join(', ')}`
      });
    }

    next();
  };
}

/**
 * Optional token validation (doesn't fail if no token)
 */
function optionalToken(options = {}) {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return next();
    }

    return validateCAToken(options)(req, res, next);
  };
}

module.exports = {
  validateCAToken,
  requirePermissions,
  optionalToken
};
