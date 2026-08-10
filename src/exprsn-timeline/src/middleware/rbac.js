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
 * In production, this would fetch roles from the auth service
 * For now, it uses mock roles based on userId patterns
 */
async function enrichUserRole(req, res, next) {
  try {
    if (!req.userId) {
      // No authenticated user, skip role enrichment
      return next();
    }

    // TODO: In production, fetch user roles from auth service
    // For now, use mock logic for demonstration
    // Example: GET /api/users/{userId}/roles from auth service

    // Mock role assignment (replace with actual auth service call)
    const userRoles = await getUserRoles(req.userId);

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

    // Continue without roles - let downstream middleware handle authorization
    next();
  }
}

/**
 * Get user roles from auth service
 * TODO: Replace with actual auth service integration
 *
 * @param {string} userId - User ID
 * @returns {Promise<Array<string>>} - User roles
 */
async function getUserRoles(userId) {
  // Mock implementation
  // In production, call auth service:
  // const response = await axios.get(`${AUTH_SERVICE_URL}/api/users/${userId}/roles`);
  // return response.data.roles;

  // Mock roles for demonstration
  const mockRoles = {
    // Admin users (example UUIDs)
    'admin-user-uuid': ['admin', 'user'],
    'moderator-user-uuid': ['moderator', 'user']
  };

  // Check if user has predefined role
  if (mockRoles[userId]) {
    return mockRoles[userId];
  }

  // Default to regular user role
  return ['user'];
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
