/**
 * Authentication Middleware
 *
 * Validates CA tokens from the Authorization header using the shared token validation module.
 */

const { validateCAToken } = require('@exprsn/shared');
const logger = require('../config/logger');

/**
 * Create authentication middleware based on lexicon auth config
 * @param {Object} authConfig - Authentication configuration from lexicon
 * @returns {Function} Express middleware function
 */
function createAuthMiddleware(authConfig) {
  return async (req, res, next) => {
    try {
      // Skip if auth not required
      if (!authConfig || !authConfig.required) {
        return next();
      }

      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'AUTHENTICATION_REQUIRED',
          message: 'Authorization header with Bearer token required'
        });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      // Validate token using shared module
      const validation = await validateCAToken(token);

      if (!validation.valid) {
        return res.status(401).json({
          error: 'INVALID_TOKEN',
          message: validation.error || 'Token validation failed',
          code: validation.code
        });
      }

      // Check certificate binding if required
      if (authConfig.certificateBinding) {
        const clientCert = req.socket.getPeerCertificate();

        if (!clientCert || !clientCert.raw) {
          return res.status(403).json({
            error: 'CERTIFICATE_REQUIRED',
            message: 'Client certificate required for this endpoint'
          });
        }

        // Calculate certificate thumbprint
        const crypto = require('crypto');
        const thumbprint = crypto
          .createHash('sha256')
          .update(clientCert.raw)
          .digest('hex');

        // Verify binding matches
        if (validation.token.binding?.certificateThumbprint !== thumbprint) {
          logger.warn('Certificate binding mismatch', {
            expected: validation.token.binding?.certificateThumbprint,
            actual: thumbprint
          });

          return res.status(403).json({
            error: 'BINDING_MISMATCH',
            message: 'Token certificate binding does not match client certificate'
          });
        }
      }

      // Attach validated token to request
      req.token = validation.token;
      req.tokenValidation = validation;

      next();
    } catch (error) {
      logger.error('Authentication middleware error:', error);
      return res.status(500).json({
        error: 'AUTHENTICATION_ERROR',
        message: 'Token validation failed'
      });
    }
  };
}

module.exports = { createAuthMiddleware };
