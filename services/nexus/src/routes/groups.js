const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { requireToken, requirePermissions } = require('../middleware/tokenAuth');
const { validateGroup, requireGroupMember, requireGroupAdmin } = require('../middleware/groupAuth');
const { sanitizeGroupData } = require('../utils/sanitization');
const groupService = require('../services/groupService');
const membershipService = require('../services/membershipService');
const groupDiscoveryService = require('../services/groupDiscoveryService');

/**
 * ═══════════════════════════════════════════════════════════
 * Group Routes
 * All routes require valid CA tokens
 * ═══════════════════════════════════════════════════════════
 */

// Validation schemas
const createGroupSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  description: Joi.string().max(5000).allow(null, ''),
  visibility: Joi.string().valid('public', 'private', 'unlisted').default('public'),
  joinMode: Joi.string().valid('open', 'request', 'invite').default('request'),
  governanceModel: Joi.string().valid('centralized', 'decentralized', 'dao', 'consensus').default('centralized'),
  governanceRules: Joi.object().default({}),
  category: Joi.string().max(100).allow(null, ''),
  tags: Joi.array().items(Joi.string().max(50)).default([]),
  avatarUrl: Joi.string().uri().max(500).allow(null, ''),
  bannerUrl: Joi.string().uri().max(500).allow(null, ''),
  maxMembers: Joi.number().integer().min(1).allow(null),
  location: Joi.string().max(255).allow(null, ''),
  website: Joi.string().uri().max(500).allow(null, ''),
  metadata: Joi.object().default({})
});

const updateGroupSchema = Joi.object({
  name: Joi.string().min(2).max(255),
  description: Joi.string().max(5000).allow(null, ''),
  visibility: Joi.string().valid('public', 'private', 'unlisted'),
  joinMode: Joi.string().valid('open', 'request', 'invite'),
  governanceModel: Joi.string().valid('centralized', 'decentralized', 'dao', 'consensus'),
  governanceRules: Joi.object(),
  category: Joi.string().max(100).allow(null, ''),
  tags: Joi.array().items(Joi.string().max(50)),
  avatarUrl: Joi.string().uri().max(500).allow(null, ''),
  bannerUrl: Joi.string().uri().max(500).allow(null, ''),
  maxMembers: Joi.number().integer().min(1).allow(null),
  location: Joi.string().max(255).allow(null, ''),
  website: Joi.string().uri().max(500).allow(null, ''),
  metadata: Joi.object()
});

/**
 * POST /api/groups
 * Create a new group
 */
router.post('/',
  requireToken({ requiredPermissions: { write: true } }),
  async (req, res, next) => {
    try {
      const { error, value } = createGroupSchema.validate(req.body);

      if (error) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: error.details[0].message,
          details: error.details
        });
      }

      // Sanitize user input to prevent XSS
      const sanitizedData = sanitizeGroupData(value);

      const group = await groupService.createGroup(req.user.id, sanitizedData);

      res.status(201).json({
        success: true,
        group
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/groups
 * List groups with filters
 */
router.get('/',
  async (req, res, next) => {
    try {
      const filters = {
        visibility: req.query.visibility,
        category: req.query.category,
        tags: req.query.tags ? req.query.tags.split(',') : undefined,
        search: req.query.search,
        isFeatured: req.query.featured === 'true',
        isVerified: req.query.verified === 'true',
        creatorId: req.query.creatorId
      };

      const pagination = {
        page: parseInt(req.query.page) || 1,
        limit: Math.min(parseInt(req.query.limit) || 20, 100),
        sortBy: req.query.sortBy || 'createdAt',
        sortOrder: req.query.sortOrder || 'DESC'
      };

      const result = await groupService.listGroups(filters, pagination);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/groups/:id
 * Get group details
 */
router.get('/:id',
  validateGroup,
  async (req, res, next) => {
    try {
      const group = await groupService.getGroup(req.params.id, req.user?.id);

      res.json({
        success: true,
        group
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/groups/:id
 * Update group
 */
router.put('/:id',
  requireToken({ requiredPermissions: { update: true } }),
  validateGroup,
  requireGroupMember,
  requireGroupAdmin,
  async (req, res, next) => {
    try {
      const { error, value } = updateGroupSchema.validate(req.body);

      if (error) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: error.details[0].message,
          details: error.details
        });
      }

      // Sanitize user input to prevent XSS
      const sanitizedData = sanitizeGroupData(value);

      const group = await groupService.updateGroup(req.params.id, req.user.id, sanitizedData);

      res.json({
        success: true,
        group
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/groups/:id
 * Delete group (soft delete)
 */
router.delete('/:id',
  requireToken({ requiredPermissions: { delete: true } }),
  validateGroup,
  requireGroupMember,
  async (req, res, next) => {
    try {
      const group = await groupService.deleteGroup(req.params.id, req.user.id);

      res.json({
        success: true,
        message: 'Group deleted successfully',
        group
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/groups/:id/members
 * List group members
 */
router.get('/:id/members',
  validateGroup,
  requireGroupMember,
  async (req, res, next) => {
    try {
      const filters = {
        role: req.query.role,
        status: req.query.status || 'active'
      };

      const pagination = {
        page: parseInt(req.query.page) || 1,
        limit: Math.min(parseInt(req.query.limit) || 50, 100)
      };

      const result = await membershipService.listMembers(req.params.id, filters, pagination);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/groups/:id/join
 * Join a group
 */
router.post('/:id/join',
  requireToken({ requiredPermissions: { write: true } }),
  validateGroup,
  async (req, res, next) => {
    try {
      const result = await membershipService.joinGroup(req.user.id, req.params.id, {
        message: req.body.message,
        inviteCode: req.body.inviteCode
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/groups/:id/leave
 * Leave a group
 */
router.post('/:id/leave',
  requireToken(),
  validateGroup,
  requireGroupMember,
  async (req, res, next) => {
    try {
      const membership = await membershipService.leaveGroup(req.user.id, req.params.id);

      res.json({
        success: true,
        message: 'Left group successfully',
        membership
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/groups/:id/members/:userId
 * Remove a member (admin only)
 */
router.delete('/:id/members/:userId',
  requireToken({ requiredPermissions: { delete: true } }),
  validateGroup,
  requireGroupMember,
  requireGroupAdmin,
  async (req, res, next) => {
    try {
      const membership = await membershipService.removeMember(
        req.user.id,
        req.params.id,
        req.params.userId,
        req.body.reason
      );

      res.json({
        success: true,
        message: 'Member removed successfully',
        membership
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/groups/:id/invite
 * Create an invite
 */
router.post('/:id/invite',
  requireToken({ requiredPermissions: { write: true } }),
  validateGroup,
  requireGroupMember,
  async (req, res, next) => {
    try {
      const invite = await membershipService.createInvite(req.user.id, req.params.id, {
        userId: req.body.userId,
        message: req.body.message,
        maxUses: req.body.maxUses,
        expiresAt: req.body.expiresAt
      });

      res.status(201).json({
        success: true,
        invite
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/groups/:id/join-requests/:requestId/approve
 * Approve a join request
 */
router.post('/:id/join-requests/:requestId/approve',
  requireToken({ requiredPermissions: { write: true } }),
  validateGroup,
  requireGroupMember,
  requireGroupAdmin,
  async (req, res, next) => {
    try {
      const result = await membershipService.approveJoinRequest(
        req.user.id,
        req.params.id,
        req.params.requestId
      );

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/groups/:id/join-requests/:requestId/reject
 * Reject a join request
 */
router.post('/:id/join-requests/:requestId/reject',
  requireToken({ requiredPermissions: { write: true } }),
  validateGroup,
  requireGroupMember,
  requireGroupAdmin,
  async (req, res, next) => {
    try {
      const request = await membershipService.rejectJoinRequest(
        req.user.id,
        req.params.id,
        req.params.requestId,
        req.body.reason
      );

      res.json({
        success: true,
        request
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * ═══════════════════════════════════════════════════════════
 * Enhanced Discovery Routes
 * Advanced group search and discovery features
 * ═══════════════════════════════════════════════════════════
 */

/**
 * POST /api/groups/search
 * Advanced group search with faceted filters
 */
router.post('/search',
  async (req, res, next) => {
    try {
      const filters = {
        query: req.body.query,
        category: req.body.category,
        tags: req.body.tags,
        location: req.body.location,
        minMembers: req.body.minMembers,
        maxMembers: req.body.maxMembers,
        governanceModel: req.body.governanceModel,
        visibility: req.body.visibility,
        joinMode: req.body.joinMode,
        isFeatured: req.body.isFeatured,
        isVerified: req.body.isVerified
      };

      const pagination = {
        page: parseInt(req.body.page) || 1,
        limit: Math.min(parseInt(req.body.limit) || 20, 100),
        sortBy: req.body.sortBy || 'relevance',
        sortOrder: req.body.sortOrder || 'DESC'
      };

      // Track search query for analytics
      if (filters.query) {
        await groupDiscoveryService.trackSearchQuery(filters.query);
      }

      const result = await groupDiscoveryService.advancedSearch(filters, pagination);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/groups/discover/nearby
 * Find groups near a geographic location
 */
router.get('/discover/nearby',
  async (req, res, next) => {
    try {
      const latitude = parseFloat(req.query.lat);
      const longitude = parseFloat(req.query.lng);
      const radius = parseInt(req.query.radius) || 50;

      if (isNaN(latitude) || isNaN(longitude)) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Valid latitude and longitude required'
        });
      }

      const options = {
        limit: Math.min(parseInt(req.query.limit) || 20, 100),
        offset: parseInt(req.query.offset) || 0
      };

      const groups = await groupDiscoveryService.findGroupsNearLocation(
        latitude,
        longitude,
        radius,
        options
      );

      res.json({
        success: true,
        groups,
        count: groups.length,
        location: { latitude, longitude, radius }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/groups/discover/activity
 * Get activity feed showing what's happening across groups
 */
router.get('/discover/activity',
  async (req, res, next) => {
    try {
      const filters = {
        categories: req.query.categories ? req.query.categories.split(',') : undefined
      };

      const limit = Math.min(parseInt(req.query.limit) || 50, 100);

      const activityFeed = await groupDiscoveryService.getActivityFeed(filters, limit);

      res.json({
        success: true,
        activityFeed,
        count: activityFeed.length
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/groups/:id/related
 * Get topic/interest graph showing related groups
 */
router.get('/:id/related',
  validateGroup,
  async (req, res, next) => {
    try {
      const depth = Math.min(parseInt(req.query.depth) || 2, 3);

      const topicGraph = await groupDiscoveryService.getTopicGraph(req.params.id, depth);

      res.json({
        success: true,
        topicGraph
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/groups/search/popular
 * Get popular search queries
 */
router.get('/search/popular',
  async (req, res, next) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 10, 50);

      const popularQueries = await groupDiscoveryService.getPopularSearchQueries(limit);

      res.json({
        success: true,
        popularQueries,
        count: popularQueries.length
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
