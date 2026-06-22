/**
 * ═══════════════════════════════════════════════════════════
 * RBAC Middleware for Timeline Service
 * Role-Based Access Control with user role enrichment
 * ═══════════════════════════════════════════════════════════
 */

const { requireRole, requireModerator, requireAdmin, requireOwnerOrAdmin } = require('@exprsn/shared');
const { Post } = require('../models');
const logger = require('../utils/logger');

/**
 * Enriches request with user role information
 * This middleware should be placed after authentication middleware
 *
 * Roles are derived from the VALIDATED auth context attached by the auth
 * middleware (req.tokenData / req.permissions / req.user), plus an
 * env-var bootstrap escape hatch (TIMELINE_ADMIN_USER_IDS). Fails closed:
 * no admin/moderator role is granted unless explicitly present in the
 * validated token data or the bootstrap list.
 */
async function enrichUserRole(req, res, next) {
  try {
    if (!req.userId) {
      // No authenticated user, skip role enrichment
      return next();
    }

    const userRoles = await getUserRoles(req.userId, {
      tokenData: req.tokenData,
      permissions: req.permissions,
      user: req.user
    });

    req.userRoles = userRoles;
    req.userRole = userRoles[0]; // Primary role for backward compatibility

    logger.debug('User roles enriched', {
      userId: req.userId,
      roles: userRoles
    });

    next();
  } catch (error) {
    logger.error('Failed to enrich user roles', {
      userId: req.userId,
      error: error.message
    });

    // Fail closed: default to the unprivileged role on enrichment errors
    req.userRoles = ['user'];
    req.userRole = 'user';
    next();
  }
}

/**
 * Parse the bootstrap admin list from the environment
 * TIMELINE_ADMIN_USER_IDS is a comma-separated list of user IDs that are
 * granted the admin role (intended for initial bootstrap only).
 *
 * @returns {Array<string>} Bootstrap admin user IDs
 */
function getBootstrapAdminIds() {
  return (process.env.TIMELINE_ADMIN_USER_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
}

/**
 * Derive user roles from the validated auth context
 *
 * Sources (all from data populated by the auth middleware AFTER token
 * validation — never from client-supplied request fields):
 *  - roles array carried in the validated token data (tokenData.roles or
 *    user.roles)
 *  - admin / moderator permission flags on the validated token
 *  - TIMELINE_ADMIN_USER_IDS env var (bootstrap admins)
 *
 * Default: ['user']. Fails closed — unknown role values are ignored.
 *
 * @param {string} userId - User ID
 * @param {Object} authContext - { tokenData, permissions, user } from the
 *   authenticated request
 * @returns {Promise<Array<string>>} - User roles
 */
async function getUserRoles(userId, authContext = {}) {
  const KNOWN_ROLES = ['admin', 'moderator', 'user'];
  const granted = new Set(['user']);

  const { tokenData, permissions, user } = authContext;

  // Roles carried in the validated token data
  const tokenRoles = (tokenData && tokenData.roles) || (user && user.roles);
  if (Array.isArray(tokenRoles)) {
    for (const role of tokenRoles) {
      if (KNOWN_ROLES.includes(role)) {
        granted.add(role);
      }
    }
  }

  // Permission flags on the validated token
  if (permissions && permissions.admin === true) {
    granted.add('admin');
  }
  if (permissions && (permissions.moderator === true || permissions.moderate === true)) {
    granted.add('moderator');
  }

  // Bootstrap admins from the environment
  if (userId && getBootstrapAdminIds().includes(userId)) {
    granted.add('admin');
  }

  // Stable ordering: most privileged first (userRoles[0] is primary role)
  return KNOWN_ROLES.filter(role => granted.has(role));
}

/**
 * Require user to be post owner or admin
 * Used for post edit/delete operations
 */
const requirePostOwnerOrAdmin = requireOwnerOrAdmin(async (req) => {
  const postId = req.params.id || req.params.postId;

  if (!postId) {
    throw new Error('Post ID not found in request');
  }

  const post = await Post.findByPk(postId);

  if (!post) {
    throw new Error('Post not found');
  }

  return post.user_id;
});

/**
 * Require user to be a moderator (or admin)
 * Used for content moderation operations
 */
const requireModeratorRole = requireModerator();

/**
 * Require user to be an admin
 * Used for administrative operations
 */
const requireAdminRole = requireAdmin();

/**
 * Require specific role(s)
 * @param {string|Array<string>} roles - Required role(s)
 */
const requireSpecificRole = (roles) => requireRole(roles);

module.exports = {
  enrichUserRole,
  requirePostOwnerOrAdmin,
  requireModeratorRole,
  requireAdminRole,
  requireSpecificRole,
  getUserRoles
};
