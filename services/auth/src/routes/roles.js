/**
 * ═══════════════════════════════════════════════════════════
 * Roles & Permissions Routes
 * RBAC management endpoints
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { Role, Permission, UserRole, GroupRole, User, Group } = require('../models');
const { Op } = require('sequelize');
const rbacService = require('../services/rbacService');
const organizationService = require('../services/organizationService');
const { requireAuth } = require('../middleware/requireAuth');
const { hasAdminRole } = require('../middleware/requireAdmin');
const { isPlatformAdmin } = require('@exprsn/shared/utils/platformAdmin');

/** Derive a URL-safe slug from a display name (slug is required + unique per org). */
function slugify(name) {
  return String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Authorize a role mutation (assign/revoke/update/delete) for the current user.
 *
 * Previously the assign/revoke routes had NO authorization at all — any
 * authenticated user could grant themselves any role (incl. admin). Authorize as:
 *   - platform admins (email allowlist) → any role;
 *   - org-scoped roles → that org's owner/admin;
 *   - global/system roles → a holder of the `*` (system) permission.
 */
async function canManageRole(req, role) {
  if (isPlatformAdmin(req.user && req.user.email)) {
    return true;
  }
  if (role && role.organizationId) {
    return organizationService.isOwnerOrAdmin(role.organizationId, req.user.id);
  }
  const perm = await rbacService.checkPermission(req.user.id, '*');
  return Boolean(perm && perm.allowed);
}

/**
 * Authorize a permission-inspection read (GET /users/:userId/permissions,
 * POST /check-permission) for the current user.
 *
 * Previously these endpoints trusted the `userId` route param / body field
 * outright — any authenticated user could pass another user's id and read
 * their resolved permissions (info disclosure). Authorize as:
 *   - the user inspecting their OWN permissions;
 *   - platform admins (email allowlist) — may inspect anyone;
 *   - a holder of a DB admin/system_admin role (or `admin:*` permission).
 */
async function canInspectPermissions(req, targetUserId) {
  if (req.user && String(req.user.id) === String(targetUserId)) {
    return true;
  }
  if (isPlatformAdmin(req.user && req.user.email)) {
    return true;
  }
  return hasAdminRole(req.user && req.user.id);
}

/**
 * GET /api/roles
 * Get roles (system or organization-scoped)
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { organizationId, type } = req.query;

    const where = {};

    if (type) {
      where.type = type;
    }

    if (organizationId) {
      // Check if user is member of organization
      const isMember = await organizationService.isMember(organizationId, req.user.id);
      if (!isMember) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'You do not have access to this organization'
        });
      }

      where.organizationId = organizationId;
    } else {
      // System roles only
      where.organizationId = null;
    }

    const roles = await Role.findAll({
      where,
      order: [['priority', 'DESC'], ['name', 'ASC']]
    });

    res.json({
      success: true,
      roles
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/roles
 * Create custom role
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { organizationId } = req.body;

    // Check permissions
    if (organizationId) {
      const isOwnerOrAdmin = await organizationService.isOwnerOrAdmin(organizationId, req.user.id);
      if (!isOwnerOrAdmin) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Only organization owners and admins can create roles'
        });
      }
    } else {
      // System role - need system admin permission
      const hasPermission = await rbacService.checkPermission(req.user.id, '*');
      if (!hasPermission.allowed) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Only system administrators can create system roles'
        });
      }
    }

    const role = await Role.create({
      ...req.body,
      slug: req.body.slug || slugify(req.body.name),
      type: organizationId ? 'organization' : 'custom',
      isSystem: false
    });

    res.status(201).json({
      success: true,
      role
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/permissions
 * Get all permissions
 *
 * NOTE: must be declared BEFORE the parametric `/:id` route below — otherwise
 * Express matches `/permissions` as `/:id` and Role.findByPk('permissions')
 * throws an invalid-UUID SQL error (500).
 */
router.get('/permissions', requireAuth, async (req, res, next) => {
  try {
    const { scope, service } = req.query;

    const where = {};
    if (scope) where.scope = scope;
    if (service) where.service = service;

    const permissions = await Permission.findAll({
      where,
      order: [['permissionString', 'ASC']]
    });

    res.json({
      success: true,
      permissions
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/permissions
 * Create a permission catalog entry (platform admin / `*` holders only).
 * Body: { permissionString } or { resource, action }, plus optional
 * { scope, service, description }. Backs the expanded permission catalog UI.
 *
 * NOTE: declared before `/:id` for the same reason as GET /permissions.
 */
router.post('/permissions', requireAuth, async (req, res, next) => {
  try {
    if (!(await canManageRole(req, null))) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only administrators can define permissions'
      });
    }

    const { resource, action, scope, service, description } = req.body;
    let permissionString = (req.body.permissionString || '').trim();
    let res_ = resource, act = action;

    if (permissionString && (!res_ || !act)) {
      const parsed = Permission.parsePermissionString(permissionString);
      res_ = parsed.resource;
      act = parsed.action;
    }
    if (!permissionString && res_ && act) {
      permissionString = `${res_}:${act}`;
    }
    if (!permissionString || !res_ || !act) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Provide permissionString ("resource:action") or resource + action'
      });
    }

    const existing = await Permission.findOne({ where: { permissionString } });
    if (existing) {
      return res.status(409).json({ error: 'EXISTS', message: 'Permission already defined' });
    }

    const permission = await Permission.create({
      resource: res_,
      action: act,
      permissionString,
      scope: ['system', 'organization', 'application', 'service'].includes(scope) ? scope : 'application',
      service: service || null,
      description: description || null,
      isSystem: false
    });

    res.status(201).json({ success: true, permission });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/roles/:id/assignments
 * Who/what holds this role — user and group assignments with resolved
 * names, so the admin role inspector can show the role's reach across
 * orgs, users and groups.
 */
router.get('/:id/assignments', requireAuth, async (req, res, next) => {
  try {
    const role = await Role.findByPk(req.params.id);
    if (!role) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Role not found' });
    }
    if (role.organizationId) {
      const isMember = await organizationService.isMember(role.organizationId, req.user.id);
      if (!isMember) {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'You do not have access to this role' });
      }
    }

    const userRoles = await UserRole.findAll({ where: { roleId: role.id } });
    const groupRoles = await GroupRole.findAll({ where: { roleId: role.id } });

    const userIds = [...new Set(userRoles.map((ur) => ur.userId).filter(Boolean))];
    const groupIds = [...new Set(groupRoles.map((gr) => gr.groupId).filter(Boolean))];

    const users = userIds.length
      ? await User.findAll({ where: { id: { [Op.in]: userIds } }, attributes: ['id', 'email', 'displayName', 'status'] })
      : [];
    const groups = groupIds.length
      ? await Group.findAll({ where: { id: { [Op.in]: groupIds } }, attributes: ['id', 'name', 'organizationId'] })
      : [];

    const userById = Object.fromEntries(users.map((u) => [u.id, u]));
    const groupById = Object.fromEntries(groups.map((g) => [g.id, g]));

    res.json({
      success: true,
      role,
      users: userRoles.map((ur) => ({
        userId: ur.userId,
        organizationId: ur.organizationId ?? null,
        expiresAt: ur.expiresAt ?? null,
        assignedBy: ur.assignedBy ?? null,
        user: userById[ur.userId] ?? null
      })),
      groups: groupRoles.map((gr) => ({
        groupId: gr.groupId,
        organizationId: gr.organizationId ?? null,
        assignedBy: gr.assignedBy ?? null,
        group: groupById[gr.groupId] ?? null
      }))
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/roles/:id
 * Get role by ID
 */
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const role = await Role.findByPk(req.params.id);

    if (!role) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Role not found'
      });
    }

    // Check access if organization-scoped
    if (role.organizationId) {
      const isMember = await organizationService.isMember(role.organizationId, req.user.id);
      if (!isMember) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'You do not have access to this role'
        });
      }
    }

    res.json({
      success: true,
      role
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/roles/:id
 * Update role
 */
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const role = await Role.findByPk(req.params.id);

    if (!role) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Role not found'
      });
    }

    // Cannot modify system roles
    if (role.isSystem) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'System roles cannot be modified'
      });
    }

    // Authorize (global roles previously had NO check here).
    if (!(await canManageRole(req, role))) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'You do not have permission to update this role'
      });
    }

    // Whitelist mutable fields — never allow mass-assignment of scope/identity
    // fields (id, isSystem, organizationId, slug, type) that would escalate or
    // re-scope the role.
    const { name, description, permissions, priority, color } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (permissions !== undefined) updates.permissions = permissions;
    if (priority !== undefined) updates.priority = priority;
    if (color !== undefined) updates.color = color;

    await role.update(updates);

    res.json({
      success: true,
      role
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/roles/:id
 * Delete role
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const role = await Role.findByPk(req.params.id);

    if (!role) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Role not found'
      });
    }

    // Cannot delete system roles
    if (role.isSystem) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'System roles cannot be deleted'
      });
    }

    // Authorize (global roles previously had NO check here).
    if (!(await canManageRole(req, role))) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'You do not have permission to delete this role'
      });
    }

    await role.destroy();

    res.json({
      success: true,
      message: 'Role deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/roles/:id/assign-user
 * Assign role to user
 */
router.post('/:id/assign-user', requireAuth, async (req, res, next) => {
  try {
    const { userId, organizationId, applicationId, expiresAt } = req.body;

    const role = await Role.findByPk(req.params.id);
    if (!role) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Role not found' });
    }
    if (!(await canManageRole(req, role))) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'You do not have permission to assign this role' });
    }

    const userRole = await rbacService.assignRoleToUser(userId, req.params.id, {
      organizationId,
      applicationId,
      assignedBy: req.user.id,
      expiresAt
    });

    res.status(201).json({
      success: true,
      userRole
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/roles/:id/revoke-user
 * Revoke role from user
 */
router.post('/:id/revoke-user', requireAuth, async (req, res, next) => {
  try {
    const { userId, organizationId, applicationId } = req.body;

    const role = await Role.findByPk(req.params.id);
    if (!role) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Role not found' });
    }
    if (!(await canManageRole(req, role))) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'You do not have permission to revoke this role' });
    }

    const userRole = await rbacService.revokeRoleFromUser(userId, req.params.id, {
      organizationId,
      applicationId
    });

    res.json({
      success: true,
      userRole
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/roles/:id/assign-group
 * Assign role to group
 */
router.post('/:id/assign-group', requireAuth, async (req, res, next) => {
  try {
    const { groupId, organizationId, applicationId } = req.body;

    const role = await Role.findByPk(req.params.id);
    if (!role) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Role not found' });
    }
    if (!(await canManageRole(req, role))) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'You do not have permission to assign this role' });
    }

    const groupRole = await rbacService.assignRoleToGroup(groupId, req.params.id, {
      organizationId,
      applicationId,
      assignedBy: req.user.id
    });

    res.status(201).json({
      success: true,
      groupRole
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/roles/:id/revoke-group
 * Revoke role from group
 */
router.post('/:id/revoke-group', requireAuth, async (req, res, next) => {
  try {
    const { groupId, organizationId, applicationId } = req.body;

    const role = await Role.findByPk(req.params.id);
    if (!role) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Role not found' });
    }
    if (!(await canManageRole(req, role))) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'You do not have permission to revoke this role' });
    }

    const groupRole = await rbacService.revokeRoleFromGroup(groupId, req.params.id, {
      organizationId,
      applicationId
    });

    res.json({
      success: true,
      groupRole
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/:userId/permissions
 * Get user's resolved permissions
 */
router.get('/users/:userId/permissions', requireAuth, async (req, res, next) => {
  try {
    if (!(await canInspectPermissions(req, req.params.userId))) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'You do not have permission to view this user\'s permissions'
      });
    }

    const { organizationId, applicationId } = req.query;

    const result = await rbacService.getUserPermissions(req.params.userId, {
      organizationId,
      applicationId
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/check-permission
 * Check if user has specific permission
 */
router.post('/check-permission', requireAuth, async (req, res, next) => {
  try {
    const { userId = req.user.id, permission, organizationId, applicationId, serviceName } = req.body;

    if (!(await canInspectPermissions(req, userId))) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'You do not have permission to check another user\'s permission'
      });
    }

    const result = await rbacService.checkPermission(userId, permission, {
      organizationId,
      applicationId,
      serviceName
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/check-service-access
 * Check if user can access a service
 */
router.post('/check-service-access', requireAuth, async (req, res, next) => {
  try {
    const { userId = req.user.id, serviceName, organizationId, applicationId } = req.body;

    const result = await rbacService.checkServiceAccess(userId, serviceName, {
      organizationId,
      applicationId
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
