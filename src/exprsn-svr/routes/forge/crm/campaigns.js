const express = require('express');
const router = express.Router();
const { Campaign } = require('../../../models/forge');
const { requirePermission } = require('../../../middleware/auth');
const { validateBody, validateQuery, validateParams, schemas } = require('../../../middleware/validation');
const Joi = require('joi');
const campaignService = require('../../../services/forge/crm/campaignService');
const logger = require('../../../utils/logger');

// Validation schemas
const campaignCreateSchema = Joi.object({
  name: Joi.string().max(255).required(),
  type: Joi.string().valid('email', 'social', 'webinar', 'event', 'content', 'paid_ads').default('email'),
  description: Joi.string().optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  budget: Joi.number().min(0).default(0),
  targetAudience: Joi.object().optional(),
  goals: Joi.object({
    impressions: Joi.number().optional(),
    clicks: Joi.number().optional(),
    conversions: Joi.number().optional(),
    revenue: Joi.number().optional()
  }).optional()
});

const campaignUpdateSchema = campaignCreateSchema.fork(['name'], (schema) => schema.optional());

// List campaigns
router.get('/',
  
  requirePermission('read'),
  validateQuery(schemas.pagination.keys({
    search: Joi.string().optional(),
    type: Joi.string().valid('email', 'social', 'webinar', 'event', 'content', 'paid_ads').optional(),
    status: Joi.string().valid('draft', 'active', 'paused', 'completed').optional()
  })),
  async (req, res) => {
    try {
      const { page, limit, search, type, status, sortBy, sortOrder } = req.query;
      const offset = (page - 1) * limit;

      const where = { ownerId: req.user.id };
      if (type) where.type = type;
      if (status) where.status = status;

      if (search) {
        const { Op } = require('sequelize');
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { description: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const { count, rows } = await Campaign.findAndCountAll({
        where,
        limit,
        offset,
        order: sortBy ? [[sortBy, sortOrder]] : [['createdAt', 'DESC']]
      });

      res.json({
        success: true,
        campaigns: rows,
        pagination: {
          total: count,
          page,
          limit,
          pages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to list campaigns', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to list campaigns'
      });
    }
  }
);

// Get campaign by ID
router.get('/:id',
  
  requirePermission('read'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const campaign = await Campaign.findOne({
        where: { id: req.params.id, ownerId: req.user.id }
      });

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
      }

      res.json({
        success: true,
        campaign
      });
    } catch (error) {
      logger.error('Failed to get campaign', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get campaign'
      });
    }
  }
);

// Create campaign
router.post('/',
  
  requirePermission('write'),
  validateBody(campaignCreateSchema),
  async (req, res) => {
    try {
      const campaign = await campaignService.createCampaign({
        ...req.body,
        ownerId: req.user.id
      });

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('campaign:created', { campaign });

      res.status(201).json({
        success: true,
        campaign
      });
    } catch (error) {
      logger.error('Failed to create campaign', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to create campaign'
      });
    }
  }
);

// Update campaign
router.put('/:id',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(campaignUpdateSchema),
  async (req, res) => {
    try {
      const campaign = await Campaign.findOne({
        where: { id: req.params.id, ownerId: req.user.id }
      });

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
      }

      await campaign.update(req.body);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('campaign:updated', { campaign });

      res.json({
        success: true,
        campaign
      });
    } catch (error) {
      logger.error('Failed to update campaign', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to update campaign'
      });
    }
  }
);

// Delete campaign
router.delete('/:id',
  
  requirePermission('delete'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const campaign = await Campaign.findOne({
        where: { id: req.params.id, ownerId: req.user.id }
      });

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
      }

      if (campaign.status === 'active') {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete active campaign. Pause or complete it first.'
        });
      }

      await campaign.destroy();

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('campaign:deleted', { campaignId: campaign.id });

      res.json({
        success: true,
        message: 'Campaign deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete campaign', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to delete campaign'
      });
    }
  }
);

// Get campaign members
router.get('/:id/members',
  
  requirePermission('read'),
  validateParams(schemas.id),
  validateQuery(schemas.pagination.keys({
    status: Joi.string().optional()
  })),
  async (req, res) => {
    try {
      const campaign = await Campaign.findOne({
        where: { id: req.params.id, ownerId: req.user.id }
      });

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
      }

      let members = campaign.members || [];

      // Filter by status if specified
      if (req.query.status) {
        members = members.filter(m => m.status === req.query.status);
      }

      // Pagination
      const { page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;
      const paginatedMembers = members.slice(offset, offset + limit);

      res.json({
        success: true,
        members: paginatedMembers,
        pagination: {
          total: members.length,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(members.length / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to get campaign members', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get campaign members'
      });
    }
  }
);

// Add members to campaign
router.post('/:id/members',
  
  requirePermission('write'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    contactIds: Joi.array().items(Joi.string().uuid()).optional(),
    leadIds: Joi.array().items(Joi.string().uuid()).optional(),
    segmentCriteria: Joi.object().optional()
  })),
  async (req, res) => {
    try {
      const campaign = await campaignService.addMembers(req.params.id, req.body);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('campaign:members_added', {
        campaignId: campaign.id,
        memberCount: campaign.members.length
      });

      res.json({
        success: true,
        campaign,
        memberCount: campaign.members.length
      });
    } catch (error) {
      logger.error('Failed to add campaign members', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Remove members from campaign
router.delete('/:id/members',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    contactIds: Joi.array().items(Joi.string().uuid()).optional(),
    leadIds: Joi.array().items(Joi.string().uuid()).optional()
  })),
  async (req, res) => {
    try {
      const campaign = await campaignService.removeMembers(req.params.id, req.body);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('campaign:members_removed', {
        campaignId: campaign.id,
        memberCount: campaign.members.length
      });

      res.json({
        success: true,
        campaign,
        memberCount: campaign.members.length
      });
    } catch (error) {
      logger.error('Failed to remove campaign members', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Launch campaign
router.post('/:id/launch',
  
  requirePermission('update'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const campaign = await campaignService.launchCampaign(req.params.id, req.user.id);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('campaign:launched', {
        campaignId: campaign.id,
        memberCount: campaign.members.length
      });

      logger.info('Campaign launched', {
        campaignId: campaign.id,
        memberCount: campaign.members.length,
        userId: req.user.id
      });

      res.json({
        success: true,
        campaign
      });
    } catch (error) {
      logger.error('Failed to launch campaign', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Pause campaign
router.post('/:id/pause',
  
  requirePermission('update'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const campaign = await campaignService.pauseCampaign(req.params.id);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('campaign:paused', { campaignId: campaign.id });

      res.json({
        success: true,
        campaign
      });
    } catch (error) {
      logger.error('Failed to pause campaign', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Resume campaign (unpause)
router.post('/:id/resume',
  
  requirePermission('update'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const campaign = await Campaign.findOne({
        where: { id: req.params.id, ownerId: req.user.id }
      });

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
      }

      if (campaign.status !== 'paused') {
        return res.status(400).json({
          success: false,
          error: 'Can only resume paused campaigns'
        });
      }

      await campaign.update({ status: 'active' });

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('campaign:resumed', { campaignId: campaign.id });

      res.json({
        success: true,
        campaign
      });
    } catch (error) {
      logger.error('Failed to resume campaign', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Complete campaign
router.post('/:id/complete',
  
  requirePermission('update'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const campaign = await campaignService.completeCampaign(req.params.id);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('campaign:completed', { campaignId: campaign.id });

      res.json({
        success: true,
        campaign
      });
    } catch (error) {
      logger.error('Failed to complete campaign', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Track campaign event
router.post('/:id/track',
  
  requirePermission('write'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    memberId: Joi.string().uuid().required(),
    eventType: Joi.string().valid('sent', 'delivered', 'opened', 'clicked', 'bounced', 'unsubscribed', 'converted').required(),
    eventData: Joi.object().optional()
  })),
  async (req, res) => {
    try {
      const { memberId, eventType, eventData } = req.body;

      const campaign = await campaignService.trackEvent(
        req.params.id,
        memberId,
        eventType,
        eventData
      );

      res.json({
        success: true,
        campaign
      });
    } catch (error) {
      logger.error('Failed to track campaign event', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Get campaign performance report
router.get('/:id/performance',
  
  requirePermission('read'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const report = await campaignService.getPerformanceReport(req.params.id);

      res.json({
        success: true,
        report
      });
    } catch (error) {
      logger.error('Failed to get campaign performance', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Compare multiple campaigns
router.post('/compare',
  
  requirePermission('read'),
  validateBody(Joi.object({
    campaignIds: Joi.array().items(Joi.string().uuid()).min(2).max(5).required()
  })),
  async (req, res) => {
    try {
      const comparison = await campaignService.compareCampaigns(req.body.campaignIds);

      res.json({
        success: true,
        comparison
      });
    } catch (error) {
      logger.error('Failed to compare campaigns', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Get campaign statistics
router.get('/stats/overview',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    type: Joi.string().valid('email', 'social', 'webinar', 'event', 'content', 'paid_ads').optional(),
    status: Joi.string().valid('draft', 'active', 'paused', 'completed').optional()
  })),
  async (req, res) => {
    try {
      const stats = await campaignService.getCampaignStats({
        ...req.query,
        ownerId: req.user.id
      });

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      logger.error('Failed to get campaign stats', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get campaign stats'
      });
    }
  }
);

// A/B test campaigns
router.post('/ab-test',
  
  requirePermission('read'),
  validateBody(Joi.object({
    campaignIdA: Joi.string().uuid().required(),
    campaignIdB: Joi.string().uuid().required()
  })),
  async (req, res) => {
    try {
      const { campaignIdA, campaignIdB } = req.body;
      const results = await campaignService.abTest(campaignIdA, campaignIdB);

      res.json({
        success: true,
        results
      });
    } catch (error) {
      logger.error('Failed to perform A/B test', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Clone campaign
router.post('/:id/clone',
  
  requirePermission('write'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    name: Joi.string().max(255).optional()
  })),
  async (req, res) => {
    try {
      const original = await Campaign.findOne({
        where: { id: req.params.id, ownerId: req.user.id }
      });

      if (!original) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
      }

      const cloned = await Campaign.create({
        name: req.body.name || `${original.name} (Copy)`,
        type: original.type,
        description: original.description,
        status: 'draft',
        budget: original.budget,
        targetAudience: original.targetAudience,
        goals: original.goals,
        ownerId: req.user.id,
        metadata: {
          clonedFrom: original.id,
          clonedAt: new Date()
        }
      });

      logger.info('Campaign cloned', {
        originalId: original.id,
        clonedId: cloned.id,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        campaign: cloned
      });
    } catch (error) {
      logger.error('Failed to clone campaign', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Get active campaigns
router.get('/status/active',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const campaigns = await Campaign.findAll({
        where: {
          ownerId: req.user.id,
          status: 'active'
        },
        order: [['launchedAt', 'DESC']]
      });

      res.json({
        success: true,
        campaigns,
        count: campaigns.length
      });
    } catch (error) {
      logger.error('Failed to get active campaigns', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get active campaigns'
      });
    }
  }
);

module.exports = router;
