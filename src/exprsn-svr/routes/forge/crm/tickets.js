const express = require('express');
const router = express.Router();
const { SupportTicket } = require('../../../models/forge');
const { requirePermission } = require('../../../middleware/auth');
const { validateBody, validateQuery, validateParams, schemas } = require('../../../middleware/validation');
const Joi = require('joi');
const ticketService = require('../../../services/forge/crm/ticketService');
const logger = require('../../../utils/logger');

// Validation schemas
const ticketCreateSchema = Joi.object({
  subject: Joi.string().max(255).required(),
  description: Joi.string().required(),
  priority: Joi.string().valid('critical', 'high', 'medium', 'low').default('medium'),
  category: Joi.string().max(100).default('general'),
  contactId: Joi.string().uuid().required(),
  assignedTo: Joi.string().uuid().optional(),
  tags: Joi.array().items(Joi.string()).optional()
});

const ticketUpdateSchema = Joi.object({
  subject: Joi.string().max(255).optional(),
  description: Joi.string().optional(),
  priority: Joi.string().valid('critical', 'high', 'medium', 'low').optional(),
  category: Joi.string().max(100).optional(),
  assignedTo: Joi.string().uuid().optional(),
  tags: Joi.array().items(Joi.string()).optional()
});

// List tickets
router.get('/',
  
  requirePermission('read'),
  validateQuery(schemas.pagination.keys({
    search: Joi.string().optional(),
    status: Joi.string().valid('open', 'pending', 'resolved', 'closed').optional(),
    priority: Joi.string().valid('critical', 'high', 'medium', 'low').optional(),
    assignedTo: Joi.string().uuid().optional(),
    category: Joi.string().optional()
  })),
  async (req, res) => {
    try {
      const { page, limit, search, status, priority, assignedTo, category, sortBy, sortOrder } = req.query;
      const offset = (page - 1) * limit;

      const where = {};
      if (status) where.status = status;
      if (priority) where.priority = priority;
      if (assignedTo) where.assignedTo = assignedTo;
      if (category) where.category = category;

      if (search) {
        const { Op } = require('sequelize');
        where[Op.or] = [
          { subject: { [Op.iLike]: `%${search}%` } },
          { description: { [Op.iLike]: `%${search}%` } },
          { ticketNumber: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const { count, rows } = await SupportTicket.findAndCountAll({
        where,
        limit,
        offset,
        order: sortBy ? [[sortBy, sortOrder]] : [['createdAt', 'DESC']],
        include: [
          { association: 'contact', attributes: ['id', 'firstName', 'lastName', 'email'] }
        ]
      });

      res.json({
        success: true,
        tickets: rows,
        pagination: {
          total: count,
          page,
          limit,
          pages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to list tickets', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to list tickets'
      });
    }
  }
);

// Get ticket by ID
router.get('/:id',
  
  requirePermission('read'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const ticket = await SupportTicket.findByPk(req.params.id, {
        include: [
          { association: 'contact' },
          { association: 'sla' }
        ]
      });

      if (!ticket) {
        return res.status(404).json({
          success: false,
          error: 'Ticket not found'
        });
      }

      // Check SLA breach status
      const slaStatus = ticketService.checkSLABreach(ticket);

      res.json({
        success: true,
        ticket: {
          ...ticket.toJSON(),
          slaStatus
        }
      });
    } catch (error) {
      logger.error('Failed to get ticket', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get ticket'
      });
    }
  }
);

// Create ticket
router.post('/',
  
  requirePermission('write'),
  validateBody(ticketCreateSchema),
  async (req, res) => {
    try {
      const ticket = await ticketService.createTicket(req.body);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('ticket:created', { ticket });

      // If assigned to someone, notify them
      if (ticket.assignedTo) {
        io.to(`user:${ticket.assignedTo}`).emit('ticket:assigned', { ticket });
      }

      logger.info('Ticket created', {
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        ticket
      });
    } catch (error) {
      logger.error('Failed to create ticket', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to create ticket'
      });
    }
  }
);

// Update ticket
router.put('/:id',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(ticketUpdateSchema),
  async (req, res) => {
    try {
      const ticket = await SupportTicket.findByPk(req.params.id);

      if (!ticket) {
        return res.status(404).json({
          success: false,
          error: 'Ticket not found'
        });
      }

      await ticket.update(req.body);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('ticket:updated', { ticket });

      res.json({
        success: true,
        ticket
      });
    } catch (error) {
      logger.error('Failed to update ticket', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to update ticket'
      });
    }
  }
);

// Add comment
router.post('/:id/comments',
  
  requirePermission('write'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    content: Joi.string().required(),
    isInternal: Joi.boolean().default(false)
  })),
  async (req, res) => {
    try {
      const ticket = await ticketService.addComment(req.params.id, {
        content: req.body.content,
        isInternal: req.body.isInternal,
        userId: req.user.id
      });

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`ticket:${ticket.id}`).emit('ticket:comment_added', {
        ticketId: ticket.id,
        comment: ticket.comments[ticket.comments.length - 1]
      });

      logger.info('Comment added to ticket', {
        ticketId: ticket.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        ticket
      });
    } catch (error) {
      logger.error('Failed to add comment', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Update ticket status
router.post('/:id/status',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    status: Joi.string().valid('open', 'pending', 'resolved', 'closed').required()
  })),
  async (req, res) => {
    try {
      const ticket = await ticketService.updateStatus(
        req.params.id,
        req.body.status,
        req.user.id
      );

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`ticket:${ticket.id}`).emit('ticket:status_changed', {
        ticketId: ticket.id,
        status: ticket.status
      });

      res.json({
        success: true,
        ticket
      });
    } catch (error) {
      logger.error('Failed to update ticket status', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Close ticket
router.post('/:id/close',
  
  requirePermission('update'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const ticket = await ticketService.updateStatus(
        req.params.id,
        'closed',
        req.user.id
      );

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`ticket:${ticket.id}`).emit('ticket:closed', { ticketId: ticket.id });

      res.json({
        success: true,
        ticket
      });
    } catch (error) {
      logger.error('Failed to close ticket', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Escalate ticket
router.post('/:id/escalate',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    escalatedTo: Joi.string().uuid().required(),
    reason: Joi.string().required()
  })),
  async (req, res) => {
    try {
      const ticket = await ticketService.escalateTicket(req.params.id, {
        escalatedTo: req.body.escalatedTo,
        reason: req.body.reason,
        userId: req.user.id
      });

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.body.escalatedTo}`).emit('ticket:escalated', {
        ticket,
        reason: req.body.reason
      });

      res.json({
        success: true,
        ticket
      });
    } catch (error) {
      logger.error('Failed to escalate ticket', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Re-assign ticket
router.post('/:id/assign',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    assignedTo: Joi.string().uuid().required()
  })),
  async (req, res) => {
    try {
      const ticket = await SupportTicket.findByPk(req.params.id);

      if (!ticket) {
        return res.status(404).json({
          success: false,
          error: 'Ticket not found'
        });
      }

      const previousAssignee = ticket.assignedTo;
      await ticket.update({ assignedTo: req.body.assignedTo });

      // Emit Socket.IO events
      const io = req.app.get('io');
      io.to(`user:${req.body.assignedTo}`).emit('ticket:assigned', { ticket });
      if (previousAssignee) {
        io.to(`user:${previousAssignee}`).emit('ticket:unassigned', { ticketId: ticket.id });
      }

      logger.info('Ticket reassigned', {
        ticketId: ticket.id,
        from: previousAssignee,
        to: req.body.assignedTo
      });

      res.json({
        success: true,
        ticket
      });
    } catch (error) {
      logger.error('Failed to assign ticket', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Get ticket statistics
router.get('/stats/overview',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    assignedTo: Joi.string().uuid().optional()
  })),
  async (req, res) => {
    try {
      const stats = await ticketService.getTicketStats(req.query);

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      logger.error('Failed to get ticket stats', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get ticket stats'
      });
    }
  }
);

// Get tickets needing attention (SLA at risk)
router.get('/reports/attention',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    assignedTo: Joi.string().uuid().optional(),
    category: Joi.string().optional()
  })),
  async (req, res) => {
    try {
      const tickets = await ticketService.getTicketsNeedingAttention(req.query);

      res.json({
        success: true,
        tickets,
        count: tickets.length
      });
    } catch (error) {
      logger.error('Failed to get tickets needing attention', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get tickets needing attention'
      });
    }
  }
);

// Get my assigned tickets
router.get('/my/assigned',
  
  requirePermission('read'),
  validateQuery(schemas.pagination.keys({
    status: Joi.string().valid('open', 'pending', 'resolved', 'closed').optional(),
    priority: Joi.string().valid('critical', 'high', 'medium', 'low').optional()
  })),
  async (req, res) => {
    try {
      const { page, limit, status, priority, sortBy, sortOrder } = req.query;
      const offset = (page - 1) * limit;

      const where = { assignedTo: req.user.id };
      if (status) where.status = status;
      if (priority) where.priority = priority;

      const { count, rows } = await SupportTicket.findAndCountAll({
        where,
        limit,
        offset,
        order: sortBy ? [[sortBy, sortOrder]] : [['priority', 'ASC'], ['createdAt', 'ASC']],
        include: [
          { association: 'contact', attributes: ['id', 'firstName', 'lastName', 'email'] }
        ]
      });

      res.json({
        success: true,
        tickets: rows,
        pagination: {
          total: count,
          page,
          limit,
          pages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to get assigned tickets', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get assigned tickets'
      });
    }
  }
);

// Get ticket by number
router.get('/number/:ticketNumber',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const ticket = await SupportTicket.findOne({
        where: { ticketNumber: req.params.ticketNumber },
        include: [
          { association: 'contact' },
          { association: 'sla' }
        ]
      });

      if (!ticket) {
        return res.status(404).json({
          success: false,
          error: 'Ticket not found'
        });
      }

      // Check SLA breach status
      const slaStatus = ticketService.checkSLABreach(ticket);

      res.json({
        success: true,
        ticket: {
          ...ticket.toJSON(),
          slaStatus
        }
      });
    } catch (error) {
      logger.error('Failed to get ticket by number', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get ticket'
      });
    }
  }
);

// Bulk update tickets
router.post('/bulk/update',
  
  requirePermission('update'),
  validateBody(Joi.object({
    ticketIds: Joi.array().items(Joi.string().uuid()).min(1).required(),
    updates: Joi.object({
      status: Joi.string().valid('open', 'pending', 'resolved', 'closed').optional(),
      priority: Joi.string().valid('critical', 'high', 'medium', 'low').optional(),
      assignedTo: Joi.string().uuid().optional(),
      tags: Joi.array().items(Joi.string()).optional()
    }).required()
  })),
  async (req, res) => {
    try {
      const { ticketIds, updates } = req.body;

      await SupportTicket.update(updates, {
        where: { id: { [require('sequelize').Op.in]: ticketIds } }
      });

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('tickets:bulk_updated', {
        ticketIds,
        updates
      });

      logger.info('Bulk ticket update', {
        count: ticketIds.length,
        updates,
        userId: req.user.id
      });

      res.json({
        success: true,
        message: `${ticketIds.length} tickets updated`
      });
    } catch (error) {
      logger.error('Failed to bulk update tickets', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

module.exports = router;
