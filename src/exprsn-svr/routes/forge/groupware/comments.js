const express = require('express');
const router = express.Router();
const { requirePermission } = require('../../../middleware/auth');
const { validateBody, validateQuery, validateParams, schemas } = require('../../../middleware/validation');
const Joi = require('joi');
const commentService = require('../../../services/forge/groupware/commentService');
const logger = require('../../../utils/logger');

// Validation schemas
const createCommentSchema = Joi.object({
  entityType: Joi.string().valid('wiki_page', 'document', 'task', 'board_card', 'note').required(),
  entityId: Joi.string().uuid().required(),
  content: Joi.string().min(1).max(5000).required(),
  contentFormat: Joi.string().valid('plain', 'markdown', 'html').default('markdown'),
  parentCommentId: Joi.string().uuid().optional(),
  mentions: Joi.array().items(Joi.string().uuid()).optional(),
  attachments: Joi.array().items(Joi.object({
    filename: Joi.string().required(),
    url: Joi.string().uri().required(),
    mimeType: Joi.string().required(),
    size: Joi.number().positive().required()
  })).optional()
});

const updateCommentSchema = Joi.object({
  content: Joi.string().min(1).max(5000).required(),
  contentFormat: Joi.string().valid('plain', 'markdown', 'html').optional()
});

const reactionSchema = Joi.object({
  emoji: Joi.string().required()
});

const flagSchema = Joi.object({
  reason: Joi.string().min(1).max(500).required()
});

// Get comments for an entity
router.get('/',
  
  requirePermission('read'),
  validateQuery(schemas.pagination.keys({
    entityType: Joi.string().valid('wiki_page', 'document', 'task', 'board_card', 'note').required(),
    entityId: Joi.string().uuid().required(),
    includeDeleted: Joi.boolean().optional(),
    sortBy: Joi.string().valid('createdAt', 'reactionCount').default('createdAt'),
    sortOrder: Joi.string().valid('ASC', 'DESC').default('ASC')
  })),
  async (req, res) => {
    try {
      const { page, limit, entityType, entityId, includeDeleted, sortBy, sortOrder } = req.query;
      const offset = (page - 1) * limit;

      const result = await commentService.getComments({
        entityType,
        entityId,
        includeDeleted: includeDeleted === 'true',
        limit,
        offset,
        sortBy,
        sortOrder
      });

      res.json({
        success: true,
        comments: result.comments,
        pagination: {
          total: result.total,
          page,
          limit,
          pages: Math.ceil(result.total / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to get comments', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get comments'
      });
    }
  }
);

// Get comment statistics for an entity
router.get('/stats',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    entityType: Joi.string().valid('wiki_page', 'document', 'task', 'board_card', 'note').required(),
    entityId: Joi.string().uuid().required()
  })),
  async (req, res) => {
    try {
      const { entityType, entityId } = req.query;

      const stats = await commentService.getCommentStats(entityType, entityId);

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      logger.error('Failed to get comment stats', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get comment stats'
      });
    }
  }
);

// Create a comment
router.post('/',
  
  requirePermission('write'),
  validateBody(createCommentSchema),
  async (req, res) => {
    try {
      const comment = await commentService.createComment({
        ...req.body,
        authorId: req.user.id
      });

      // Emit Socket.IO event for real-time updates
      const io = req.app.get('io');
      if (io) {
        io.to(`${req.body.entityType}:${req.body.entityId}`).emit('comment:created', {
          comment,
          entityType: req.body.entityType,
          entityId: req.body.entityId
        });

        // Notify mentioned users
        if (req.body.mentions && req.body.mentions.length > 0) {
          req.body.mentions.forEach(userId => {
            io.to(`user:${userId}`).emit('comment:mentioned', {
              comment,
              entityType: req.body.entityType,
              entityId: req.body.entityId
            });
          });
        }
      }

      res.status(201).json({
        success: true,
        comment
      });
    } catch (error) {
      logger.error('Failed to create comment', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Update a comment
router.put('/:id',
  
  requirePermission('write'),
  validateParams(schemas.id),
  validateBody(updateCommentSchema),
  async (req, res) => {
    try {
      const comment = await commentService.updateComment(
        req.params.id,
        req.body,
        req.user.id
      );

      // Emit Socket.IO event for real-time updates
      const io = req.app.get('io');
      if (io) {
        io.to(`${comment.entityType}:${comment.entityId}`).emit('comment:updated', {
          comment
        });
      }

      res.json({
        success: true,
        comment
      });
    } catch (error) {
      logger.error('Failed to update comment', { error: error.message });
      res.status(error.message.includes('Only comment author') ? 403 : 500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Delete a comment
router.delete('/:id',
  
  requirePermission('delete'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const comment = await commentService.deleteComment(req.params.id, req.user.id);

      // Emit Socket.IO event for real-time updates
      const io = req.app.get('io');
      if (io) {
        io.to(`${comment.entityType}:${comment.entityId}`).emit('comment:deleted', {
          commentId: req.params.id,
          entityType: comment.entityType,
          entityId: comment.entityId
        });
      }

      res.json({
        success: true,
        message: 'Comment deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete comment', { error: error.message });
      res.status(error.message.includes('Only comment author') ? 403 : 500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Add reaction to comment
router.post('/:id/reactions',
  
  requirePermission('write'),
  validateParams(schemas.id),
  validateBody(reactionSchema),
  async (req, res) => {
    try {
      const comment = await commentService.addReaction(
        req.params.id,
        req.body.emoji,
        req.user.id
      );

      // Emit Socket.IO event for real-time updates
      const io = req.app.get('io');
      if (io) {
        io.to(`${comment.entityType}:${comment.entityId}`).emit('comment:reaction:added', {
          commentId: req.params.id,
          emoji: req.body.emoji,
          userId: req.user.id
        });
      }

      res.json({
        success: true,
        comment
      });
    } catch (error) {
      logger.error('Failed to add reaction', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Remove reaction from comment
router.delete('/:id/reactions/:emoji',
  
  requirePermission('write'),
  validateParams(Joi.object({
    id: Joi.string().uuid().required(),
    emoji: Joi.string().required()
  })),
  async (req, res) => {
    try {
      const comment = await commentService.removeReaction(
        req.params.id,
        req.params.emoji,
        req.user.id
      );

      // Emit Socket.IO event for real-time updates
      const io = req.app.get('io');
      if (io) {
        io.to(`${comment.entityType}:${comment.entityId}`).emit('comment:reaction:removed', {
          commentId: req.params.id,
          emoji: req.params.emoji,
          userId: req.user.id
        });
      }

      res.json({
        success: true,
        comment
      });
    } catch (error) {
      logger.error('Failed to remove reaction', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Flag comment for moderation
router.post('/:id/flag',
  
  requirePermission('write'),
  validateParams(schemas.id),
  validateBody(flagSchema),
  async (req, res) => {
    try {
      const comment = await commentService.flagComment(
        req.params.id,
        req.body.reason,
        req.user.id
      );

      logger.info('Comment flagged for moderation', {
        commentId: req.params.id,
        flaggedBy: req.user.id,
        reason: req.body.reason
      });

      res.json({
        success: true,
        message: 'Comment flagged for moderation',
        comment
      });
    } catch (error) {
      logger.error('Failed to flag comment', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Get recent comments across multiple entities (useful for activity feeds)
router.get('/recent',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    entityType: Joi.string().valid('wiki_page', 'document', 'task', 'board_card', 'note').required(),
    entityIds: Joi.alternatives().try(
      Joi.string().uuid(),
      Joi.array().items(Joi.string().uuid())
    ).required(),
    limit: Joi.number().integer().min(1).max(100).default(10)
  })),
  async (req, res) => {
    try {
      const { entityType, entityIds, limit } = req.query;

      // Convert to array if single ID
      const ids = Array.isArray(entityIds) ? entityIds : [entityIds];

      const comments = await commentService.getRecentComments({
        entityType,
        entityIds: ids,
        limit
      });

      res.json({
        success: true,
        comments
      });
    } catch (error) {
      logger.error('Failed to get recent comments', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get recent comments'
      });
    }
  }
);

module.exports = router;
