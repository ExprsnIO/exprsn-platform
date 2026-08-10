/**
 * ═══════════════════════════════════════════════════════════════════════
 * Authentication Middleware - CA Token Validation
 * ═══════════════════════════════════════════════════════════════════════
 */

const tokenService = require('../services/tokenService');
const logger = require('../utils/logger');
const AuditLog = require('../models/AuditLog');

/**
 * Middleware to validate CA token
 * @param {Object} requiredPermissions - Required permissions (e.g., { read: true })
 * @param {Object} options - Additional options
 */
function requireToken(requiredPermissions = {}, options = {}) {
  return async (req, res, next) => {
    try {
      // Extract token from request
      const token = tokenService.extractToken(req);

      if (!token) {
        logger.warn('No token provided', {
          path: req.path,
          ip: req.ip
        });

        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Authentication token required'
        });
      }

      // Determine resource for validation
      let resource = options.resource;
      if (typeof resource === 'function') {
        resource = resource(req);
      } else if (!resource) {
        resource = req.path;
      }

      // Validate token
      const validation = await tokenService.validateToken(token, {
        requiredPermissions,
        resource,
        action: req.method
      });

      if (!validation.valid) {
        logger.warn('Token validation failed', {
          reason: validation.reason,
          path: req.path,
          ip: req.ip
        });

        const statusCode = validation.reason === 'TOKEN_EXPIRED' ? 401 : 403;

        return res.status(statusCode).json({
          error: validation.reason || 'FORBIDDEN',
          message: validation.error || 'Invalid or insufficient permissions'
        });
      }

      // Attach token data to request
      req.token = validation.token;
      req.userId = validation.token.userId || validation.token.data?.userId;
      req.permissions = validation.token.permissions;

      logger.debug('Token validated', {
        userId: req.userId,
        path: req.path
      });

      next();

    } catch (error) {
      logger.error('Token validation middleware error:', error);

      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Token validation failed'
      });
    }
  };
}

/**
 * Optional token middleware (doesn't fail if no token)
 * Useful for endpoints that work with or without authentication
 */
function optionalToken() {
  return async (req, res, next) => {
    try {
      const token = tokenService.extractToken(req);

      if (token) {
        const validation = await tokenService.validateToken(token, {
          requiredPermissions: {},
          resource: req.path
        });

        if (validation.valid) {
          req.token = validation.token;
          req.userId = validation.token.userId || validation.token.data?.userId;
          req.permissions = validation.token.permissions;
        }
      }

      next();

    } catch (error) {
      logger.error('Optional token middleware error:', error);
      next(); // Continue even on error
    }
  };
}

/**
 * Middleware to check specific permission
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.permissions || !req.permissions[permission]) {
      logger.warn('Insufficient permissions', {
        userId: req.userId,
        required: permission,
        has: req.permissions
      });

      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `Permission '${permission}' required`
      });
    }

    next();
  };
}

/**
 * Middleware to audit actions
 */
function auditAction(action, resourceType) {
  return async (req, res, next) => {
    // Store original send function
    const originalSend = res.send;

    // Override send to capture response
    res.send = function(data) {
      // Only audit successful actions (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Create audit log asynchronously (don't await)
        AuditLog.create({
          userId: req.userId || null,
          action,
          resourceType,
          resourceId: req.params.id || req.params.albumId || req.params.mediaId || null,
          details: {
            method: req.method,
            path: req.path,
            query: req.query,
            params: req.params
          },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        }).catch(err => {
          logger.error('Audit log creation failed:', err);
        });
      }

      // Call original send
      originalSend.call(this, data);
    };

    next();
  };
}

/**
 * Middleware to check album ownership or access
 */
async function requireAlbumAccess(accessLevel = 'read') {
  return async (req, res, next) => {
    try {
      const albumId = req.params.albumId || req.params.id;
      const userId = req.userId;

      if (!albumId) {
        return res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Album ID required'
        });
      }

      // Import here to avoid circular dependency
      const Album = require('../models/Album');
      const album = await Album.findById(albumId);

      if (!album) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Album not found'
        });
      }

      // Check if user is owner
      if (album.owner_id === userId) {
        req.album = album;
        req.isOwner = true;
        return next();
      }

      // Check if album is public for read access
      if (accessLevel === 'read' && album.visibility === 'public') {
        req.album = album;
        req.isOwner = false;
        return next();
      }

      // TODO: Check if user is a contributor with appropriate permissions
      // This would require querying album_contributors table

      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'You do not have access to this album'
      });

    } catch (error) {
      logger.error('Album access check error:', error);
      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to check album access'
      });
    }
  };
}

module.exports = {
  requireToken,
  optionalToken,
  requirePermission,
  auditAction,
  requireAlbumAccess
};
