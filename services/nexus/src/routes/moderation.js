const express = require('express');
const router = express.Router();
const { requireToken } = require('../middleware/tokenAuth');
const moderationService = require('../services/moderationService');
const { GroupContentFlag, GroupModerationCase } = require('../models');
const Joi = require('joi');

/**
 * ═══════════════════════════════════════════════════════════
 * Moderation Routes
 * Content flagging and moderation workflows
 * ═══════════════════════════════════════════════════════════
 */

// Validation schemas
const flagContentSchema = Joi.object({
  groupId: Joi.string().uuid().required(),
  contentType: Joi.string().valid('post', 'comment', 'event', 'member', 'message', 'other').required(),
  contentId: Joi.string().uuid().required(),
  contentOwnerId: Joi.string().uuid().allow(null),
  flagReason: Joi.string().valid(
    'spam',
    'harassment',
    'hate-speech',
    'violence',
    'misinformation',
    'nsfw',
    'off-topic',
    'inappropriate',
    'copyright',
    'other'
  ).required(),
  description: Joi.string().max(1000).allow(''),
  evidence: Joi.object().default({})
});

const moderationActionSchema = Joi.object({
  actionType: Joi.string().valid(
    'remove-content',
    'warn-user',
    'suspend-user',
    'ban-user',
    'dismiss'
  ).required(),
  reason: Joi.string().max(500).required(),
  duration: Joi.number().integer().min(0).allow(null)
});

/**
 * POST /api/moderation/flags
 * Flag content for moderation review
 */
router.post('/flags',
  requireToken,
  async (req, res, next) => {
    try {
      const { error, value } = flagContentSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const userId = req.token.data.userId;
      const flag = await moderationService.flagContent({
        ...value,
        reporterId: userId
      });

      res.status(201).json({
        success: true,
        flag,
        message: 'Content flagged for moderation review'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/moderation/flags/:groupId
 * Get content flags for a group (moderators only)
 */
router.get('/flags/:groupId',
  requireToken,
  async (req, res, next) => {
    try {
      const userId = req.token.data.userId;
      const { groupId } = req.params;
      const {
        status = 'pending',
        priority,
        limit = 50,
        offset = 0
      } = req.query;

      // Verify user is a moderator
      await moderationService.verifyModeratorPermissions(userId, groupId);

      const whereClause = {
        groupId,
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {})
      };

      const flags = await GroupContentFlag.findAll({
        where: whereClause,
        order: [['priority', 'DESC'], ['createdAt', 'ASC']],
        limit: Math.min(parseInt(limit), 100),
        offset: parseInt(offset)
      });

      const total = await GroupContentFlag.count({ where: whereClause });

      res.json({
        success: true,
        flags,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/moderation/queue/:groupId
 * Get moderation queue for a group (moderators only)
 */
router.get('/queue/:groupId',
  requireToken,
  async (req, res, next) => {
    try {
      const userId = req.token.data.userId;
      const { groupId } = req.params;
      const {
        status,
        priority,
        limit = 50,
        offset = 0
      } = req.query;

      // Verify user is a moderator
      await moderationService.verifyModeratorPermissions(userId, groupId);

      const queue = await moderationService.getModerationQueue(groupId, {
        status: status ? status.split(',') : ['open', 'under-review'],
        priority: priority ? parseInt(priority) : null,
        limit: Math.min(parseInt(limit), 100),
        offset: parseInt(offset)
      });

      res.json({
        success: true,
        ...queue
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/moderation/cases/:id
 * Get moderation case details
 */
router.get('/cases/:id',
  requireToken,
  async (req, res, next) => {
    try {
      const userId = req.token.data.userId;
      const { id } = req.params;

      const moderationCase = await GroupModerationCase.findByPk(id);
      if (!moderationCase) {
        return res.status(404).json({
          error: 'CASE_NOT_FOUND',
          message: 'Moderation case not found'
        });
      }

      // Verify user is a moderator
      await moderationService.verifyModeratorPermissions(userId, moderationCase.groupId);

      res.json({
        success: true,
        case: moderationCase
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/moderation/cases/:id/action
 * Take moderation action on a case
 */
router.post('/cases/:id/action',
  requireToken,
  async (req, res, next) => {
    try {
      const userId = req.token.data.userId;
      const { id } = req.params;

      const { error, value } = moderationActionSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const moderationCase = await moderationService.takeModerationAction(
        id,
        userId,
        value
      );

      res.json({
        success: true,
        case: moderationCase,
        message: `Moderation action taken: ${value.actionType}`
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/moderation/cases/:id/assign
 * Assign moderators to a case
 */
router.post('/cases/:id/assign',
  requireToken,
  async (req, res, next) => {
    try {
      const userId = req.token.data.userId;
      const { id } = req.params;
      const { moderatorIds } = req.body;

      if (!Array.isArray(moderatorIds) || moderatorIds.length === 0) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'moderatorIds must be a non-empty array'
        });
      }

      const moderationCase = await GroupModerationCase.findByPk(id);
      if (!moderationCase) {
        return res.status(404).json({
          error: 'CASE_NOT_FOUND',
          message: 'Moderation case not found'
        });
      }

      // Verify user is a moderator
      await moderationService.verifyModeratorPermissions(userId, moderationCase.groupId);

      await moderationCase.update({
        assignedModerators: moderatorIds,
        updatedAt: Date.now()
      });

      res.json({
        success: true,
        case: moderationCase,
        message: 'Moderators assigned successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
