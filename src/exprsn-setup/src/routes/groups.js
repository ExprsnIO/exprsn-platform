/**
 * ═══════════════════════════════════════════════════════════════════════
 * Groups Routes
 * API endpoints for group management with Socket.IO real-time updates
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { Group, GroupMember } = require('../models');
const logger = require('../utils/logger');
const { Op } = require('sequelize');
const axios = require('axios');

const AUTH_SERVICE_URL = process.env.AUTH_URL || 'http://localhost:3001';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * GROUP CRUD OPERATIONS
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/groups - List all groups with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const {
      search,
      type,
      visibility,
      parentId,
      isActive,
      page = 1,
      limit = 50,
      sort = '-created_at',
      includeMembers = 'false',
      includeChildren = 'false'
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

    if (type) where.type = type;
    if (visibility) where.visibility = visibility;
    if (parentId !== undefined) {
      where.parentId = parentId === 'null' ? null : parentId;
    }
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
    if (includeMembers === 'true') {
      include.push({
        model: GroupMember,
        as: 'memberships',
        required: false
      });
    }
    if (includeChildren === 'true') {
      include.push({
        model: Group,
        as: 'children',
        required: false
      });
    }

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: groups } = await Group.findAndCountAll({
      where,
      include,
      order,
      limit: parseInt(limit),
      offset,
      distinct: true
    });

    res.json({
      success: true,
      groups,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Failed to list groups:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list groups',
      message: error.message
    });
  }
});

// GET /api/groups/stats - Get group statistics
router.get('/stats', async (req, res) => {
  try {
    const totalGroups = await Group.count();
    const activeGroups = await Group.count({ where: { isActive: true } });
    const totalMembers = await GroupMember.count();

    const groupsByType = await Group.findAll({
      attributes: ['type', [Group.sequelize.fn('COUNT', Group.sequelize.col('id')), 'count']],
      group: ['type']
    });

    const groupsByVisibility = await Group.findAll({
      attributes: ['visibility', [Group.sequelize.fn('COUNT', Group.sequelize.col('id')), 'count']],
      group: ['visibility']
    });

    res.json({
      success: true,
      stats: {
        totalGroups,
        activeGroups,
        totalMembers,
        byType: groupsByType.reduce((acc, row) => {
          acc[row.type] = parseInt(row.get('count'));
          return acc;
        }, {}),
        byVisibility: groupsByVisibility.reduce((acc, row) => {
          acc[row.visibility] = parseInt(row.get('count'));
          return acc;
        }, {})
      }
    });
  } catch (error) {
    logger.error('Failed to get group stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get group statistics',
      message: error.message
    });
  }
});

// GET /api/groups/:id - Get specific group details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { includeMembers = 'false', includeParent = 'false', includeChildren = 'false' } = req.query;

    const include = [];

    if (includeMembers === 'true') {
      include.push({
        model: GroupMember,
        as: 'memberships'
      });
    }

    if (includeParent === 'true') {
      include.push({
        model: Group,
        as: 'parent'
      });
    }

    if (includeChildren === 'true') {
      include.push({
        model: Group,
        as: 'children'
      });
    }

    const group = await Group.findByPk(id, { include });

    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Group not found'
      });
    }

    res.json({
      success: true,
      group
    });
  } catch (error) {
    logger.error(`Failed to get group ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get group',
      message: error.message
    });
  }
});

// POST /api/groups - Create new group
router.post('/', async (req, res) => {
  try {
    const {
      name,
      slug,
      description,
      parentId,
      type,
      visibility,
      isActive,
      metadata,
      settings,
      createdBy
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
      const existing = await Group.findOne({ where: { slug } });
      if (existing) {
        return res.status(400).json({
          success: false,
          error: 'Slug already exists'
        });
      }
    }

    // Create group
    const group = await Group.create({
      name,
      slug,
      description,
      parentId,
      type,
      visibility,
      isActive,
      metadata,
      settings,
      createdBy
    });

    logger.info(`Created group: ${group.name} (${group.id})`);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('group:created', {
        group,
        timestamp: new Date().toISOString()
      });
    }

    res.status(201).json({
      success: true,
      group
    });
  } catch (error) {
    logger.error('Failed to create group:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create group',
      message: error.message
    });
  }
});

// PUT /api/groups/:id - Update group
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      slug,
      description,
      parentId,
      type,
      visibility,
      isActive,
      metadata,
      settings,
      updatedBy
    } = req.body;

    const group = await Group.findByPk(id);

    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Group not found'
      });
    }

    // Check if slug is unique (if changing)
    if (slug && slug !== group.slug) {
      const existing = await Group.findOne({ where: { slug } });
      if (existing) {
        return res.status(400).json({
          success: false,
          error: 'Slug already exists'
        });
      }
    }

    // Update group
    await group.update({
      name: name !== undefined ? name : group.name,
      slug: slug !== undefined ? slug : group.slug,
      description: description !== undefined ? description : group.description,
      parentId: parentId !== undefined ? parentId : group.parentId,
      type: type !== undefined ? type : group.type,
      visibility: visibility !== undefined ? visibility : group.visibility,
      isActive: isActive !== undefined ? isActive : group.isActive,
      metadata: metadata !== undefined ? metadata : group.metadata,
      settings: settings !== undefined ? settings : group.settings,
      updatedBy
    });

    logger.info(`Updated group: ${group.name} (${group.id})`);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('group:updated', {
        groupId: id,
        updates: req.body,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      group
    });
  } catch (error) {
    logger.error(`Failed to update group ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to update group',
      message: error.message
    });
  }
});

// DELETE /api/groups/:id - Delete group
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const group = await Group.findByPk(id);

    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Group not found'
      });
    }

    // Check if group has children
    const childrenCount = await Group.count({ where: { parentId: id } });
    if (childrenCount > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete group with children. Delete or reassign children first.'
      });
    }

    await group.destroy();

    logger.info(`Deleted group: ${group.name} (${id})`);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('group:deleted', {
        groupId: id,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Group deleted successfully'
    });
  } catch (error) {
    logger.error(`Failed to delete group ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete group',
      message: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * GROUP HIERARCHY
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/groups/:id/ancestors - Get group ancestors
router.get('/:id/ancestors', async (req, res) => {
  try {
    const { id } = req.params;

    const group = await Group.findByPk(id);

    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Group not found'
      });
    }

    const ancestors = await group.getAncestors();

    res.json({
      success: true,
      ancestors
    });
  } catch (error) {
    logger.error(`Failed to get ancestors for group ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get ancestors',
      message: error.message
    });
  }
});

// GET /api/groups/:id/descendants - Get group descendants
router.get('/:id/descendants', async (req, res) => {
  try {
    const { id } = req.params;

    const group = await Group.findByPk(id);

    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Group not found'
      });
    }

    const descendants = await group.getDescendants();

    res.json({
      success: true,
      descendants
    });
  } catch (error) {
    logger.error(`Failed to get descendants for group ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get descendants',
      message: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * GROUP MEMBER MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/groups/:id/members - Get group members
router.get('/:id/members', async (req, res) => {
  try {
    const { id } = req.params;
    const { role, status, page = 1, limit = 50 } = req.query;

    const group = await Group.findByPk(id);

    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Group not found'
      });
    }

    const where = { groupId: id };
    if (role) where.role = role;
    if (status) where.status = status;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: memberships } = await GroupMember.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['joined_at', 'DESC']]
    });

    // Fetch user data from exprsn-auth for each member
    const memberUserIds = memberships.map(m => m.userId);
    let users = [];

    if (memberUserIds.length > 0) {
      try {
        const response = await axios.post(`${AUTH_SERVICE_URL}/api/admin/users/bulk/details`, {
          userIds: memberUserIds
        });
        users = response.data.users || [];
      } catch (err) {
        logger.warn('Failed to fetch user details from auth service:', err.message);
      }
    }

    // Combine membership data with user data
    const members = memberships.map(membership => {
      const user = users.find(u => u.id === membership.userId) || { id: membership.userId };
      return {
        ...membership.toJSON(),
        user
      };
    });

    res.json({
      success: true,
      members,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error(`Failed to get members for group ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get group members',
      message: error.message
    });
  }
});

// POST /api/groups/:id/members - Add member to group
router.post('/:id/members', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, role = 'member', status = 'active', permissions, invitedBy } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const group = await Group.findByPk(id);

    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Group not found'
      });
    }

    // Check if already a member
    const existing = await GroupMember.findOne({
      where: { groupId: id, userId }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'User is already a member of this group'
      });
    }

    // Create membership
    const membership = await GroupMember.create({
      groupId: id,
      userId,
      role,
      status,
      permissions,
      invitedBy,
      invitedAt: invitedBy ? new Date() : null
    });

    logger.info(`Added user ${userId} to group ${group.name} (${id}) as ${role}`);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('group:member-added', {
        groupId: id,
        userId,
        role,
        timestamp: new Date().toISOString()
      });
    }

    res.status(201).json({
      success: true,
      membership
    });
  } catch (error) {
    logger.error(`Failed to add member to group ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to add member',
      message: error.message
    });
  }
});

// PUT /api/groups/:id/members/:userId - Update member role/permissions
router.put('/:id/members/:userId', async (req, res) => {
  try {
    const { id, userId } = req.params;
    const { role, status, permissions } = req.body;

    const membership = await GroupMember.findOne({
      where: { groupId: id, userId }
    });

    if (!membership) {
      return res.status(404).json({
        success: false,
        error: 'Membership not found'
      });
    }

    await membership.update({
      role: role !== undefined ? role : membership.role,
      status: status !== undefined ? status : membership.status,
      permissions: permissions !== undefined ? permissions : membership.permissions
    });

    logger.info(`Updated membership for user ${userId} in group ${id}`);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('group:member-updated', {
        groupId: id,
        userId,
        updates: req.body,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      membership
    });
  } catch (error) {
    logger.error(`Failed to update member ${req.params.userId} in group ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to update member',
      message: error.message
    });
  }
});

// DELETE /api/groups/:id/members/:userId - Remove member from group
router.delete('/:id/members/:userId', async (req, res) => {
  try {
    const { id, userId } = req.params;

    const membership = await GroupMember.findOne({
      where: { groupId: id, userId }
    });

    if (!membership) {
      return res.status(404).json({
        success: false,
        error: 'Membership not found'
      });
    }

    await membership.destroy();

    logger.info(`Removed user ${userId} from group ${id}`);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('group:member-removed', {
        groupId: id,
        userId,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Member removed successfully'
    });
  } catch (error) {
    logger.error(`Failed to remove member ${req.params.userId} from group ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove member',
      message: error.message
    });
  }
});

module.exports = router;
