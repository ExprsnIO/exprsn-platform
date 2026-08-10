/**
 * ═══════════════════════════════════════════════════════════
 * List Routes
 * User list management with CA token validation
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const { asyncHandler, AppError, validatePagination } = require('@exprsn/shared');
const { requireToken, requireWrite, requireUpdate, requireDelete } = require('../middleware/auth');
const { validateListCreation, validateUUID } = require('../middleware/validation');
const { List, ListMember, Post } = require('../models');
const { Op } = require('sequelize');

const router = express.Router();

// All list routes require authentication
router.use(requireToken({ requiredPermissions: { read: true }, resourcePrefix: '/lists' }));

/**
 * POST /api/lists
 * Create a new list
 */
router.post('/',
  requireWrite('/lists'),
  validateListCreation,
  asyncHandler(async (req, res) => {
    const { name, description, visibility } = req.body;

    const list = await List.create({
      userId: req.userId,
      name,
      description,
      visibility: visibility || 'public',
      memberCount: 0
    });

    res.status(201).json({
      success: true,
      message: 'List created successfully',
      list
    });
  })
);

/**
 * GET /api/lists
 * Get user's lists
 */
router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = validatePagination(req.query);

  const lists = await List.findAll({
    where: {
      userId: req.userId,
      deleted: false
    },
    order: [['createdAt', 'DESC']],
    limit,
    offset
  });

  res.json({
    success: true,
    lists,
    count: lists.length,
    pagination: { page, limit, hasMore: lists.length === limit }
  });
}));

/**
 * GET /api/lists/:id
 * Get list details
 */
router.get('/:id',
  validateUUID('id'),
  asyncHandler(async (req, res) => {
    const list = await List.findByPk(req.params.id, {
      include: [
        { model: ListMember, as: 'members' }
      ]
    });

    if (!list || list.deleted) {
      throw new AppError('List not found', 404, 'NOT_FOUND');
    }

    // Check visibility
    if (list.visibility === 'private' && list.userId !== req.userId) {
      throw new AppError('This list is private', 403, 'FORBIDDEN');
    }

    res.json({
      success: true,
      list
    });
  })
);

/**
 * PUT /api/lists/:id
 * Update list
 */
router.put('/:id',
  validateUUID('id'),
  requireUpdate('/lists'),
  asyncHandler(async (req, res) => {
    const { name, description, visibility } = req.body;

    const list = await List.findByPk(req.params.id);

    if (!list || list.deleted) {
      throw new AppError('List not found', 404, 'NOT_FOUND');
    }

    if (list.userId !== req.userId) {
      throw new AppError('Not authorized to update this list', 403, 'FORBIDDEN');
    }

    await list.update({
      name: name !== undefined ? name : list.name,
      description: description !== undefined ? description : list.description,
      visibility: visibility !== undefined ? visibility : list.visibility
    });

    res.json({
      success: true,
      message: 'List updated successfully',
      list
    });
  })
);

/**
 * DELETE /api/lists/:id
 * Delete list
 */
router.delete('/:id',
  validateUUID('id'),
  requireDelete('/lists'),
  asyncHandler(async (req, res) => {
    const list = await List.findByPk(req.params.id);

    if (!list || list.deleted) {
      throw new AppError('List not found', 404, 'NOT_FOUND');
    }

    if (list.userId !== req.userId) {
      throw new AppError('Not authorized to delete this list', 403, 'FORBIDDEN');
    }

    await list.update({ deleted: true });

    res.json({
      success: true,
      message: 'List deleted successfully'
    });
  })
);

/**
 * POST /api/lists/:id/members
 * Add member to list
 */
router.post('/:id/members',
  validateUUID('id'),
  requireWrite('/lists'),
  asyncHandler(async (req, res) => {
    const { userId: memberUserId } = req.body;

    if (!memberUserId) {
      throw new AppError('User ID required', 400, 'MISSING_USER_ID');
    }

    const list = await List.findByPk(req.params.id);

    if (!list || list.deleted) {
      throw new AppError('List not found', 404, 'NOT_FOUND');
    }

    if (list.userId !== req.userId) {
      throw new AppError('Not authorized to modify this list', 403, 'FORBIDDEN');
    }

    const [member, created] = await ListMember.findOrCreate({
      where: { listId: req.params.id, userId: memberUserId },
      defaults: { listId: req.params.id, userId: memberUserId }
    });

    if (created) {
      await list.update({
        memberCount: list.memberCount + 1
      });
    }

    res.json({
      success: true,
      message: created ? 'Member added to list' : 'Member already in list',
      member
    });
  })
);

/**
 * DELETE /api/lists/:id/members/:userId
 * Remove member from list
 */
router.delete('/:id/members/:userId',
  validateUUID('id'),
  validateUUID('userId'),
  asyncHandler(async (req, res) => {
    const list = await List.findByPk(req.params.id);

    if (!list || list.deleted) {
      throw new AppError('List not found', 404, 'NOT_FOUND');
    }

    if (list.userId !== req.userId) {
      throw new AppError('Not authorized to modify this list', 403, 'FORBIDDEN');
    }

    const member = await ListMember.findOne({
      where: { listId: req.params.id, userId: req.params.userId }
    });

    if (member) {
      await member.destroy();
      await list.update({
        memberCount: Math.max(0, list.memberCount - 1)
      });
    }

    res.json({
      success: true,
      message: 'Member removed from list'
    });
  })
);

/**
 * GET /api/lists/:id/timeline
 * Get timeline for list members
 */
router.get('/:id/timeline',
  validateUUID('id'),
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = validatePagination(req.query);

    const list = await List.findByPk(req.params.id);

    if (!list || list.deleted) {
      throw new AppError('List not found', 404, 'NOT_FOUND');
    }

    // Check access
    if (list.visibility === 'private' && list.userId !== req.userId) {
      throw new AppError('This list is private', 403, 'FORBIDDEN');
    }

    // Get list members
    const members = await ListMember.findAll({
      where: { listId: req.params.id },
      attributes: ['userId']
    });

    const memberIds = members.map(m => m.userId);

    if (memberIds.length === 0) {
      return res.json({
        success: true,
        posts: [],
        pagination: { page, limit, hasMore: false }
      });
    }

    // Get posts from list members
    const posts = await Post.findAll({
      where: {
        userId: { [Op.in]: memberIds },
        deleted: false,
        visibility: { [Op.in]: ['public', 'followers'] }
      },
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    res.json({
      success: true,
      listId: req.params.id,
      posts,
      pagination: { page, limit, hasMore: posts.length === limit }
    });
  })
);

module.exports = router;
