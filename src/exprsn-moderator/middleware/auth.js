/**
 * ═══════════════════════════════════════════════════════════
 * Authentication Middleware
 * CA Token validation for API requests
 * ═══════════════════════════════════════════════════════════
 */

const tokenValidation = require('../utils/tokenValidation');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Verify service authentication token
 * Ensures request is from authorized service
 */
async function authenticateService(req, res, next) {
  try {
    // Extract token from request
    const tokenString = tokenValidation.extractToken(req);

    if (!tokenString) {
      return res.status(401).json({
        error: 'MISSING_TOKEN',
        message: 'Authentication token required'
      });
    }

    // Validate token
    const validation = await tokenValidation.validateToken(tokenString, {
      requiredPermissions: { write: true },
      resource: '/moderation'
    });

    if (!validation.valid) {
      return res.status(401).json({
        error: validation.error,
        message: validation.message
      });
    }

    // Check if service is authorized
    const issuerDomain = validation.token.issuer.domain;
    if (!config.authorizedServices.includes(issuerDomain)) {
      return res.status(403).json({
        error: 'UNAUTHORIZED_SERVICE',
        message: 'Service not authorized for moderation requests'
      });
    }

    // Attach validated token to request
    req.token = validation.token;
    req.serviceHostname = issuerDomain;

    logger.debug('Service authenticated', { service: issuerDomain });

    next();

  } catch (error) {
    logger.error('Authentication error', { error: error.message });
    return res.status(500).json({
      error: 'AUTHENTICATION_ERROR',
      message: 'Authentication failed'
    });
  }
}

/**
 * Verify moderator authentication token
 * Ensures request is from authorized moderator
 */
async function authenticateModerator(req, res, next) {
  try {
    // Extract token
    const tokenString = tokenValidation.extractToken(req);

    if (!tokenString) {
      return res.status(401).json({
        error: 'MISSING_TOKEN',
        message: 'Moderator authentication required'
      });
    }

    // Validate token with elevated permissions
    const validation = await tokenValidation.validateToken(tokenString, {
      requiredPermissions: { delete: true }, // Moderators have delete permission
      resource: '/moderation/actions'
    });

    if (!validation.valid) {
      return res.status(401).json({
        error: validation.error,
        message: validation.message
      });
    }

    // Check moderator role in token data
    const roles = validation.token.data?.roles || [];
    if (!roles.includes('moderator') && !roles.includes('admin')) {
      return res.status(403).json({
        error: 'INSUFFICIENT_PERMISSIONS',
        message: 'Moderator role required'
      });
    }

    // Attach validated token to request
    req.token = validation.token;
    req.moderatorId = validation.token.userId;
    req.moderatorRoles = roles;

    logger.debug('Moderator authenticated', {
      moderatorId: req.moderatorId,
      roles
    });

    next();

  } catch (error) {
    logger.error('Moderator authentication error', { error: error.message });
    return res.status(500).json({
      error: 'AUTHENTICATION_ERROR',
      message: 'Authentication failed'
    });
  }
}

/**
 * Verify senior moderator or admin
 * For sensitive actions like bans
 */
function requireSeniorModerator(req, res, next) {
  const roles = req.moderatorRoles || [];

  if (!roles.includes('senior_moderator') && !roles.includes('admin')) {
    return res.status(403).json({
      error: 'INSUFFICIENT_PERMISSIONS',
      message: 'Senior moderator or admin role required'
    });
  }

  next();
}

/**
 * Optional authentication
 * Validates token if present but doesn't require it
 */
async function optionalAuth(req, res, next) {
  try {
    const tokenString = tokenValidation.extractToken(req);

    if (tokenString) {
      const validation = await tokenValidation.validateToken(tokenString);

      if (validation.valid) {
        req.token = validation.token;
        req.authenticated = true;
      }
    }

    next();

  } catch (error) {
    // Continue without authentication
    next();
  }
}

module.exports = {
  authenticateService,
  authenticateModerator,
  requireSeniorModerator,
  optionalAuth
};
