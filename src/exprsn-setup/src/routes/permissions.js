/**
 * ═══════════════════════════════════════════════════════════════════════
 * Permissions Routes
 * API endpoints for permission management with Socket.IO real-time updates
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { Permission, Role, RolePermission } = require('../models');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

/**
 * ═══════════════════════════════════════════════════════════════════════
 * PERMISSION CRUD OPERATIONS
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/permissions - List all permissions with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const {
      search,
      category,
      service,
      action,
      isSystem,
      isActive,
      page = 1,
      limit = 100,
      sort = 'slug',
      includeRoles = 'false'
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

    if (category) where.category = category;
    if (service) where.service = service;
    if (action) where.action = action;
    if (isSystem !== undefined) where.isSystem = isSystem === 'true';
    if (isActive !== undefined) where.isActive = isActive === 'true';

    // Build order clause
    const order = [];
    if (sort) {
      const direction = sort.startsWith('-') ? 'DESC' : 'ASC';
      const field = sort.replace(/^-/, '');
      order.push([field, direction]);
    }

    // Build include clause
    const include = [];
    if (includeRoles === 'true') {
      include.push({
        model: Role,
        as: 'roles',
        through: {
          attributes: ['granted', 'conditions']
        }
      });
    }

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: permissions } = await Permission.findAndCountAll({
      where,
      include,
      order,
      limit: parseInt(limit),
      offset,
      distinct: true
    });

    res.json({
      success: true,
      permissions,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Failed to list permissions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list permissions',
      message: error.message
    });
  }
});

// GET /api/permissions/stats - Get permission statistics
router.get('/stats', async (req, res) => {
  try {
    const totalPermissions = await Permission.count();
    const systemPermissions = await Permission.count({ where: { isSystem: true } });
    const activePermissions = await Permission.count({ where: { isActive: true } });

    const permissionsByCategory = await Permission.findAll({
      attributes: ['category', [Permission.sequelize.fn('COUNT', Permission.sequelize.col('id')), 'count']],
      where: { category: { [Op.ne]: null } },
      group: ['category']
    });

    const permissionsByService = await Permission.findAll({
      attributes: ['service', [Permission.sequelize.fn('COUNT', Permission.sequelize.col('id')), 'count']],
      where: { service: { [Op.ne]: null } },
      group: ['service']
    });

    const permissionsByAction = await Permission.findAll({
      attributes: ['action', [Permission.sequelize.fn('COUNT', Permission.sequelize.col('id')), 'count']],
      group: ['action']
    });

    res.json({
      success: true,
      stats: {
        totalPermissions,
        systemPermissions,
        activePermissions,
        byCategory: permissionsByCategory.reduce((acc, row) => {
          acc[row.category] = parseInt(row.get('count'));
          return acc;
        }, {}),
        byService: permissionsByService.reduce((acc, row) => {
          acc[row.service] = parseInt(row.get('count'));
          return acc;
        }, {}),
        byAction: permissionsByAction.reduce((acc, row) => {
          acc[row.action] = parseInt(row.get('count'));
          return acc;
        }, {})
      }
    });
  } catch (error) {
    logger.error('Failed to get permission stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get permission statistics',
      message: error.message
    });
  }
});

// GET /api/permissions/categories - Get unique categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await Permission.findAll({
      attributes: [[Permission.sequelize.fn('DISTINCT', Permission.sequelize.col('category')), 'category']],
      where: { category: { [Op.ne]: null } },
      raw: true
    });

    res.json({
      success: true,
      categories: categories.map(c => c.category).filter(Boolean)
    });
  } catch (error) {
    logger.error('Failed to get categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get categories',
      message: error.message
    });
  }
});

// GET /api/permissions/services - Get unique services
router.get('/services', async (req, res) => {
  try {
    const services = await Permission.findAll({
      attributes: [[Permission.sequelize.fn('DISTINCT', Permission.sequelize.col('service')), 'service']],
      where: { service: { [Op.ne]: null } },
      raw: true
    });

    res.json({
      success: true,
      services: services.map(s => s.service).filter(Boolean)
    });
  } catch (error) {
    logger.error('Failed to get services:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get services',
      message: error.message
    });
  }
});

// GET /api/permissions/actions - Get unique actions
router.get('/actions', async (req, res) => {
  try {
    const actions = await Permission.findAll({
      attributes: [[Permission.sequelize.fn('DISTINCT', Permission.sequelize.col('action')), 'action']],
      raw: true
    });

    res.json({
      success: true,
      actions: actions.map(a => a.action).filter(Boolean)
    });
  } catch (error) {
    logger.error('Failed to get actions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get actions',
      message: error.message
    });
  }
});

// GET /api/permissions/:id - Get specific permission details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { includeRoles = 'true' } = req.query;

    const include = [];

    if (includeRoles === 'true') {
      include.push({
        model: Role,
        as: 'roles',
        through: {
          attributes: ['granted', 'conditions', 'metadata']
        }
      });
    }

    const permission = await Permission.findByPk(id, { include });

    if (!permission) {
      return res.status(404).json({
        success: false,
        error: 'Permission not found'
      });
    }

    res.json({
      success: true,
      permission
    });
  } catch (error) {
    logger.error(`Failed to get permission ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get permission',
      message: error.message
    });
  }
});

// POST /api/permissions - Create new permission
router.post('/', async (req, res) => {
  try {
    const {
      name,
      slug,
      description,
      category,
      service,
      action,
      resource,
      isSystem,
      isActive,
      metadata,
      createdBy
    } = req.body;

    // Validation
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Name is required'
      });
    }

    if (!action) {
      return res.status(400).json({
        success: false,
        error: 'Action is required'
      });
    }

    // Check if slug is unique
    if (slug) {
      const existing = await Permission.findOne({ where: { slug } });
      if (existing) {
        return res.status(400).json({
          success: false,
          error: 'Slug already exists'
        });
      }
    }

    // Create permission
    const permission = await Permission.create({
      name,
      slug,
      description,
      category,
      service,
      action,
      resource,
      isSystem,
      isActive,
      metadata,
      createdBy
    });

    logger.info(`Created permission: ${permission.name} (${permission.id})`);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('permission:created', {
        permission,
        timestamp: new Date().toISOString()
      });
    }

    res.status(201).json({
      success: true,
      permission
    });
  } catch (error) {
    logger.error('Failed to create permission:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create permission',
      message: error.message
    });
  }
});

// POST /api/permissions/bulk - Create multiple permissions
router.post('/bulk', async (req, res) => {
  try {
    const { permissions, createdBy } = req.body;

    if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'permissions array is required'
      });
    }

    const created = [];
    const skipped = [];

    for (const permData of permissions) {
      try {
        // Check if slug already exists
        if (permData.slug) {
          const existing = await Permission.findOne({ where: { slug: permData.slug } });
          if (existing) {
            skipped.push({ ...permData, reason: 'Slug already exists' });
            continue;
          }
        }

        const permission = await Permission.create({
          ...permData,
          createdBy
        });

        created.push(permission);
      } catch (error) {
        skipped.push({ ...permData, reason: error.message });
      }
    }

    logger.info(`Bulk created ${created.length} permissions`);

    // Emit Socket.IO event
    if (req.app.get('io') && created.length > 0) {
      req.app.get('io').emit('permissions:bulk-created', {
        count: created.length,
        timestamp: new Date().toISOString()
      });
    }

    res.status(201).json({
      success: true,
      created: created.length,
      skipped: skipped.length,
      details: { created, skipped }
    });
  } catch (error) {
    logger.error('Failed to bulk create permissions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to bulk create permissions',
      message: error.message
    });
  }
});

// PUT /api/permissions/:id - Update permission
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      slug,
      description,
      category,
      service,
      action,
      resource,
      isActive,
      metadata,
      updatedBy
    } = req.body;

    const permission = await Permission.findByPk(id);

    if (!permission) {
      return res.status(404).json({
        success: false,
        error: 'Permission not found'
      });
    }

    // Prevent modification of isSystem flag
    if (req.body.isSystem !== undefined && permission.isSystem !== req.body.isSystem) {
      return res.status(400).json({
        success: false,
        error: 'Cannot modify isSystem flag'
      });
    }

    // Check if slug is unique (if changing)
    if (slug && slug !== permission.slug) {
      const existing = await Permission.findOne({ where: { slug } });
      if (existing) {
        return res.status(400).json({
          success: false,
          error: 'Slug already exists'
        });
      }
    }

    // Update permission
    await permission.update({
      name: name !== undefined ? name : permission.name,
      slug: slug !== undefined ? slug : permission.slug,
      description: description !== undefined ? description : permission.description,
      category: category !== undefined ? category : permission.category,
      service: service !== undefined ? service : permission.service,
      action: action !== undefined ? action : permission.action,
      resource: resource !== undefined ? resource : permission.resource,
      isActive: isActive !== undefined ? isActive : permission.isActive,
      metadata: metadata !== undefined ? metadata : permission.metadata,
      updatedBy
    });

    logger.info(`Updated permission: ${permission.name} (${permission.id})`);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('permission:updated', {
        permissionId: id,
        updates: req.body,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      permission
    });
  } catch (error) {
    logger.error(`Failed to update permission ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to update permission',
      message: error.message
    });
  }
});

// DELETE /api/permissions/:id - Delete permission
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const permission = await Permission.findByPk(id);

    if (!permission) {
      return res.status(404).json({
        success: false,
        error: 'Permission not found'
      });
    }

    // Prevent deletion of system permissions
    if (permission.isSystem) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete system permission'
      });
    }

    await permission.destroy();

    logger.info(`Deleted permission: ${permission.name} (${id})`);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('permission:deleted', {
        permissionId: id,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Permission deleted successfully'
    });
  } catch (error) {
    logger.error(`Failed to delete permission ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete permission',
      message: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * PERMISSION ROLE MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/permissions/:id/roles - Get roles with this permission
router.get('/:id/roles', async (req, res) => {
  try {
    const { id } = req.params;

    const permission = await Permission.findByPk(id);

    if (!permission) {
      return res.status(404).json({
        success: false,
        error: 'Permission not found'
      });
    }

    const roles = await permission.getRoles({
      through: { attributes: ['granted', 'conditions', 'metadata'] }
    });

    res.json({
      success: true,
      roles,
      count: roles.length
    });
  } catch (error) {
    logger.error(`Failed to get roles for permission ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get roles',
      message: error.message
    });
  }
});

module.exports = router;
