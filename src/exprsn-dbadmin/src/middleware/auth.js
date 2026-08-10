const { validateCAToken, requirePermissions } = require('@exprsn/shared');
const { AuditLog } = require('../models');
const { logger } = require('@exprsn/shared');

/**
 * Authentication middleware using CA tokens
 * Validates tokens and attaches user info to request
 */
const authenticate = (req, res, next) => {
  // In development, allow bypassing auth with a test user
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_AUTH === 'true') {
    req.user = {
      id: '00000000-0000-0000-0000-000000000000',
      email: 'test@example.com',
      role: 'admin'
    };
    return next();
  }

  // Use shared CA token validation middleware
  return validateCAToken(req, res, next);
};

/**
 * Require admin role for database administration
 */
const requireAdmin = (req, res, next) => {
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_AUTH === 'true') {
    return next();
  }

  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required'
    });
  }

  // Check if user has admin role
  if (req.user.role !== 'admin' && req.user.role !== 'dba') {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'Database administrator privileges required'
    });
  }

  next();
};

/**
 * Require specific database permissions
 */
const requireDBPermissions = (permissions) => {
  return (req, res, next) => {
    if (process.env.NODE_ENV === 'development' && process.env.SKIP_AUTH === 'true') {
      return next();
    }

    // Use shared permissions middleware
    return requirePermissions(permissions)(req, res, next);
  };
};

/**
 * Audit logging middleware
 * Logs all database operations for security audit trail
 */
const auditLogger = (action, resourceType) => {
  return async (req, res, next) => {
    // Store original send function
    const originalSend = res.send;

    // Override send to capture response
    res.send = function(data) {
      // Restore original send
      res.send = originalSend;

      // Log audit entry (async, don't wait)
      setImmediate(async () => {
        try {
          const userId = req.user?.id || 'anonymous';
          const status = res.statusCode >= 200 && res.statusCode < 300 ? 'success' : 'failure';

          await AuditLog.create({
            userId,
            action,
            resourceType,
            resourceId: req.params.id || req.params.table || req.params.name || null,
            connectionId: req.body?.connectionId || req.query?.connectionId || null,
            details: {
              method: req.method,
              path: req.path,
              query: req.query,
              body: sanitizeBody(req.body),
              statusCode: res.statusCode
            },
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent'),
            status
          });

          logger.info('Audit log created', {
            userId,
            action,
            resourceType,
            status
          });

        } catch (error) {
          logger.error('Failed to create audit log', {
            error: error.message,
            stack: error.stack
          });
        }
      });

      // Send response
      return originalSend.call(this, data);
    };

    next();
  };
};

/**
 * Sanitize request body for audit logging
 * Removes sensitive data like passwords
 */
function sanitizeBody(body) {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sanitized = { ...body };

  // Remove sensitive fields
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'privateKey'];

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '***REDACTED***';
    }
  }

  return sanitized;
}

/**
 * Rate limiting middleware for sensitive operations
 */
const rateLimitSensitiveOps = (req, res, next) => {
  // This would integrate with Redis-based rate limiting
  // For now, just log the attempt
  logger.debug('Sensitive operation attempted', {
    userId: req.user?.id,
    path: req.path,
    method: req.method
  });

  next();
};

/**
 * Validate connection ownership
 * Ensures user can only access their own connections
 */
const validateConnectionOwnership = async (req, res, next) => {
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_AUTH === 'true') {
    return next();
  }

  const connectionId = req.params.id || req.body.connectionId || req.query.connectionId;

  if (!connectionId) {
    return next();
  }

  const { Connection } = require('../models');

  try {
    const connection = await Connection.findByPk(connectionId);

    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Connection not found'
      });
    }

    // Check ownership
    if (connection.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'You do not have access to this connection'
      });
    }

    // Attach connection to request
    req.connection = connection;
    next();

  } catch (error) {
    logger.error('Connection ownership validation failed', {
      error: error.message,
      connectionId
    });

    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to validate connection ownership'
    });
  }
};

module.exports = {
  authenticate,
  requireAdmin,
  requireDBPermissions,
  auditLogger,
  rateLimitSensitiveOps,
  validateConnectionOwnership
};
