const express = require('express');
const router = express.Router();
const { Opportunity } = require('../../../models/forge');
const { requirePermission } = require('../../../middleware/auth');
const { validateBody, validateQuery, validateParams, schemas } = require('../../../middleware/validation');
const Joi = require('joi');
const opportunityService = require('../../../services/forge/crm/opportunityService');
const logger = require('../../../utils/logger');

// Validation schemas
const opportunityCreateSchema = Joi.object({
  name: Joi.string().max(255).required(),
  amount: Joi.number().min(0).required(),
  expectedCloseDate: Joi.date().iso().required(),
  stage: Joi.string().optional(),
  probability: Joi.number().min(0).max(100).optional(),
  contactId: Joi.string().uuid().optional(),
  companyId: Joi.string().uuid().optional(),
  source: Joi.string().max(100).optional(),
  description: Joi.string().optional(),
  customFields: Joi.object().optional()
});

const opportunityUpdateSchema = opportunityCreateSchema.fork(
  ['name', 'amount', 'expectedCloseDate'],
  (schema) => schema.optional()
);

// List opportunities
router.get('/',
  
  requirePermission('read'),
  validateQuery(schemas.pagination.keys({
    search: Joi.string().optional(),
    stage: Joi.string().optional(),
    status: Joi.string().valid('open', 'won', 'lost').optional()
  })),
  async (req, res) => {
    try {
      const { page, limit, search, stage, status, sortBy, sortOrder } = req.query;
      const offset = (page - 1) * limit;

      const where = { ownerId: req.user.id };
      if (stage) where.stage = stage;
      if (status) where.status = status;

      if (search) {
        const { Op } = require('sequelize');
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { description: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const { count, rows } = await Opportunity.findAndCountAll({
        where,
        limit,
        offset,
        order: sortBy ? [[sortBy, sortOrder]] : [['expectedCloseDate', 'ASC']],
        include: [
          { association: 'contact', attributes: ['id', 'firstName', 'lastName'] },
          { association: 'company', attributes: ['id', 'name'] }
        ]
      });

      res.json({
        success: true,
        opportunities: rows,
        pagination: {
          total: count,
          page,
          limit,
          pages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to list opportunities', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to list opportunities'
      });
    }
  }
);

// Get opportunity by ID
router.get('/:id',
  
  requirePermission('read'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const opportunity = await Opportunity.findOne({
        where: { id: req.params.id, ownerId: req.user.id },
        include: [
          { association: 'contact' },
          { association: 'company' }
        ]
      });

      if (!opportunity) {
        return res.status(404).json({
          success: false,
          error: 'Opportunity not found'
        });
      }

      res.json({
        success: true,
        opportunity
      });
    } catch (error) {
      logger.error('Failed to get opportunity', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get opportunity'
      });
    }
  }
);

// Create opportunity
router.post('/',
  
  requirePermission('write'),
  validateBody(opportunityCreateSchema),
  async (req, res) => {
    try {
      const opportunity = await Opportunity.create({
        ...req.body,
        ownerId: req.user.id,
        stage: req.body.stage || 'Prospecting',
        probability: req.body.probability || 10
      });

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('opportunity:created', { opportunity });

      res.status(201).json({
        success: true,
        opportunity
      });
    } catch (error) {
      logger.error('Failed to create opportunity', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to create opportunity'
      });
    }
  }
);

// Update opportunity
router.put('/:id',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(opportunityUpdateSchema),
  async (req, res) => {
    try {
      const opportunity = await Opportunity.findOne({
        where: { id: req.params.id, ownerId: req.user.id }
      });

      if (!opportunity) {
        return res.status(404).json({
          success: false,
          error: 'Opportunity not found'
        });
      }

      await opportunity.update(req.body);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('opportunity:updated', { opportunity });

      res.json({
        success: true,
        opportunity
      });
    } catch (error) {
      logger.error('Failed to update opportunity', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to update opportunity'
      });
    }
  }
);

// Move to stage
router.post('/:id/stage',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    stage: Joi.string().required()
  })),
  async (req, res) => {
    try {
      const opportunity = await opportunityService.moveToStage(
        req.params.id,
        req.body.stage,
        req.user.id
      );

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('opportunity:stage_changed', {
        opportunityId: opportunity.id,
        stage: opportunity.stage
      });

      res.json({
        success: true,
        opportunity
      });
    } catch (error) {
      logger.error('Failed to move opportunity stage', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Mark as won
router.post('/:id/win',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    actualAmount: Joi.number().optional(),
    actualCloseDate: Joi.date().iso().optional(),
    winReason: Joi.string().optional()
  })),
  async (req, res) => {
    try {
      const opportunity = await opportunityService.markAsWon(req.params.id, {
        ...req.body,
        userId: req.user.id
      });

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('opportunity:won', {
        opportunityId: opportunity.id
      });

      res.json({
        success: true,
        opportunity
      });
    } catch (error) {
      logger.error('Failed to mark opportunity as won', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Mark as lost
router.post('/:id/lose',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    lossReason: Joi.string().optional(),
    competitorId: Joi.string().uuid().optional()
  })),
  async (req, res) => {
    try {
      const opportunity = await opportunityService.markAsLost(req.params.id, {
        ...req.body,
        userId: req.user.id
      });

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('opportunity:lost', {
        opportunityId: opportunity.id
      });

      res.json({
        success: true,
        opportunity
      });
    } catch (error) {
      logger.error('Failed to mark opportunity as lost', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Get pipeline forecast
router.get('/reports/forecast',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    stage: Joi.string().optional()
  })),
  async (req, res) => {
    try {
      const forecast = await opportunityService.getPipelineForecast({
        ...req.query,
        ownerId: req.user.id
      });

      res.json({
        success: true,
        forecast
      });
    } catch (error) {
      logger.error('Failed to get pipeline forecast', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get pipeline forecast'
      });
    }
  }
);

// Get win/loss analysis
router.get('/reports/win-loss',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional()
  })),
  async (req, res) => {
    try {
      const analysis = await opportunityService.getWinLossAnalysis({
        ...req.query,
        ownerId: req.user.id
      });

      res.json({
        success: true,
        analysis
      });
    } catch (error) {
      logger.error('Failed to get win/loss analysis', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get win/loss analysis'
      });
    }
  }
);

// Get aging report
router.get('/reports/aging',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    stage: Joi.string().optional()
  })),
  async (req, res) => {
    try {
      const report = await opportunityService.getAgingReport({
        ...req.query,
        ownerId: req.user.id
      });

      res.json({
        success: true,
        report
      });
    } catch (error) {
      logger.error('Failed to get aging report', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get aging report'
      });
    }
  }
);

// Clone opportunity
router.post('/:id/clone',
  
  requirePermission('write'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    name: Joi.string().optional(),
    ownerId: Joi.string().uuid().optional()
  })),
  async (req, res) => {
    try {
      const cloned = await opportunityService.cloneOpportunity(req.params.id, req.body);

      res.status(201).json({
        success: true,
        opportunity: cloned
      });
    } catch (error) {
      logger.error('Failed to clone opportunity', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

module.exports = router;
