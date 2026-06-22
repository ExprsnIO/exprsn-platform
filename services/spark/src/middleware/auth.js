/**
 * Exprsn Spark - Authentication Middleware
 *
 * Validates CA bearer tokens against the Certificate Authority. Under the
 * unified platform the CA runs in-process behind the gateway, and its
 * /api/tokens/validate is guarded by requireSessionOrService — so this MUST
 * present identity-bound service headers (X-Service-ID/X-Service-Token) and
 * target the in-process CA URL, exactly like @exprsn/shared's validateCAToken.
 * (The encryption/attachments/enhanced routes use this middleware.)
 */

const axios = require('axios');
const { deriveServiceToken } = require('@exprsn/shared/utils/serviceToken');
const { isPlatformAdmin } = require('@exprsn/shared/utils/platformAdmin');

const CA_BASE_URL =
  process.env.CA_URL ||
  process.env.CA_BASE_URL ||
  process.env.CA_SERVICE_URL ||
  'http://localhost:3000';

/**
 * Identity-bound service headers for CA calls. Returns {} when no service
 * identity is configured so the CA still decides whether to accept the call.
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
    return {};
  }
}

/** Normalize the CA validation response onto the request. */
function attachUser(req, data) {
  req.userId = data.userId;
  req.permissions = data.permissions;
  req.tokenData = data.tokenData;
  // Platform admins (PLATFORM_ADMIN_EMAILS) are full admins across every module
  // regardless of the token's discrete permissions — matches CA/auth/filevault.
  // The queue routes gate on req.user.isAdmin.
  const isAdmin = isPlatformAdmin(data.tokenData && data.tokenData.email);
  // Preserve the `req.user.id` shape the spark routes read.
  req.user = data.user || { id: data.userId, permissions: data.permissions };
  req.user.isAdmin = req.user.isAdmin || isAdmin;
  req.token = data.token;
}

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

    // Validate token with CA service (in-process under the platform)
    const response = await axios.post(
      `${CA_BASE_URL}/api/tokens/validate`,
      { token },
      {
        headers: { 'Content-Type': 'application/json', ...buildServiceHeaders() },
        timeout: 5000
      }
    );

    if (!response.data.valid) {
      return res.status(401).json({
        error: 'INVALID_TOKEN',
        message: 'Token validation failed'
      });
    }

    attachUser(req, response.data);
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
    const response = await axios.post(
      `${CA_BASE_URL}/api/tokens/validate`,
      { token },
      { headers: { 'Content-Type': 'application/json', ...buildServiceHeaders() }, timeout: 5000 }
    );

    if (response.data.valid) {
      attachUser(req, response.data);
    } else {
      req.user = null;
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
