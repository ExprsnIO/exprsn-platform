/**
 * ═══════════════════════════════════════════════════════════
 * User Routes
 * User management endpoints
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { asyncHandler, AppError, validateRequired, validateCAToken } = require('@exprsn/shared');
const { User, Group, Role, Organization, Session } = require('../models');
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
 * POST /api/users
 * Create a user (admin only) — backs the Directory "Create User" action.
 * Body: { email, password?, displayName?, firstName?, lastName?, status?, emailVerified? }
 * When no password is given a random one is set and the account must go
 * through password reset before password login.
 */
router.post('/', validateCAToken({ requiredPermissions: ['write'] }), requireAdminAfterCA, asyncHandler(async (req, res) => {
  const { email, password, displayName, firstName, lastName, status, emailVerified } = req.body || {};
  validateRequired({ email }, ['email']);

  const existing = await User.findOne({ where: { email } });
  if (existing) {
    throw new AppError('Email already registered', 409, 'USER_EXISTS');
  }

  const user = await User.create({
    email,
    passwordHash: password || crypto.randomBytes(24).toString('base64'), // hashed by beforeCreate hook
    displayName: displayName || null,
    firstName: firstName || null,
    lastName: lastName || null,
    status: ['active', 'inactive', 'suspended'].includes(status) ? status : 'active',
    emailVerified: Boolean(emailVerified)
  });

  res.status(201).json({ message: 'User created', user: user.toSafeObject() });
}));

/**
 * POST /api/users/import
 * Bulk-create users (admin only) — backs the Directory "Import Users" action.
 * Body: { users: [{ email, displayName?, firstName?, lastName?, status?, password? }] }
 * Rows are processed independently; existing emails are reported as skipped.
 */
router.post('/import', validateCAToken({ requiredPermissions: ['write'] }), requireAdminAfterCA, asyncHandler(async (req, res) => {
  const rows = Array.isArray(req.body?.users) ? req.body.users.slice(0, 500) : [];
  if (rows.length === 0) {
    throw new AppError('No users to import — body must be { users: [...] }', 400, 'EMPTY_IMPORT');
  }

  const results = { created: 0, skipped: 0, failed: 0, rows: [] };
  for (const row of rows) {
    const email = String(row?.email || '').trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      results.failed += 1;
      results.rows.push({ email: row?.email ?? '', outcome: 'failed', reason: 'Invalid email' });
      continue;
    }
    try {
      const existing = await User.findOne({ where: { email } });
      if (existing) {
        results.skipped += 1;
        results.rows.push({ email, outcome: 'skipped', reason: 'Already exists' });
        continue;
      }
      await User.create({
        email,
        passwordHash: row.password || crypto.randomBytes(24).toString('base64'),
        displayName: row.displayName || null,
        firstName: row.firstName || null,
        lastName: row.lastName || null,
        status: ['active', 'inactive', 'suspended'].includes(row.status) ? row.status : 'active'
      });
      results.created += 1;
      results.rows.push({ email, outcome: 'created' });
    } catch (error) {
      results.failed += 1;
      results.rows.push({ email, outcome: 'failed', reason: error.message });
    }
  }

  res.status(results.created > 0 ? 201 : 200).json(results);
}));

/**
 * GET /api/users/export
 * CSV export of the user directory (admin only) — backs "Export Users".
 * Declared before `/:id` so the literal path is matched here.
 */
router.get('/export', requireAdminAfterCA, asyncHandler(async (req, res) => {
  const users = await User.findAll({
    order: [['createdAt', 'ASC']],
    attributes: ['id', 'email', 'displayName', 'firstName', 'lastName', 'status', 'emailVerified', 'mfaEnabled', 'lastLoginAt', 'createdAt']
  });

  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Some rows carry epoch-ms values as strings (bigint columns) or otherwise
  // non-parseable dates — coerce numerics and emit anything else raw rather
  // than letting toISOString() throw on an Invalid Date.
  const iso = (v) => {
    if (!v) return '';
    const n = typeof v === 'string' && /^\d{10,}$/.test(v) ? Number(v) : v;
    const d = new Date(n);
    return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
  };
  const header = 'id,email,displayName,firstName,lastName,status,emailVerified,mfaEnabled,lastLoginAt,createdAt';
  const lines = users.map((u) => [
    u.id, u.email, u.displayName, u.firstName, u.lastName, u.status,
    u.emailVerified, u.mfaEnabled,
    iso(u.lastLoginAt),
    iso(u.createdAt)
  ].map(esc).join(','));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
  res.send([header, ...lines].join('\n'));
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
 * GET /api/users/:id/detail
 * Full admin inspector for a user — profile plus everything that relates the
 * user to the platform: groups, roles, organizations, resolved permissions,
 * and recent sessions. Backs the admin Users tab row-click inspector.
 */
router.get('/:id/detail', requireAdminAfterCA, asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id, {
    include: [
      { model: Group, as: 'groups', through: { attributes: [] } },
      { model: Role, as: 'roles', through: { attributes: [] } },
      { model: Organization, as: 'organizations', through: { attributes: ['role', 'status'] } }
    ]
  });

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  const sessions = await Session.findAll({
    where: { userId: user.id },
    order: [['createdAt', 'DESC']],
    limit: 10
  }).catch(() => []);

  // Resolved (role-derived) permissions; best-effort — the inspector still
  // renders without them.
  let permissions = null;
  try {
    const rbacService = require('../services/rbacService');
    permissions = await rbacService.getUserPermissions(user.id, {});
  } catch (_) { /* optional */ }

  const safe = user.toSafeObject();
  res.json({
    user: safe,
    groups: user.groups ?? [],
    roles: user.roles ?? [],
    organizations: (user.organizations ?? []).map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      status: o.status,
      memberRole: o.OrganizationMember?.role ?? null,
      memberStatus: o.OrganizationMember?.status ?? null
    })),
    permissions,
    sessions: sessions.map((s) => ({
      id: s.id,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      lastActivityAt: s.lastActivityAt,
      revokedAt: s.revokedAt ?? null
    }))
  });
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
