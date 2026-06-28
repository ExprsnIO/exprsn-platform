const express = require('express');
const router = express.Router();
const { requireToken, optionalToken } = require('../middleware/tokenAuth');
const { isPlatformAdminRequest } = require('../middleware/groupAuth');
const subGroupService = require('../services/subGroupService');
const adminAuditService = require('../services/adminAuditService');
const Joi = require('joi');

/**
 * ═══════════════════════════════════════════════════════════
 * SubGroup Routes
 * Sub-groups and channels within groups
 * ═══════════════════════════════════════════════════════════
 */

// Validation schemas
const createSubGroupSchema = Joi.object({
  parentGroupId: Joi.string().uuid().required(),
  name: Joi.string().min(2).max(255).required(),
  description: Joi.string().allow(''),
  type: Joi.string().valid('channel', 'subgroup').default('channel'),
  visibility: Joi.string().valid('public', 'members', 'restricted').default('members'),
  inheritPermissions: Joi.boolean().default(true),
  permissions: Joi.object(),
  allowedRoles: Joi.array().items(Joi.string()),
  category: Joi.string().max(100).allow(null),
  tags: Joi.array().items(Joi.string()),
  avatarUrl: Joi.string().uri().allow(null),
  bannerUrl: Joi.string().uri().allow(null),
  maxMembers: Joi.number().integer().min(1).allow(null),
  sortOrder: Joi.number().integer().default(0),
  settings: Joi.object(),
  metadata: Joi.object()
});

const updateSubGroupSchema = Joi.object({
  name: Joi.string().min(2).max(255),
  description: Joi.string().allow(''),
  visibility: Joi.string().valid('public', 'members', 'restricted'),
  inheritPermissions: Joi.boolean(),
  permissions: Joi.object(),
  allowedRoles: Joi.array().items(Joi.string()),
  category: Joi.string().max(100).allow(null),
  tags: Joi.array().items(Joi.string()),
  avatarUrl: Joi.string().uri().allow(null),
  bannerUrl: Joi.string().uri().allow(null),
  maxMembers: Joi.number().integer().min(1).allow(null),
  sortOrder: Joi.number().integer(),
  isPinned: Joi.boolean(),
  settings: Joi.object(),
  metadata: Joi.object()
}).min(1);

const addMemberSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  role: Joi.string().valid('moderator', 'member').default('member')
});

/**
 * POST /api/subgroups
 * Create a new sub-group or channel
 */
router.post('/',
  requireToken(),
  async (req, res, next) => {
    try {
      const { error, value } = createSubGroupSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const userId = req.token.data.userId;
      const subGroup = await subGroupService.createSubGroup(
        value.parentGroupId,
        userId,
        value
      );

      res.status(201).json({
        success: true,
        subGroup
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/subgroups
 * List sub-groups for a parent group
 */
router.get('/',
  optionalToken(),
  async (req, res, next) => {
    try {
      if (!req.query.parentGroupId) {
        return res.status(400).json({
          error: 'MISSING_PARAMETER',
          message: 'parentGroupId required'
        });
      }

      const filters = {
        type: req.query.type,
        visibility: req.query.visibility,
        includeArchived: req.query.includeArchived === 'true'
      };

      const userId = req.token?.data?.userId || null;
      const subGroups = await subGroupService.listSubGroups(
        req.query.parentGroupId,
        userId,
        filters
      );

      res.json({
        success: true,
        subGroups,
        count: subGroups.length
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/subgroups/:id
 * Get sub-group details
 */
router.get('/:id',
  optionalToken(),
  async (req, res, next) => {
    try {
      const userId = req.token?.data?.userId || null;
      const subGroup = await subGroupService.getSubGroup(req.params.id, userId);

      res.json({
        success: true,
        subGroup
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/subgroups/:id
 * Update sub-group
 */
router.put('/:id',
  requireToken(),
  async (req, res, next) => {
    try {
      const { error, value } = updateSubGroupSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const userId = req.token.data.userId;
      const platformAdmin = isPlatformAdminRequest(req);
      const subGroup = await subGroupService.updateSubGroup(
        req.params.id,
        userId,
        value,
        { isPlatformAdmin: platformAdmin }
      );

      await adminAuditService.record({
        actor: userId,
        action: 'subgroup.update',
        targetType: 'subgroup',
        targetId: req.params.id,
        groupId: subGroup?.parentGroupId || null,
        metadata: { changes: Object.keys(value) },
        isPlatformAdmin: platformAdmin
      });

      res.json({
        success: true,
        subGroup
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/subgroups/:id
 * Archive sub-group
 */
router.delete('/:id',
  requireToken(),
  async (req, res, next) => {
    try {
      const userId = req.token.data.userId;
      const platformAdmin = isPlatformAdminRequest(req);
      const subGroup = await subGroupService.deleteSubGroup(req.params.id, userId, {
        isPlatformAdmin: platformAdmin
      });

      await adminAuditService.record({
        actor: userId,
        action: 'subgroup.delete',
        targetType: 'subgroup',
        targetId: req.params.id,
        groupId: subGroup?.parentGroupId || null,
        isPlatformAdmin: platformAdmin
      });

      res.json({
        success: true,
        subGroup,
        message: 'Sub-group archived successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/subgroups/:id/members
 * Add member to sub-group (for restricted sub-groups)
 */
router.post('/:id/members',
  requireToken(),
  async (req, res, next) => {
    try {
      const { error, value } = addMemberSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const adminId = req.token.data.userId;
      const platformAdmin = isPlatformAdminRequest(req);
      const membership = await subGroupService.addSubGroupMember(
        req.params.id,
        value.userId,
        adminId,
        value.role,
        { isPlatformAdmin: platformAdmin }
      );

      await adminAuditService.record({
        actor: adminId,
        action: 'subgroup.member.add',
        targetType: 'subgroup',
        targetId: req.params.id,
        metadata: { userId: value.userId, role: value.role },
        isPlatformAdmin: platformAdmin
      });

      res.status(201).json({
        success: true,
        membership,
        message: 'Member added to sub-group'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/subgroups/:id/members/:userId
 * Remove member from sub-group
 */
router.delete('/:id/members/:userId',
  requireToken(),
  async (req, res, next) => {
    try {
      const adminId = req.token.data.userId;
      const platformAdmin = isPlatformAdminRequest(req);
      await subGroupService.removeSubGroupMember(
        req.params.id,
        req.params.userId,
        adminId,
        { isPlatformAdmin: platformAdmin }
      );

      await adminAuditService.record({
        actor: adminId,
        action: 'subgroup.member.remove',
        targetType: 'subgroup',
        targetId: req.params.id,
        metadata: { userId: req.params.userId },
        isPlatformAdmin: platformAdmin
      });

      res.json({
        success: true,
        message: 'Member removed from sub-group'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/subgroups/:id/access
 * Check if current user has access to sub-group
 */
router.get('/:id/access',
  requireToken(),
  async (req, res, next) => {
    try {
      const userId = req.token.data.userId;
      const subGroup = await subGroupService.getSubGroup(req.params.id);
      const hasAccess = await subGroupService.checkSubGroupAccess(subGroup, userId);

      res.json({
        success: true,
        hasAccess,
        subGroupId: req.params.id
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
