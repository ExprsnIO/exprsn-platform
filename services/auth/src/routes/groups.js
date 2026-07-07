/**
 * ═══════════════════════════════════════════════════════════
 * Group Routes
 * Group management endpoints
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const { asyncHandler, AppError, validateCAToken, validateRequired } = require('@exprsn/shared');
const { Group, User, UserGroup } = require('../models');
const { requireAdminAfterCA } = require('../middleware/requireAdmin');

const router = express.Router();

/** Derive a URL-safe slug from a display name (slug is required + unique per org). */
function slugify(name) {
  return String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// All group routes require authentication AND administrator privileges. Group
// management is an admin-console function; without the admin gate any user with a
// read/write token could list every org's groups+members (cross-tenant
// disclosure) or create/modify groups in arbitrary organizations.
router.use(validateCAToken({ requiredPermissions: ['read'] }));
router.use(requireAdminAfterCA);

/**
 * GET /api/groups
 * List groups. Optional ?organizationId scopes to one organization. Declared
 * before `/:id` so the bare collection path is matched here.
 */
router.get('/', asyncHandler(async (req, res) => {
  const { organizationId } = req.query;
  const where = organizationId ? { organizationId } : {};

  const groups = await Group.findAll({
    where,
    order: [['name', 'ASC']],
    include: [{ model: User, as: 'members', attributes: ['id', 'email', 'displayName'], through: { attributes: [] } }]
  });

  res.json({ groups });
}));

/**
 * POST /api/groups
 * Create new group. Pass organizationId to scope the group to an organization.
 */
router.post('/', validateCAToken({ requiredPermissions: ['write'] }), asyncHandler(async (req, res) => {
  const { name, description, permissions, parentId, organizationId } = req.body;

  validateRequired({ name }, ['name']);

  // Group names are unique within their scope (organization, or global).
  const existingGroup = await Group.findOne({ where: { name, organizationId: organizationId || null } });
  if (existingGroup) {
    throw new AppError('Group already exists', 409, 'GROUP_EXISTS');
  }

  const group = await Group.create({
    name,
    slug: slugify(name),
    description,
    permissions: permissions || {},
    parentId,
    organizationId: organizationId || null,
    type: organizationId ? 'organization' : 'custom'
  });

  res.status(201).json({
    message: 'Group created successfully',
    group
  });
}));

/**
 * POST /api/groups/import
 * Bulk-create groups — backs the Directory "Import Groups" action (the whole
 * router is already admin-gated at the mount).
 * Body: { groups: [{ name, description?, organizationId?, permissions?, parentId? }] }
 * Rows are processed independently; existing names (per scope) are skipped.
 */
router.post('/import', validateCAToken({ requiredPermissions: ['write'] }), asyncHandler(async (req, res) => {
  const rows = Array.isArray(req.body?.groups) ? req.body.groups.slice(0, 500) : [];
  if (rows.length === 0) {
    throw new AppError('No groups to import — body must be { groups: [...] }', 400, 'EMPTY_IMPORT');
  }

  const results = { created: 0, skipped: 0, failed: 0, rows: [] };
  for (const row of rows) {
    const name = String(row?.name || '').trim();
    if (!name) {
      results.failed += 1;
      results.rows.push({ name: row?.name ?? '', outcome: 'failed', reason: 'Missing name' });
      continue;
    }
    try {
      const organizationId = row.organizationId || null;
      const existing = await Group.findOne({ where: { name, organizationId } });
      if (existing) {
        results.skipped += 1;
        results.rows.push({ name, outcome: 'skipped', reason: 'Already exists' });
        continue;
      }
      await Group.create({
        name,
        slug: slugify(name),
        description: row.description || null,
        permissions: row.permissions || {},
        parentId: row.parentId || null,
        organizationId,
        type: organizationId ? 'organization' : 'custom'
      });
      results.created += 1;
      results.rows.push({ name, outcome: 'created' });
    } catch (error) {
      results.failed += 1;
      results.rows.push({ name, outcome: 'failed', reason: error.message });
    }
  }

  res.status(results.created > 0 ? 201 : 200).json(results);
}));

/**
 * GET /api/groups/:id
 * Get group details
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const group = await Group.findByPk(id, {
    include: [{ model: User, as: 'users' }]
  });

  if (!group) {
    throw new AppError('Group not found', 404, 'GROUP_NOT_FOUND');
  }

  res.json({ group });
}));

/**
 * PUT /api/groups/:id
 * Update group
 */
router.put('/:id', validateCAToken({ requiredPermissions: ['update'] }), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, permissions } = req.body;

  const group = await Group.findByPk(id);

  if (!group) {
    throw new AppError('Group not found', 404, 'GROUP_NOT_FOUND');
  }

  if (name !== undefined) group.name = name;
  if (description !== undefined) group.description = description;
  if (permissions !== undefined) group.permissions = permissions;

  await group.save();

  res.json({
    message: 'Group updated successfully',
    group
  });
}));

/**
 * DELETE /api/groups/:id
 * Delete group
 */
router.delete('/:id', validateCAToken({ requiredPermissions: ['delete'] }), asyncHandler(async (req, res) => {
  const { id } = req.params;

  const group = await Group.findByPk(id);

  if (!group) {
    throw new AppError('Group not found', 404, 'GROUP_NOT_FOUND');
  }

  await group.destroy();

  res.json({ message: 'Group deleted successfully' });
}));

/**
 * POST /api/groups/:id/members
 * Add member to group
 */
router.post('/:id/members', validateCAToken({ requiredPermissions: ['write'] }), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { userId, role } = req.body;

  validateRequired({ userId }, ['userId']);

  const group = await Group.findByPk(id);
  if (!group) {
    throw new AppError('Group not found', 404, 'GROUP_NOT_FOUND');
  }

  const user = await User.findByPk(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  // Check if already member
  const existing = await UserGroup.findOne({
    where: { userId, groupId: id }
  });

  if (existing) {
    throw new AppError('User is already a member', 409, 'ALREADY_MEMBER');
  }

  await UserGroup.create({
    userId,
    groupId: id,
    role: role || 'member'
  });

  res.status(201).json({ message: 'Member added successfully' });
}));

/**
 * DELETE /api/groups/:id/members/:userId
 * Remove member from group
 */
router.delete('/:id/members/:userId', validateCAToken({ requiredPermissions: ['delete'] }), asyncHandler(async (req, res) => {
  const { id, userId } = req.params;

  const membership = await UserGroup.findOne({
    where: { userId, groupId: id }
  });

  if (!membership) {
    throw new AppError('Membership not found', 404, 'NOT_MEMBER');
  }

  await membership.destroy();

  res.json({ message: 'Member removed successfully' });
}));

module.exports = router;
