/**
 * Authentication Middleware
 * Used by all Exprsn services for CA token authentication
 *
 * Implements TOKEN_SPECIFICATION_V1.0.md validation flow
 */

const { getValidator, CATokenValidator } = require('../utils/caTokenValidator');
const { verifyServiceToken } = require('../utils/serviceToken');

/**
 * Authenticate request using CA token
 * Extracts token from Authorization header and validates it
 *
 * @param {Object} options - Middleware options
 * @returns {Function} Express middleware
 */
function authenticate(options = {}) {
  const {
    requiredPermissions = {},
    requiredGroups = [],
    optional = false
  } = options;

  return async (req, res, next) => {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      const token = CATokenValidator.extractToken(authHeader);

      if (!token) {
        if (optional) {
          req.user = null;
          req.token = null;
          return next();
        }

        return res.status(401).json({
          error: 'MISSING_TOKEN',
          message: 'Authorization token is required',
          hint: 'Include token in Authorization header: "Bearer <token>"'
        });
      }

      // Get validator instance
      const validator = getValidator();

      // Determine resource from request
      const resource = `${req.method}:${req.baseUrl}${req.path}`;

      // Validate token
      const validationResult = await validator.validateToken(token, {
        requiredPermissions,
        resource
      });

      if (!validationResult.valid) {
        return res.status(validationResult.error === 'INSUFFICIENT_PERMISSIONS' ? 403 : 401).json({
          error: validationResult.error,
          message: validationResult.message,
          details: validationResult.details
        });
      }

      // Check group membership if required
      if (requiredGroups.length > 0) {
        const userId = validationResult.userId;
        const hasGroup = await validator.checkGroupMembership(userId, requiredGroups);

        if (!hasGroup) {
          return res.status(403).json({
            error: 'INSUFFICIENT_PRIVILEGES',
            message: 'User is not member of required group',
            requiredGroups
          });
        }
      }

      // Attach user and token info to request
      req.user = {
        id: validationResult.userId,
        permissions: validationResult.permissions,
        groups: validationResult.groups || []
      };

      req.token = {
        id: token,
        permissions: validationResult.permissions,
        resourcePattern: validationResult.resourcePattern,
        expiresAt: validationResult.expiresAt
      };

      next();
    } catch (error) {
      console.error('Authentication error:', error);
      return res.status(500).json({
        error: 'AUTH_ERROR',
        message: 'Authentication failed',
        details: error.message
      });
    }
  };
}

/**
 * Require specific permissions
 * Use after authenticate() middleware
 *
 * @param {Object} permissions - Required permissions
 * @returns {Function} Express middleware
 */
function requirePermissions(permissions) {
  return (req, res, next) => {
    if (!req.token) {
      return res.status(401).json({
        error: 'UNAUTHENTICATED',
        message: 'Authentication required'
      });
    }

    const tokenPermissions = req.token.permissions || {};
    const hasPermissions = Object.entries(permissions).every(
      ([perm, required]) => !required || tokenPermissions[perm]
    );

    if (!hasPermissions) {
      return res.status(403).json({
        error: 'INSUFFICIENT_PERMISSIONS',
        message: 'Missing required permissions',
        required: permissions,
        granted: tokenPermissions
      });
    }

    next();
  };
}

/**
 * Require user to be member of specific group
 * Use after authenticate() middleware
 *
 * @param {Array<string>} groupIds - Required group IDs
 * @returns {Function} Express middleware
 */
function requireGroup(groupIds) {
  if (!Array.isArray(groupIds)) {
    groupIds = [groupIds];
  }

  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'UNAUTHENTICATED',
        message: 'Authentication required'
      });
    }

    const validator = getValidator();
    const hasGroup = await validator.checkGroupMembership(req.user.id, groupIds);

    if (!hasGroup) {
      return res.status(403).json({
        error: 'INSUFFICIENT_PRIVILEGES',
        message: 'User is not member of required group',
        requiredGroups: groupIds
      });
    }

    next();
  };
}

/**
 * Check if user owns the resource
 * Compares req.user.id with req.params.userId or req.params.id
 *
 * @param {string} paramName - Parameter name containing owner ID (default: 'userId')
 * @returns {Function} Express middleware
 */
function requireOwnership(paramName = 'userId') {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'UNAUTHENTICATED',
        message: 'Authentication required'
      });
    }

    const resourceOwnerId = req.params[paramName] || req.body[paramName];

    if (!resourceOwnerId) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: `Missing ${paramName} parameter`
      });
    }

    if (req.user.id !== resourceOwnerId) {
      return res.status(403).json({
        error: 'ACCESS_DENIED',
        message: 'You do not own this resource'
      });
    }

    next();
  };
}

/**
 * Service-to-service authentication
 * Validates that request is from another Exprsn service.
 *
 * The presented X-Service-Token must equal
 * HMAC-SHA256(X-Service-ID, SERVICE_TOKEN_SECRET), binding the claimed
 * identity to the credential. Compared in constant time. The legacy shared
 * SERVICE_TOKEN is accepted only when SERVICE_TOKEN_LEGACY_ALLOW === 'true'.
 *
 * @returns {Function} Express middleware
 */
function authenticateService() {
  return async (req, res, next) => {
    const serviceId = req.headers['x-service-id'];
    const serviceToken = req.headers['x-service-token'];

    if (!serviceId || !serviceToken) {
      return res.status(401).json({
        error: 'MISSING_SERVICE_CREDENTIALS',
        message: 'Service authentication required',
        hint: 'Include X-Service-ID and X-Service-Token headers'
      });
    }

    try {
      // Recompute the HMAC for the claimed service id and compare in
      // constant time — binds identity to credential.
      const valid = verifyServiceToken(serviceId, serviceToken);

      if (!valid) {
        return res.status(401).json({
          error: 'INVALID_SERVICE_TOKEN',
          message: 'Service authentication failed'
        });
      }

      // Attach service info to request
      req.service = {
        id: serviceId,
        authenticated: true
      };

      next();
    } catch (error) {
      console.error('Service authentication error:', error.message);
      return res.status(500).json({
        error: 'SERVICE_AUTH_ERROR',
        message: 'Service authentication failed'
      });
    }
  };
}

/**
 * Rate limiting by user ID
 * Simple in-memory rate limiter
 *
 * @param {Object} options - Rate limit options
 * @returns {Function} Express middleware
 */
function rateLimit(options = {}) {
  const {
    windowMs = 60000, // 1 minute
    max = 100, // 100 requests per window
    keyGenerator = (req) => req.user?.id || req.ip
  } = options;

  const requests = new Map();

  // Clean up old entries periodically (unref'd so it never keeps the process alive)
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, data] of requests.entries()) {
      if (now > data.resetAt) {
        requests.delete(key);
      }
    }
  }, windowMs);
  if (typeof cleanupInterval.unref === 'function') cleanupInterval.unref();

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();

    let requestData = requests.get(key);

    if (!requestData || now > requestData.resetAt) {
      requestData = {
        count: 0,
        resetAt: now + windowMs
      };
      requests.set(key, requestData);
    }

    requestData.count++;

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - requestData.count));
    res.setHeader('X-RateLimit-Reset', new Date(requestData.resetAt).toISOString());

    if (requestData.count > max) {
      return res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
        retryAfter: requestData.resetAt - now
      });
    }

    next();
  };
}

module.exports = {
  authenticate,
  requirePermissions,
  requireGroup,
  requireOwnership,
  authenticateService,
  rateLimit
};
