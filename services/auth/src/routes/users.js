/**
 * ═══════════════════════════════════════════════════════════
 * User Routes
 * User management endpoints
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const { Op } = require('sequelize');
const { asyncHandler, AppError, validateRequired, validateCAToken } = require('@exprsn/shared');
const { User, Group, Role, Organization, Session, UserRole } = require('../models');
const { requireAdminAfterCA } = require('../middleware/requireAdmin');
const inviteService = require('../services/inviteService');
const { getEmailService } = require('../services/emailService');
const userImportService = require('../services/userImportService');

const router = express.Router();

// CSV import upload: buffer in memory with an 8MB HARD byte-ceiling enforced
// BEFORE parse (multer aborts the request with LIMIT_FILE_SIZE, so we never
// buffer an arbitrarily large upload). The parser then caps ROWS. Single file.
const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 }
}).single('file');

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

  // SECURITY: platform-admin is conferred ONLY by a GLOBAL-scoped role binding
  // (scope='global', organizationId=null). An org-scoped role — even one named
  // 'admin' — must never grant platform-wide admin (which here gates cross-user
  // profile/group reads). Mirrors hasAdminRole in middleware/requireAdmin.js.
  const globalBindings = await UserRole.findAll({
    where: { userId, scope: 'global', organizationId: null },
    attributes: ['roleId']
  });
  if (!globalBindings.length) {
    return false;
  }

  const roles = await Role.findAll({
    where: { id: globalBindings.map((b) => b.roleId) }
  });
  return roles.some(role =>
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
 * Bulk-import users from a server-side streamed CSV (admin only) — backs the
 * Directory "Import Users" action.
 *
 * Request: multipart/form-data
 *   - file             (required)  the CSV. Recognized headers (case/space
 *                                  insensitive → snake_case): email (required),
 *                                  display_name, first_name, last_name, status,
 *                                  password, role, auth_group, nexus_group.
 *   - organizationId   (optional)  target org. REQUIRED for non-platform org
 *                                  admins; optional (no-org import) for platform
 *                                  admins.
 *   - defaultRole      (optional)  fallback org role when a row omits `role`.
 *   - mode             (optional)  'create' (default) | 'invite' (activation email).
 *   - provisionCredentials (opt.)  'true' → best-effort per-member cert/token
 *                                  (create mode; requires a target org).
 *   - allowOwner       (optional, query or body) platform-admin-only override to
 *                                  permit 'owner' rows.
 *
 * ── Authz boundary (server-enforced, resolveImportContext) ───────────────────
 *   Platform super-admin: any org (or none) + any role. A non-platform org admin:
 *   organizationId required and must be owner/admin of THAT org (else 403
 *   ORG_FORBIDDEN); per-row role ceiling — never above the actor's own org rank.
 *   In slice A the route is additionally gated to platform admins by
 *   requireAdminAfterCA; the org-admin boundary is enforced in the service (and
 *   service-tested) as defense-in-depth for when the route guard is relaxed.
 *
 * ── Owner-import policy ──────────────────────────────────────────────────────
 *   'owner' rows are rejected for org admins ALWAYS; for platform admins only with
 *   allowOwner, and even then set ONLY OrganizationMember.role — NEVER
 *   Organization.ownerId (ownership transfer is a separate, guarded path).
 *
 * Rows are independent (no transaction). Report is a superset of the legacy shape:
 *   { created, skipped, failed, invited, organizationId, rows: [{ row, email,
 *     outcome, reason, orgRole, authGroup, nexusGroup, credentialsIssued }] }.
 *
 * The synchronous row cap (MAX_IMPORT_ROWS) is the Bull-queue seam (slice B):
 * rows above it 413 today; runImport lifts verbatim into a future job processor.
 */
router.post('/import',
  validateCAToken({ requiredPermissions: ['write'] }),
  requireAdminAfterCA,
  (req, res, next) => uploadCsv(req, res, (err) => {
    if (err) {
      return next(new AppError(
        err.code === 'LIMIT_FILE_SIZE' ? 'CSV exceeds the 8MB limit' : `Upload error: ${err.message}`,
        err.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
        'IMPORT_UPLOAD_ERROR'
      ));
    }
    return next();
  }),
  asyncHandler(async (req, res) => {
    if (!req.file || !req.file.buffer) {
      throw new AppError('Missing CSV file field "file"', 400, 'EMPTY_IMPORT');
    }

    const rows = await userImportService.parseCsvBuffer(req.file.buffer);
    if (rows.length === 0) {
      throw new AppError('CSV had no data rows', 400, 'EMPTY_IMPORT');
    }
    if (rows.length > userImportService.MAX_IMPORT_ROWS) {
      // Slice B queue seam: enqueue instead of 413 once Bull lands.
      throw new AppError(
        `Import of ${rows.length} rows exceeds the ${userImportService.MAX_IMPORT_ROWS}-row synchronous limit`,
        413,
        'IMPORT_TOO_LARGE'
      );
    }

    const allowOwner = req.query.allowOwner === 'true'
      || req.body.allowOwner === 'true' || req.body.allowOwner === true;

    const ctx = await userImportService.resolveImportContext({
      actorUserId: req.userId,
      actorEmail: req.tokenData && req.tokenData.email,
      organizationId: req.body.organizationId || null,
      defaultRole: req.body.defaultRole || 'member',
      mode: req.body.mode || 'create',
      provisionCredentials: req.body.provisionCredentials === 'true' || req.body.provisionCredentials === true,
      allowOwner
    });

    const result = await userImportService.runImport(rows, ctx);
    res.status(result.created + result.invited > 0 ? 201 : 200).json(result);
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
 * POST /api/users/invites
 * Create + send an invite / activation link (admin only). Org-scoped role/org
 * come from the body. Declared before `/:id` so the literal path matches here.
 * Body: { email, organizationId?, role?, kind? }
 */
router.post('/invites',
  validateCAToken({ requiredPermissions: ['write'] }), requireAdminAfterCA,
  asyncHandler(async (req, res) => {
    const { email, organizationId = null, role = 'member', kind = 'invite' } = req.body || {};
    validateRequired({ email }, ['email']);

    const { invitation, rawToken } = await inviteService.createInvite({
      email, organizationId, role, kind, invitedBy: req.userId
    });

    // Send the invite / activation email (best-effort — swallow failures, like
    // forgot-password does; the dev-echo below covers local flows).
    try {
      const emailService = await getEmailService();
      if (kind === 'activation') {
        await emailService.sendActivationEmail({ email: invitation.email }, rawToken, { organizationId });
      } else {
        await emailService.sendInvitationEmail({ email: invitation.email }, rawToken, { organizationId, role });
      }
    } catch (error) {
      // Don't fail invite creation if the email send fails.
    }

    res.status(201).json({
      invite: {
        id: invitation.id,
        email: invitation.email,
        kind: invitation.kind,
        status: invitation.status,
        expiresAt: invitation.expiresAt
      },
      ...(process.env.NODE_ENV === 'development' && { token: rawToken }) // dev-echo, like forgot-password
    });
  }));

/**
 * GET /api/users/invites
 * List invites (admin only). Never returns the token hash. Supports
 * ?organizationId, ?email, ?status, ?kind, ?limit, ?offset.
 * The blanket `read` scope (router.use) covers this; admin gate added.
 */
router.get('/invites',
  requireAdminAfterCA,
  asyncHandler(async (req, res) => {
    const { organizationId, email, status, kind, limit, offset } = req.query;
    const out = await inviteService.listInvites({
      organizationId, email, status, kind,
      limit: Math.min(Number(limit) || 50, 200),
      offset: Number(offset) || 0
    });
    res.json(out);
  }));

/**
 * DELETE /api/users/invites/:id
 * Revoke a pending invite (admin only). Idempotent. Declared before `/:id`.
 */
router.delete('/invites/:id',
  validateCAToken({ requiredPermissions: ['write'] }), requireAdminAfterCA,
  asyncHandler(async (req, res) => {
    const out = await inviteService.revokeInvite(req.params.id, { actorId: req.userId });
    res.json(out);
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
