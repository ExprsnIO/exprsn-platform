const { GroupMembership, Group } = require('../models');
const logger = require('../utils/logger');
const redis = require('../config/redis');

/**
 * ═══════════════════════════════════════════════════════════
 * Group Authorization Middleware
 * Checks group membership and roles
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Check if user is a member of the group
 */
async function requireGroupMember(req, res, next) {
  try {
    const groupId = req.params.groupId || req.params.id;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    if (!groupId) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Group ID is required'
      });
    }

    // Check cache first
    const cacheKey = `group:${groupId}:member:${userId}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      req.membership = JSON.parse(cached);
      return next();
    }

    // Check database
    const membership = await GroupMembership.findOne({
      where: {
        userId,
        groupId,
        status: 'active'
      }
    });

    if (!membership) {
      return res.status(403).json({
        error: 'NOT_GROUP_MEMBER',
        message: 'You must be a member of this group'
      });
    }

    // Cache membership for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(membership));

    req.membership = membership;
    next();
  } catch (error) {
    logger.error('Group membership check error:', error);
    return res.status(500).json({
      error: 'MEMBERSHIP_CHECK_ERROR',
      message: 'An error occurred while checking group membership'
    });
  }
}

/**
 * Check if user has a specific role in the group
 */
function requireGroupRole(roles) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return async (req, res, next) => {
    try {
      if (!req.membership) {
        return res.status(403).json({
          error: 'NOT_GROUP_MEMBER',
          message: 'You must be a member of this group'
        });
      }

      const userRole = req.membership.role;

      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          error: 'INSUFFICIENT_ROLE',
          message: `Required role: ${allowedRoles.join(' or ')}. Your role: ${userRole}`,
          required: allowedRoles,
          actual: userRole
        });
      }

      next();
    } catch (error) {
      logger.error('Group role check error:', error);
      return res.status(500).json({
        error: 'ROLE_CHECK_ERROR',
        message: 'An error occurred while checking group role'
      });
    }
  };
}

/**
 * Check if user is an admin (owner or admin role)
 */
async function requireGroupAdmin(req, res, next) {
  try {
    if (!req.membership) {
      return res.status(403).json({
        error: 'NOT_GROUP_MEMBER',
        message: 'You must be a member of this group'
      });
    }

    const userRole = req.membership.role;
    const adminRoles = ['owner', 'admin'];

    if (!adminRoles.includes(userRole)) {
      return res.status(403).json({
        error: 'ADMIN_REQUIRED',
        message: 'This action requires admin privileges',
        required: adminRoles,
        actual: userRole
      });
    }

    next();
  } catch (error) {
    logger.error('Group admin check error:', error);
    return res.status(500).json({
      error: 'ADMIN_CHECK_ERROR',
      message: 'An error occurred while checking admin privileges'
    });
  }
}

/**
 * Check if group exists and is active
 */
async function validateGroup(req, res, next) {
  try {
    const groupId = req.params.groupId || req.params.id;

    if (!groupId) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Group ID is required'
      });
    }

    // Check cache first
    const cacheKey = `group:${groupId}:info`;
    const cached = await redis.get(cacheKey);

    let group;
    if (cached) {
      group = JSON.parse(cached);
    } else {
      group = await Group.findByPk(groupId);

      if (group) {
        // Cache for 10 minutes
        await redis.setex(cacheKey, 600, JSON.stringify(group));
      }
    }

    if (!group) {
      return res.status(404).json({
        error: 'GROUP_NOT_FOUND',
        message: 'Group not found'
      });
    }

    if (!group.isActive) {
      return res.status(403).json({
        error: 'GROUP_INACTIVE',
        message: 'This group is not active'
      });
    }

    req.group = group;
    next();
  } catch (error) {
    logger.error('Group validation error:', error);
    return res.status(500).json({
      error: 'GROUP_VALIDATION_ERROR',
      message: 'An error occurred while validating group'
    });
  }
}

/**
 * Check if group is public or user has access
 */
async function requireGroupAccess(req, res, next) {
  try {
    const group = req.group;

    if (!group) {
      return res.status(404).json({
        error: 'GROUP_NOT_FOUND',
        message: 'Group not found'
      });
    }

    // Public groups are accessible to everyone
    if (group.visibility === 'public') {
      return next();
    }

    // For private/unlisted groups, require membership
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required for private groups'
      });
    }

    const groupId = group.id;
    const membership = await GroupMembership.findOne({
      where: {
        userId,
        groupId,
        status: 'active'
      }
    });

    if (!membership) {
      return res.status(403).json({
        error: 'ACCESS_DENIED',
        message: 'You do not have access to this group'
      });
    }

    req.membership = membership;
    next();
  } catch (error) {
    logger.error('Group access check error:', error);
    return res.status(500).json({
      error: 'ACCESS_CHECK_ERROR',
      message: 'An error occurred while checking group access'
    });
  }
}

module.exports = {
  requireGroupMember,
  requireGroupRole,
  requireGroupAdmin,
  validateGroup,
  requireGroupAccess
};
