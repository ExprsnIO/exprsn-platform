/**
 * ═══════════════════════════════════════════════════════════════════════
 * Roles Routes
 * API endpoints for role management with Socket.IO real-time updates
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { Role, Permission, RolePermission } = require('../models');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ROLE CRUD OPERATIONS
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/roles - List all roles with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const {
      search,
      scope,
      isSystem,
      isActive,
      parentId,
      page = 1,
      limit = 50,
      sort = '-priority',
      includePermissions = 'false',
      includeParent = 'false'
    } = req.query;

    // Build where clause
    const where = {};

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { slug: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }

    if (scope) where.scope = scope;
    if (isSystem !== undefined) where.isSystem = isSystem === 'true';
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (parentId !== undefined) {
      where.parentId = parentId === 'null' ? null : parentId;
    }

    // Build order clause
    const order = [];
    if (sort) {
      const direction = sort.startsWith('-') ? 'DESC' : 'ASC';
      const field = sort.replace(/^-/, '');
      order.push([field, direction]);
    }

    // Build include clause
    const include = [];
    if (includePermissions === 'true') {
      include.push({
        model: Permission,
        as: 'permissions',
        through: {
          attributes: ['granted', 'conditions']
        }
      });
    }
    if (includeParent === 'true') {
      include.push({
        model: Role,
        as: 'parent',
        required: false
      });
    }

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: roles } = await Role.findAndCountAll({
      where,
      include,
      order,
      limit: parseInt(limit),
      offset,
      distinct: true
    });

    res.json({
      success: true,
      roles,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Failed to list roles:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list roles',
      message: error.message
    });
  }
});

// GET /api/roles/stats - Get role statistics
router.get('/stats', async (req, res) => {
  try {
    const totalRoles = await Role.count();
    const systemRoles = await Role.count({ where: { isSystem: true } });
    const activeRoles = await Role.count({ where: { isActive: true } });
    const totalPermissions = await Permission.count();

    const rolesByScope = await Role.findAll({
      attributes: ['scope', [Role.sequelize.fn('COUNT', Role.sequelize.col('id')), 'count']],
      group: ['scope']
    });

    res.json({
      success: true,
      stats: {
        totalRoles,
        systemRoles,
        activeRoles,
        totalPermissions,
        byScope: rolesByScope.reduce((acc, row) => {
          acc[row.scope] = parseInt(row.get('count'));
          return acc;
        }, {})
      }
    });
  } catch (error) {
    logger.error('Failed to get role stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get role statistics',
      message: error.message
    });
  }
});

// GET /api/roles/:id - Get specific role details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { includePermissions = 'true', includeParent = 'false', includeChildren = 'false' } = req.query;

    const include = [];

    if (includePermissions === 'true') {
      include.push({
        model: Permission,
        as: 'permissions',
        through: {
          attributes: ['granted', 'conditions', 'metadata']
        }
      });
    }

    if (includeParent === 'true') {
      include.push({
        model: Role,
        as: 'parent'
      });
    }

    if (includeChildren === 'true') {
      include.push({
        model: Role,
        as: 'children'
      });
    }

    const role = await Role.findByPk(id, { include });

    if (!role) {
      return res.status(404).json({
        success: false,
        error: 'Role not found'
      });
    }

    res.json({
      success: true,
      role
    });
  } catch (error) {
    logger.error(`Failed to get role ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get role',
      message: error.message
    });
  }
});

// POST /api/roles - Create new role
router.post('/', async (req, res) => {
  try {
    const {
      name,
      slug,
      description,
      isSystem,
      isActive,
      parentId,
      priority,
      scope,
      scopeValue,
      metadata,
      settings,
      createdBy,
      permissions = []
    } = req.body;

    // Validation
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Name is required'
      });
    }

    // Check if slug is unique
    if (slug) {
      const existing = await Role.findOne({ where: { slug } });
      if (existing) {
        return res.status(400).json({
          success: false,
          error: 'Slug already exists'
        });
      }
    }

    // Create role
    const role = await Role.create({
      name,
      slug,
      description,
      isSystem,
      isActive,
      parentId,
      priority,
      scope,
      scopeValue,
      metadata,
      settings,
      createdBy
    });

    // Add permissions if provided
    if (permissions.length > 0) {
      for (const permissionData of permissions) {
        await RolePermission.create({
          roleId: role.id,
          permissionId: permissionData.permissionId,
          granted: permissionData.granted !== undefined ? permissionData.granted : true,
          conditions: permissionData.conditions || {},
          createdBy
        });
      }
    }

    logger.info(`Created role: ${role.name} (${role.id})`);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('role:created', {
        role,
        timestamp: new Date().toISOString()
      });
    }

    // Fetch role with permissions
    const createdRole = await Role.findByPk(role.id, {
      include: [{
        model: Permission,
        as: 'permissions',
        through: { attributes: ['granted', 'conditions'] }
      }]
    });

    res.status(201).json({
      success: true,
      role: createdRole
    });
  } catch (error) {
    logger.error('Failed to create role:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create role',
      message: error.message
    });
  }
});

// PUT /api/roles/:id - Update role
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      slug,
      description,
      isActive,
      parentId,
      priority,
      scope,
      scopeValue,
      metadata,
      settings,
      updatedBy
    } = req.body;

    const role = await Role.findByPk(id);

    if (!role) {
      return res.status(404).json({
        success: false,
        error: 'Role not found'
      });
    }

    // Prevent modification of isSystem flag
    if (req.body.isSystem !== undefined && role.isSystem !== req.body.isSystem) {
      return res.status(400).json({
        success: false,
        error: 'Cannot modify isSystem flag'
      });
    }

    // Check if slug is unique (if changing)
    if (slug && slug !== role.slug) {
      const existing = await Role.findOne({ where: { slug } });
      if (existing) {
        return res.status(400).json({
          success: false,
          error: 'Slug already exists'
        });
      }
    }

    // Update role
    await role.update({
      name: name !== undefined ? name : role.name,
      slug: slug !== undefined ? slug : role.slug,
      description: description !== undefined ? description : role.description,
      isActive: isActive !== undefined ? isActive : role.isActive,
      parentId: parentId !== undefined ? parentId : role.parentId,
      priority: priority !== undefined ? priority : role.priority,
      scope: scope !== undefined ? scope : role.scope,
      scopeValue: scopeValue !== undefined ? scopeValue : role.scopeValue,
      metadata: metadata !== undefined ? metadata : role.metadata,
      settings: settings !== undefined ? settings : role.settings,
      updatedBy
    });

    logger.info(`Updated role: ${role.name} (${role.id})`);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('role:updated', {
        roleId: id,
        updates: req.body,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      role
    });
  } catch (error) {
    logger.error(`Failed to update role ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to update role',
      message: error.message
    });
  }
});

// DELETE /api/roles/:id - Delete role
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const role = await Role.findByPk(id);

    if (!role) {
      return res.status(404).json({
        success: false,
        error: 'Role not found'
      });
    }

    // Prevent deletion of system roles
    if (role.isSystem) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete system role'
      });
    }

    // Check if role has children
    const childrenCount = await Role.count({ where: { parentId: id } });
    if (childrenCount > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete role with child roles. Delete or reassign children first.'
      });
    }

    await role.destroy();

    logger.info(`Deleted role: ${role.name} (${id})`);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('role:deleted', {
        roleId: id,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Role deleted successfully'
    });
  } catch (error) {
    logger.error(`Failed to delete role ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete role',
      message: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ROLE PERMISSION MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/roles/:id/permissions - Get role permissions
router.get('/:id/permissions', async (req, res) => {
  try {
    const { id } = req.params;
    const { includeInherited = 'false' } = req.query;

    const role = await Role.findByPk(id);

    if (!role) {
      return res.status(404).json({
        success: false,
        error: 'Role not found'
      });
    }

    let permissions;

    if (includeInherited === 'true') {
      permissions = await role.getAllPermissions();
    } else {
      permissions = await role.getPermissions({
        through: { attributes: ['granted', 'conditions', 'metadata'] }
      });
    }

    res.json({
      success: true,
      permissions,
      count: permissions.length
    });
  } catch (error) {
    logger.error(`Failed to get permissions for role ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get role permissions',
      message: error.message
    });
  }
});

// POST /api/roles/:id/permissions - Add permissions to role
router.post('/:id/permissions', async (req, res) => {
  try {
    const { id } = req.params;
    const { permissionIds, granted = true, conditions, createdBy } = req.body;

    if (!permissionIds || !Array.isArray(permissionIds) || permissionIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'permissionIds array is required'
      });
    }

    const role = await Role.findByPk(id);

    if (!role) {
      return res.status(404).json({
        success: false,
        error: 'Role not found'
      });
    }

    const added = [];
    const skipped = [];

    for (const permissionId of permissionIds) {
      // Check if permission exists
      const permission = await Permission.findByPk(permissionId);
      if (!permission) {
        skipped.push({ permissionId, reason: 'Permission not found' });
        continue;
      }

      // Check if already assigned
      const existing = await RolePermission.findOne({
        where: { roleId: id, permissionId }
      });

      if (existing) {
        skipped.push({ permissionId, reason: 'Already assigned' });
        continue;
      }

      // Add permission
      await RolePermission.create({
        roleId: id,
        permissionId,
        granted,
        conditions: conditions || {},
        createdBy
      });

      added.push(permissionId);
    }

    logger.info(`Added ${added.length} permissions to role ${role.name} (${id})`);

    // Emit Socket.IO event
    if (req.app.get('io') && added.length > 0) {
      req.app.get('io').emit('role:permissions-added', {
        roleId: id,
        permissionIds: added,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      added: added.length,
      skipped: skipped.length,
      details: { added, skipped }
    });
  } catch (error) {
    logger.error(`Failed to add permissions to role ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to add permissions',
      message: error.message
    });
  }
});

// DELETE /api/roles/:id/permissions/:permissionId - Remove permission from role
router.delete('/:id/permissions/:permissionId', async (req, res) => {
  try {
    const { id, permissionId } = req.params;

    const rolePermission = await RolePermission.findOne({
      where: { roleId: id, permissionId }
    });

    if (!rolePermission) {
      return res.status(404).json({
        success: false,
        error: 'Permission not assigned to this role'
      });
    }

    await rolePermission.destroy();

    logger.info(`Removed permission ${permissionId} from role ${id}`);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('role:permission-removed', {
        roleId: id,
        permissionId,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Permission removed successfully'
    });
  } catch (error) {
    logger.error(`Failed to remove permission from role ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove permission',
      message: error.message
    });
  }
});

// PUT /api/roles/:id/permissions/:permissionId - Update permission assignment
router.put('/:id/permissions/:permissionId', async (req, res) => {
  try {
    const { id, permissionId } = req.params;
    const { granted, conditions } = req.body;

    const rolePermission = await RolePermission.findOne({
      where: { roleId: id, permissionId }
    });

    if (!rolePermission) {
      return res.status(404).json({
        success: false,
        error: 'Permission not assigned to this role'
      });
    }

    await rolePermission.update({
      granted: granted !== undefined ? granted : rolePermission.granted,
      conditions: conditions !== undefined ? conditions : rolePermission.conditions
    });

    logger.info(`Updated permission ${permissionId} for role ${id}`);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('role:permission-updated', {
        roleId: id,
        permissionId,
        updates: req.body,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      rolePermission
    });
  } catch (error) {
    logger.error(`Failed to update permission for role ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to update permission',
      message: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ROLE HIERARCHY
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/roles/:id/ancestors - Get role ancestors
router.get('/:id/ancestors', async (req, res) => {
  try {
    const { id } = req.params;

    const role = await Role.findByPk(id);

    if (!role) {
      return res.status(404).json({
        success: false,
        error: 'Role not found'
      });
    }

    const ancestors = await role.getAncestors();

    res.json({
      success: true,
      ancestors
    });
  } catch (error) {
    logger.error(`Failed to get ancestors for role ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get ancestors',
      message: error.message
    });
  }
});

module.exports = router;
