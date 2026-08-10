const express = require('express');
const router = express.Router();
const { Lead } = require('../../../models/forge');
const { requirePermission } = require('../../../middleware/auth');
const { validateBody, validateQuery, validateParams, schemas } = require('../../../middleware/validation');
const Joi = require('joi');
const leadService = require('../../../services/forge/crm/leadService');
const workflowIntegration = require('../../../services/forge/workflowIntegration');
const logger = require('../../../utils/logger');

// Validation schemas
const leadCreateSchema = Joi.object({
  firstName: Joi.string().max(100).required(),
  lastName: Joi.string().max(100).required(),
  email: Joi.string().email().optional(),
  phone: Joi.string().max(50).optional(),
  company: Joi.string().max(255).optional(),
  jobTitle: Joi.string().max(200).optional(),
  status: Joi.string().valid('new', 'contacted', 'qualified', 'unqualified', 'converted', 'lost').optional(),
  source: Joi.string().max(100).optional(),
  estimatedValue: Joi.number().positive().optional(),
  currency: Joi.string().length(3).optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  customFields: Joi.object().optional()
});

const leadUpdateSchema = leadCreateSchema.fork(
  ['firstName', 'lastName'],
  (schema) => schema.optional()
);

const leadQualifySchema = Joi.object({
  qualified: Joi.boolean().required(),
  reason: Joi.string().max(500).optional()
});

const leadConvertSchema = Joi.object({
  createOpportunity: Joi.boolean().optional().default(false),
  opportunityData: Joi.object({
    name: Joi.string().required(),
    stage: Joi.string().optional(),
    amount: Joi.number().positive().optional(),
    closeDate: Joi.date().optional()
  }).optional()
});

const bulkImportSchema = Joi.object({
  leads: Joi.array().items(leadCreateSchema).min(1).max(1000).required()
});

// List leads
router.get('/',
  
  requirePermission('read'),
  validateQuery(schemas.pagination.keys({
    search: Joi.string().optional(),
    status: Joi.string().valid('new', 'contacted', 'qualified', 'unqualified', 'converted', 'lost').optional(),
    rating: Joi.string().valid('hot', 'warm', 'cold').optional(),
    source: Joi.string().optional(),
    minScore: Joi.number().min(0).max(100).optional(),
    maxScore: Joi.number().min(0).max(100).optional()
  })),
  async (req, res) => {
    try {
      const { page, limit, search, status, rating, source, minScore, maxScore, sortBy, sortOrder } = req.query;
      const offset = (page - 1) * limit;

      const where = { ownerId: req.user.id };

      if (status) where.status = status;
      if (rating) where.rating = rating;
      if (source) where.source = source;

      // Score range filtering
      if (minScore !== undefined || maxScore !== undefined) {
        const { Op } = require('sequelize');
        where.score = {};
        if (minScore !== undefined) where.score[Op.gte] = minScore;
        if (maxScore !== undefined) where.score[Op.lte] = maxScore;
      }

      // Search functionality
      if (search) {
        const { Op } = require('sequelize');
        where[Op.or] = [
          { firstName: { [Op.iLike]: `%${search}%` } },
          { lastName: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } },
          { company: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const { count, rows } = await Lead.findAndCountAll({
        where,
        limit,
        offset,
        order: sortBy ? [[sortBy, sortOrder]] : [['score', 'DESC'], ['createdAt', 'DESC']]
      });

      res.json({
        success: true,
        leads: rows,
        pagination: {
          total: count,
          page,
          limit,
          pages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to list leads', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to list leads'
      });
    }
  }
);

// Get lead statistics
router.get('/stats',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const stats = await leadService.getLeadStats(req.user.id);

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      logger.error('Failed to get lead stats', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get lead statistics'
      });
    }
  }
);

// Get lead by ID
router.get('/:id',
  
  requirePermission('read'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const lead = await Lead.findOne({
        where: {
          id: req.params.id,
          ownerId: req.user.id
        }
      });

      if (!lead) {
        return res.status(404).json({
          success: false,
          error: 'Lead not found'
        });
      }

      res.json({
        success: true,
        lead
      });
    } catch (error) {
      logger.error('Failed to get lead', { error: error.message, leadId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to get lead'
      });
    }
  }
);

// Create lead
router.post('/',
  
  requirePermission('write'),
  validateBody(leadCreateSchema),
  async (req, res) => {
    try {
      const lead = await Lead.create({
        ...req.body,
        ownerId: req.user.id
      });

      // Auto-calculate score and rating
      await leadService.updateLeadScore(lead);

      // Trigger workflow
      await workflowIntegration.triggerLeadWorkflow(lead.id, 'created');

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('lead:created', { lead });

      logger.info('Lead created', {
        leadId: lead.id,
        userId: req.user.id,
        score: lead.score,
        rating: lead.rating
      });

      res.status(201).json({
        success: true,
        lead
      });
    } catch (error) {
      logger.error('Failed to create lead', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to create lead'
      });
    }
  }
);

// Bulk import leads
router.post('/bulk-import',
  
  requirePermission('write'),
  validateBody(bulkImportSchema),
  async (req, res) => {
    try {
      const results = await leadService.bulkImportLeads(req.body.leads, req.user.id);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('leads:bulk-imported', { results });

      logger.info('Leads bulk imported', {
        userId: req.user.id,
        total: req.body.leads.length,
        created: results.created
      });

      res.status(201).json({
        success: true,
        results
      });
    } catch (error) {
      logger.error('Failed to bulk import leads', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to bulk import leads'
      });
    }
  }
);

// Update lead
router.put('/:id',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(leadUpdateSchema),
  async (req, res) => {
    try {
      const lead = await Lead.findOne({
        where: {
          id: req.params.id,
          ownerId: req.user.id
        }
      });

      if (!lead) {
        return res.status(404).json({
          success: false,
          error: 'Lead not found'
        });
      }

      await lead.update(req.body);

      // Recalculate score if relevant fields changed
      if (req.body.email || req.body.phone || req.body.company || req.body.estimatedValue || req.body.status) {
        await leadService.updateLeadScore(lead);
      }

      // Trigger workflow
      await workflowIntegration.triggerLeadWorkflow(lead.id, 'updated');

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('lead:updated', { lead });

      logger.info('Lead updated', {
        leadId: lead.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        lead
      });
    } catch (error) {
      logger.error('Failed to update lead', { error: error.message, leadId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to update lead'
      });
    }
  }
);

// Qualify/disqualify lead
router.post('/:id/qualify',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(leadQualifySchema),
  async (req, res) => {
    try {
      const lead = await leadService.qualifyLead(
        req.params.id,
        req.body.qualified,
        req.body.reason
      );

      // Trigger workflow
      await workflowIntegration.triggerLeadWorkflow(lead.id, req.body.qualified ? 'qualified' : 'disqualified');

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('lead:qualified', {
        lead,
        qualified: req.body.qualified
      });

      logger.info('Lead qualification updated', {
        leadId: lead.id,
        qualified: req.body.qualified,
        userId: req.user.id
      });

      res.json({
        success: true,
        lead
      });
    } catch (error) {
      logger.error('Failed to qualify lead', { error: error.message, leadId: req.params.id });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Convert lead to contact
router.post('/:id/convert',
  
  requirePermission('write'),
  validateParams(schemas.id),
  validateBody(leadConvertSchema),
  async (req, res) => {
    try {
      const result = await leadService.convertLead(req.params.id, req.user.id);

      // Trigger workflow
      await workflowIntegration.triggerLeadWorkflow(result.lead.id, 'converted');

      // Emit Socket.IO events
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('lead:converted', {
        lead: result.lead,
        contact: result.contact
      });

      logger.info('Lead converted', {
        leadId: result.lead.id,
        contactId: result.contact.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        lead: result.lead,
        contact: result.contact
      });
    } catch (error) {
      logger.error('Failed to convert lead', { error: error.message, leadId: req.params.id });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Assign lead to user
router.post('/:id/assign',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    userId: Joi.string().uuid().required()
  })),
  async (req, res) => {
    try {
      const lead = await leadService.assignLead(req.params.id, req.body.userId);

      // Trigger workflow
      await workflowIntegration.triggerLeadWorkflow(lead.id, 'assigned');

      // Emit Socket.IO events to both old and new owners
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('lead:assigned', { lead });
      io.to(`user:${req.body.userId}`).emit('lead:received', { lead });

      logger.info('Lead assigned', {
        leadId: lead.id,
        fromUserId: req.user.id,
        toUserId: req.body.userId
      });

      res.json({
        success: true,
        lead
      });
    } catch (error) {
      logger.error('Failed to assign lead', { error: error.message, leadId: req.params.id });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Delete lead
router.delete('/:id',
  
  requirePermission('delete'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const lead = await Lead.findOne({
        where: {
          id: req.params.id,
          ownerId: req.user.id
        }
      });

      if (!lead) {
        return res.status(404).json({
          success: false,
          error: 'Lead not found'
        });
      }

      await lead.destroy();

      // Trigger workflow
      await workflowIntegration.triggerLeadWorkflow(lead.id, 'deleted');

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('lead:deleted', { leadId: lead.id });

      logger.info('Lead deleted', {
        leadId: lead.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        message: 'Lead deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete lead', { error: error.message, leadId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to delete lead'
      });
    }
  }
);

module.exports = router;
