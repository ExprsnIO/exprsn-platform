/**
 * Exprsn Herald - Authentication Middleware
 * Validates CA tokens from Exprsn CA
 */

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Verify CA token with Exprsn CA service
 */
async function verifyCAToken(token) {
  try {
    const response = await axios.post(
      `${config.ca.url}/api/tokens/validate`,
      {
        token,
        requiredPermission: 'read',
        resourceValue: '/notifications'
      },
      {
        timeout: 5000
      }
    );

    return response.data;
  } catch (error) {
    logger.error('Error verifying CA token', {
      error: error.message
    });
    return { valid: false, error: error.message };
  }
}

/**
 * Authentication middleware
 * Requires valid CA token in Authorization header
 */
async function requireAuth(req, res, next) {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: 'Authorization header required'
      });
    }

    // Extract token (Bearer token format)
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : authHeader;

    if (!token) {
      return res.status(401).json({
        error: 'Token required'
      });
    }

    // Verify token with CA
    const validation = await verifyCAToken(token);

    if (!validation.valid) {
      return res.status(401).json({
        error: 'Invalid or expired token',
        details: validation.error
      });
    }

    // Attach user info to request
    req.user = {
      id: validation.userId,
      token: validation
    };

    next();
  } catch (error) {
    logger.error('Authentication error', {
      error: error.message
    });
    return res.status(500).json({
      error: 'Authentication failed'
    });
  }
}

/**
 * Optional authentication middleware
 * Validates token if present, but doesn't require it
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader) {
      const token = authHeader.startsWith('Bearer ')
        ? authHeader.substring(7)
        : authHeader;

      if (token) {
        const validation = await verifyCAToken(token);
        if (validation.valid) {
          req.user = {
            id: validation.userId,
            token: validation
          };
        }
      }
    }

    next();
  } catch (error) {
    // Continue without authentication on error
    next();
  }
}

/**
 * Admin authentication middleware
 * Requires admin role
 */
async function requireAdmin(req, res, next) {
  try {
    // First verify authentication
    await requireAuth(req, res, () => {
      // Check if user has admin role
      if (!req.user.token.roles || !req.user.token.roles.includes('admin')) {
        return res.status(403).json({
          error: 'Admin access required'
        });
      }

      next();
    });
  } catch (error) {
    logger.error('Admin authentication error', {
      error: error.message
    });
    return res.status(500).json({
      error: 'Authentication failed'
    });
  }
}

/**
 * Socket.IO authentication middleware
 */
async function socketAuth(socket, next) {
  try {
    const token = socket.handshake.auth.token || socket.handshake.query.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const validation = await verifyCAToken(token);

    if (!validation.valid) {
      return next(new Error('Invalid or expired token'));
    }

    socket.user = {
      id: validation.userId,
      token: validation
    };

    next();
  } catch (error) {
    logger.error('Socket authentication error', {
      error: error.message
    });
    next(new Error('Authentication failed'));
  }
}

module.exports = {
  requireAuth,
  optionalAuth,
  requireAdmin,
  socketAuth,
  verifyCAToken
};
