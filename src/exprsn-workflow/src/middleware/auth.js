const axios = require('axios');
const logger = require('../utils/logger');

const CA_URL = process.env.CA_URL || 'http://localhost:3000';
const CA_TOKEN_VALIDATION_ENABLED = process.env.CA_TOKEN_VALIDATION_ENABLED !== 'false';

/**
 * Middleware to validate CA token
 */
const validateToken = async (req, res, next) => {
  if (!CA_TOKEN_VALIDATION_ENABLED) {
    // Development mode - skip validation (using valid UUID for dev user)
    req.user = {
      id: '00000000-0000-0000-0000-000000000001',
      roles: ['admin']
    };
    return next();
  }

  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      });
    }

    const token = authHeader.substring(7);

    // Validate token with CA
    const response = await axios.post(
      `${CA_URL}/api/tokens/validate`,
      {
        token,
        requiredPermission: 'read',
        resourceValue: req.path
      },
      {
        timeout: 5000
      }
    );

    if (!response.data.valid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    // Attach user info to request
    req.user = {
      id: response.data.userId,
      certificateId: response.data.certificateId,
      permissions: response.data.permissions,
      roles: response.data.roles || []
    };

    req.token = token;

    next();
  } catch (error) {
    logger.error('Token validation failed', {
      error: error.message,
      path: req.path
    });

    return res.status(401).json({
      success: false,
      error: 'Token validation failed'
    });
  }
};

/**
 * Middleware to require specific permission
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!CA_TOKEN_VALIDATION_ENABLED) {
      return next();
    }

    if (!req.user || !req.user.permissions) {
      return res.status(403).json({
        success: false,
        error: 'No permissions available'
      });
    }

    if (!req.user.permissions[permission]) {
      return res.status(403).json({
        success: false,
        error: `Permission denied: ${permission} required`
      });
    }

    next();
  };
};

/**
 * Middleware to require specific role
 */
const requireRole = (role) => {
  return (req, res, next) => {
    if (!process.env.RBAC_ENABLED || process.env.RBAC_ENABLED === 'false') {
      return next();
    }

    if (!req.user || !req.user.roles) {
      return res.status(403).json({
        success: false,
        error: 'No roles available'
      });
    }

    if (!req.user.roles.includes(role) && !req.user.roles.includes('admin')) {
      return res.status(403).json({
        success: false,
        error: `Role required: ${role}`
      });
    }

    next();
  };
};

/**
 * Middleware to require any of multiple roles
 */
const requireAnyRole = (...roles) => {
  return (req, res, next) => {
    if (!process.env.RBAC_ENABLED || process.env.RBAC_ENABLED === 'false') {
      return next();
    }

    if (!req.user || !req.user.roles) {
      return res.status(403).json({
        success: false,
        error: 'No roles available'
      });
    }

    const hasRole = roles.some(role => req.user.roles.includes(role)) || req.user.roles.includes('admin');

    if (!hasRole) {
      return res.status(403).json({
        success: false,
        error: `One of these roles required: ${roles.join(', ')}`
      });
    }

    next();
  };
};

/**
 * Check if user owns resource
 */
const checkOwnership = (getOwnerId) => {
  return async (req, res, next) => {
    try {
      const ownerId = await getOwnerId(req);

      if (!ownerId) {
        return res.status(404).json({
          success: false,
          error: 'Resource not found'
        });
      }

      // Admin can access everything
      if (req.user.roles && req.user.roles.includes('admin')) {
        return next();
      }

      // Check ownership
      if (ownerId !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied: not the owner'
        });
      }

      next();
    } catch (error) {
      logger.error('Ownership check failed', {
        error: error.message,
        userId: req.user?.id
      });

      return res.status(500).json({
        success: false,
        error: 'Ownership check failed'
      });
    }
  };
};

/**
 * Check workflow permissions (RBAC on workflow level)
 */
const checkWorkflowPermission = (action) => {
  return async (req, res, next) => {
    try {
      const { Workflow } = require('../models');
      const workflowId = req.params.id || req.params.workflowId;

      if (!workflowId) {
        return res.status(400).json({
          success: false,
          error: 'Workflow ID required'
        });
      }

      const workflow = await Workflow.findByPk(workflowId);

      if (!workflow) {
        return res.status(404).json({
          success: false,
          error: 'Workflow not found'
        });
      }

      // Check if user is owner
      if (workflow.owner_id === req.user.id) {
        return next();
      }

      // Check if user has admin role
      if (req.user.roles && req.user.roles.includes('admin')) {
        return next();
      }

      // Check workflow-specific permissions
      const permissions = workflow.permissions || {};
      const userRoles = req.user.roles || [];

      // Check if any of user's roles have the required action
      const hasPermission = userRoles.some(role => {
        const rolePermissions = permissions[role];
        return rolePermissions && rolePermissions.includes(action);
      });

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          error: `Permission denied: ${action} not allowed`
        });
      }

      next();
    } catch (error) {
      logger.error('Workflow permission check failed', {
        error: error.message,
        userId: req.user?.id,
        action
      });

      return res.status(500).json({
        success: false,
        error: 'Permission check failed'
      });
    }
  };
};

module.exports = {
  validateToken,
  requirePermission,
  requireRole,
  requireAnyRole,
  checkOwnership,
  checkWorkflowPermission
};
