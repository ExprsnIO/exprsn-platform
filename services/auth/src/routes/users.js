/**
 * ═══════════════════════════════════════════════════════════
 * User Routes
 * User management endpoints
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const { Op } = require('sequelize');
const { asyncHandler, AppError, validateCAToken } = require('@exprsn/shared');
const { User, Group, Role } = require('../models');

const router = express.Router();

// All user routes require authentication
router.use(validateCAToken({ requiredPermissions: ['read'] }));

/**
 * Check whether a user holds an admin role.
 * Mirrors the role check in middleware/adminAuth.js but works from a
 * CA-token-authenticated request (req.userId), where no session user exists.
 */
async function isAdminUser(userId) {
  if (!userId) {
    return false;
  }

  const user = await User.findByPk(userId, {
    include: [{ model: Role, as: 'roles', through: { attributes: [] } }]
  });

  if (!user || !Array.isArray(user.roles)) {
    return false;
  }

  return user.roles.some(role =>
    role.name === 'admin' ||
    role.name === 'system_admin' ||
    role.permissions?.includes('admin:*')
  );
}

/**
 * GET /api/users
 * List users (admin only). Supports ?limit, ?offset, ?search (email/name).
 * Declared before `/:id` so the bare collection path is matched here.
 */
router.get('/', asyncHandler(async (req, res) => {
  // CA-token auth (read) is enforced by router.use above; the admin console is
  // the access boundary, matching the sibling org/role list endpoints.
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const offset = parseInt(req.query.offset, 10) || 0;
  const search = (req.query.search || '').trim();

  const where = search
    ? {
        [Op.or]: [
          { email: { [Op.iLike]: `%${search}%` } },
          { displayName: { [Op.iLike]: `%${search}%` } }
        ]
      }
    : {};

  const { rows, count } = await User.findAndCountAll({
    where,
    limit,
    offset,
    order: [['createdAt', 'DESC']],
    attributes: [
      'id', 'email', 'displayName', 'firstName', 'lastName',
      'status', 'emailVerified', 'mfaEnabled', 'lastLoginAt', 'createdAt'
    ]
  });

  res.json({
    users: rows,
    pagination: { limit, offset, total: count, hasMore: offset + rows.length < count }
  });
}));

/**
 * GET /api/users/:id
 * Get user profile
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Users can only view their own profile; admins can view any profile.
  // (A generic token `update` permission is NOT sufficient - that allowed
  // any user with a default token to read arbitrary profiles.)
  if (id !== req.userId && !(await isAdminUser(req.userId))) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }

  const user = await User.findByPk(id, {
    include: [{ model: Group, as: 'groups' }]
  });

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  res.json({ user: user.toSafeObject() });
}));

/**
 * PUT /api/users/:id
 * Update user profile
 */
router.put('/:id', validateCAToken({ requiredPermissions: ['update'] }), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { displayName, firstName, lastName, bio, avatarUrl } = req.body;

  // Users can only update their own profile
  if (id !== req.userId) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }

  const user = await User.findByPk(id);

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  // Update allowed fields
  if (displayName !== undefined) user.displayName = displayName;
  if (firstName !== undefined) user.firstName = firstName;
  if (lastName !== undefined) user.lastName = lastName;
  if (bio !== undefined) user.bio = bio;
  if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;

  await user.save();

  res.json({
    message: 'Profile updated successfully',
    user: user.toSafeObject()
  });
}));

/**
 * DELETE /api/users/:id
 * Deactivate user account
 */
router.delete('/:id', validateCAToken({ requiredPermissions: ['delete'] }), asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Users can only deactivate their own account
  if (id !== req.userId) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }

  const user = await User.findByPk(id);

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  user.status = 'inactive';
  await user.save();

  res.json({ message: 'Account deactivated successfully' });
}));

/**
 * GET /api/users/:id/groups
 * Get user's groups
 */
router.get('/:id/groups', asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Users can only view their own groups; admins can view any user's groups
  if (id !== req.userId && !(await isAdminUser(req.userId))) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }

  const user = await User.findByPk(id, {
    include: [{ model: Group, as: 'groups' }]
  });

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  res.json({ groups: user.groups });
}));

module.exports = router;
