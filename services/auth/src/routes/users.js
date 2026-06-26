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
const { requireAdminAfterCA } = require('../middleware/requireAdmin');

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
router.get('/', requireAdminAfterCA, asyncHandler(async (req, res) => {
  // Admin-only: the read token (enforced by router.use) is not sufficient — every
  // logged-in user holds one, so without requireAdminAfterCA any user could
  // enumerate the full directory (emails + mfaEnabled). Mirrors GET /:id's gate.
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
 * GET /api/users/directory
 * Public people directory — available to any authenticated user. Returns ONLY
 * non-sensitive fields (no email/mfa/status/lastLogin) and searches displayName
 * only, so it can't be used to probe which email addresses are registered.
 * Declared before `/:id` so the literal path is matched here.
 */
router.get('/directory', asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
  const offset = parseInt(req.query.offset, 10) || 0;
  const search = (req.query.search || '').trim();

  const where = { status: 'active' };
  if (search) {
    where.displayName = { [Op.iLike]: `%${search}%` };
  }

  const { rows, count } = await User.findAndCountAll({
    where,
    limit,
    offset,
    order: [['displayName', 'ASC']],
    attributes: ['id', 'displayName', 'avatarUrl', 'bio']
  });

  res.json({
    users: rows,
    pagination: { limit, offset, total: count, hasMore: offset + rows.length < count }
  });
}));

/**
 * POST /api/users/profiles
 * Batch public profiles for a set of user ids — available to any authenticated
 * user. Returns ONLY non-sensitive fields (no email/mfa/status) for ACTIVE
 * users, so a caller can resolve display names/avatars (e.g. a group member
 * list) without an N+1 of /:id/profile. Ids are de-duped and capped.
 */
router.post('/profiles', asyncHandler(async (req, res) => {
  const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const ids = [...new Set(rawIds.filter((v) => typeof v === 'string' && v))].slice(0, 200);

  if (ids.length === 0) {
    return res.json({ users: [] });
  }

  const users = await User.findAll({
    where: { id: { [Op.in]: ids }, status: 'active' },
    attributes: ['id', 'displayName', 'avatarUrl', 'bio']
  });

  res.json({ users });
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

/**
 * GET /api/users/:id/profile
 * Public profile projection — available to any authenticated user. Returns ONLY
 * non-sensitive fields; never email/mfa/status/lastLogin. 404 for non-active
 * accounts so suspended/deactivated users aren't browsable.
 */
router.get('/:id/profile', asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id, {
    attributes: ['id', 'displayName', 'avatarUrl', 'bio', 'status', 'createdAt']
  });

  if (!user || user.status !== 'active') {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  res.json({
    user: {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      createdAt: user.createdAt
    }
  });
}));

module.exports = router;
