const express = require('express');
const router = express.Router();
const { requireToken } = require('../middleware/tokenAuth');
const { isPlatformAdminRequest } = require('../middleware/groupAuth');
const moderationService = require('../services/moderationService');
const adminAuditService = require('../services/adminAuditService');
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

const resolveFlagSchema = Joi.object({
  resolution: Joi.string().valid('dismiss', 'escalate').required(),
  reason: Joi.string().max(1000).allow('', null)
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
  requireToken(),
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
  requireToken(),
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
 * POST /api/moderation/flags/:flagId/resolve
 * Resolve a content flag. Body: { resolution: 'dismiss'|'escalate', reason? }.
 *  - dismiss:   marks the flag dismissed (no further action).
 *  - escalate:  creates or links a moderation case via the existing escalation
 *               flow (sets the flag status to 'escalated').
 * Authorization: group moderator/admin, OR platform admin (CA-token role 'admin').
 */
router.post('/flags/:flagId/resolve',
  requireToken(),
  async (req, res, next) => {
    try {
      const { error, value } = resolveFlagSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const userId = req.token.data.userId;
      const { flagId } = req.params;
      const { resolution, reason } = value;

      const flag = await GroupContentFlag.findByPk(flagId);
      if (!flag) {
        return res.status(404).json({
          error: 'FLAG_NOT_FOUND',
          message: 'Content flag not found'
        });
      }

      const isPlatformAdmin = isPlatformAdminRequest(req);
      if (!isPlatformAdmin) {
        // Throws on insufficient permissions (mapped by the error handler).
        await moderationService.verifyModeratorPermissions(userId, flag.groupId);
      }

      let moderationCase = null;
      if (resolution === 'escalate') {
        moderationCase = await moderationService.escalateToModerationCase(flag);
      } else {
        await flag.update({
          status: 'dismissed',
          action: 'none',
          resolution: reason || 'Flag dismissed',
          resolvedBy: userId,
          resolvedAt: Date.now(),
          updatedAt: Date.now()
        });
      }

      await adminAuditService.record({
        actor: userId,
        action: `moderation.flag.${resolution}`,
        targetType: 'flag',
        targetId: flagId,
        groupId: flag.groupId,
        metadata: {
          resolution,
          reason: reason || null,
          contentType: flag.contentType,
          contentId: flag.contentId,
          moderationCaseId: moderationCase ? moderationCase.id : null
        },
        isPlatformAdmin
      });

      res.json({
        success: true,
        flag,
        case: moderationCase,
        message: resolution === 'escalate'
          ? 'Flag escalated to a moderation case'
          : 'Flag dismissed'
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
  requireToken(),
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
  requireToken(),
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
  requireToken(),
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
  requireToken(),
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
