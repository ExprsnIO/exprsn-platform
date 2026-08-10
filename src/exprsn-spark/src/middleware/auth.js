/**
 * Exprsn Spark - Authentication Middleware
 */

const axios = require('axios');

const CA_BASE_URL = process.env.CA_BASE_URL || 'http://localhost:3000';

/**
 * Validate CA Token middleware
 */
async function validateCAToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header'
      });
    }

    const token = authHeader.substring(7);

    // Validate token with CA service
    const response = await axios.post(`${CA_BASE_URL}/api/tokens/validate`, {
      token
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });

    if (!response.data.valid) {
      return res.status(401).json({
        error: 'INVALID_TOKEN',
        message: 'Token validation failed'
      });
    }

    // Attach user info to request
    req.user = response.data.user;
    req.token = response.data.token;

    next();
  } catch (error) {
    if (error.response?.status === 401) {
      return res.status(401).json({
        error: 'INVALID_TOKEN',
        message: 'Token is invalid or expired'
      });
    }

    console.error('Token validation error:', error.message);
    return res.status(500).json({
      error: 'AUTH_ERROR',
      message: 'Authentication service error'
    });
  }
}

/**
 * Optional auth - continues even without valid token
 */
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  try {
    const token = authHeader.substring(7);
    const response = await axios.post(`${CA_BASE_URL}/api/tokens/validate`, {
      token
    }, { timeout: 5000 });

    if (response.data.valid) {
      req.user = response.data.user;
      req.token = response.data.token;
    }
  } catch (error) {
    req.user = null;
  }

  next();
}

module.exports = {
  validateCAToken,
  optionalAuth,
  requireAuth: validateCAToken // Alias for consistency with other services
};
