const express = require('express');
const router = express.Router();
const { requirePermission } = require('../../../middleware/auth');
const { validateBody, validateQuery, validateParams, schemas } = require('../../../middleware/validation');
const Joi = require('joi');
const activityService = require('../../../services/forge/crm/activityService');
const logger = require('../../../utils/logger');

// Validation schemas
const activityCreateSchema = Joi.object({
  subject: Joi.string().max(500).required(),
  description: Joi.string().optional(),
  activityType: Joi.string().valid('call', 'email', 'meeting', 'task', 'note', 'deadline', 'sms', 'social').required(),
  status: Joi.string().valid('planned', 'completed', 'cancelled', 'overdue').optional(),
  priority: Joi.string().valid('low', 'medium', 'high', 'urgent').optional(),
  direction: Joi.string().valid('inbound', 'outbound').optional(),
  duration: Joi.number().integer().positive().optional(),
  scheduledAt: Joi.date().iso().optional(),
  dueDate: Joi.date().iso().optional(),
  contactId: Joi.string().uuid().optional(),
  companyId: Joi.string().uuid().optional(),
  leadId: Joi.string().uuid().optional(),
  opportunityId: Joi.string().uuid().optional(),
  assignedToId: Joi.string().uuid().optional(),
  location: Joi.string().max(500).optional(),
  attendees: Joi.array().items(Joi.string().uuid()).optional(),
  outcome: Joi.string().max(255).optional(),
  nextSteps: Joi.string().optional(),
  attachments: Joi.array().optional(),
  reminderAt: Joi.date().iso().optional(),
  metadata: Joi.object().optional()
});

const activityUpdateSchema = activityCreateSchema.fork(
  ['subject', 'activityType'],
  (schema) => schema.optional()
);

const completeActivitySchema = Joi.object({
  outcome: Joi.string().max(255).optional(),
  nextSteps: Joi.string().optional()
});

const callLogSchema = Joi.object({
  subject: Joi.string().max(500).required(),
  description: Joi.string().optional(),
  direction: Joi.string().valid('inbound', 'outbound').required(),
  duration: Joi.number().integer().positive().optional(),
  contactId: Joi.string().uuid().optional(),
  companyId: Joi.string().uuid().optional(),
  leadId: Joi.string().uuid().optional(),
  opportunityId: Joi.string().uuid().optional(),
  outcome: Joi.string().max(255).optional(),
  nextSteps: Joi.string().optional(),
  metadata: Joi.object().optional()
});

const emailLogSchema = Joi.object({
  subject: Joi.string().max(500).required(),
  description: Joi.string().optional(),
  direction: Joi.string().valid('inbound', 'outbound').required(),
  contactId: Joi.string().uuid().optional(),
  companyId: Joi.string().uuid().optional(),
  leadId: Joi.string().uuid().optional(),
  opportunityId: Joi.string().uuid().optional(),
  attachments: Joi.array().optional(),
  metadata: Joi.object().optional()
});

const meetingScheduleSchema = Joi.object({
  subject: Joi.string().max(500).required(),
  description: Joi.string().optional(),
  scheduledAt: Joi.date().iso().required(),
  duration: Joi.number().integer().positive().optional(),
  location: Joi.string().max(500).optional(),
  attendees: Joi.array().items(Joi.string().uuid()).optional(),
  contactId: Joi.string().uuid().optional(),
  companyId: Joi.string().uuid().optional(),
  leadId: Joi.string().uuid().optional(),
  opportunityId: Joi.string().uuid().optional(),
  assignedToId: Joi.string().uuid().optional(),
  reminderAt: Joi.date().iso().optional(),
  metadata: Joi.object().optional()
});

const bulkCreateSchema = Joi.object({
  activities: Joi.array().items(activityCreateSchema).min(1).max(500).required()
});

// List activities
router.get('/',
  
  requirePermission('read'),
  validateQuery(schemas.pagination.keys({
    activityType: Joi.string().valid('call', 'email', 'meeting', 'task', 'note', 'deadline', 'sms', 'social').optional(),
    status: Joi.string().valid('planned', 'completed', 'cancelled', 'overdue').optional(),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent').optional(),
    contactId: Joi.string().uuid().optional(),
    companyId: Joi.string().uuid().optional(),
    leadId: Joi.string().uuid().optional(),
    opportunityId: Joi.string().uuid().optional(),
    assignedToId: Joi.string().uuid().optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    search: Joi.string().optional()
  })),
  async (req, res) => {
    try {
      const { page, limit, ...filters } = req.query;
      const offset = (page - 1) * limit;

      const result = await activityService.listActivities({
        ...filters,
        createdById: req.user.id,
        limit,
        offset
      });

      res.json({
        success: true,
        activities: result.activities,
        pagination: {
          total: result.total,
          page,
          limit,
          pages: Math.ceil(result.total / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to list activities', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to list activities'
      });
    }
  }
);

// Get activity statistics
router.get('/stats',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    assignedToId: Joi.string().uuid().optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional()
  })),
  async (req, res) => {
    try {
      const stats = await activityService.getActivityStats({
        createdById: req.user.id,
        ...req.query
      });

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      logger.error('Failed to get activity stats', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get activity statistics'
      });
    }
  }
);

// Get upcoming activities
router.get('/upcoming',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    assignedToId: Joi.string().uuid().optional(),
    days: Joi.number().integer().min(1).max(90).optional().default(7),
    limit: Joi.number().integer().min(1).max(100).optional().default(50)
  })),
  async (req, res) => {
    try {
      const activities = await activityService.getUpcomingActivities({
        createdById: req.user.id,
        ...req.query
      });

      res.json({
        success: true,
        activities
      });
    } catch (error) {
      logger.error('Failed to get upcoming activities', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get upcoming activities'
      });
    }
  }
);

// Get overdue activities
router.get('/overdue',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    assignedToId: Joi.string().uuid().optional(),
    limit: Joi.number().integer().min(1).max(100).optional().default(50)
  })),
  async (req, res) => {
    try {
      const activities = await activityService.getOverdueActivities({
        createdById: req.user.id,
        ...req.query
      });

      res.json({
        success: true,
        activities
      });
    } catch (error) {
      logger.error('Failed to get overdue activities', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get overdue activities'
      });
    }
  }
);

// Get activity timeline for entity
router.get('/timeline',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    contactId: Joi.string().uuid().optional(),
    companyId: Joi.string().uuid().optional(),
    leadId: Joi.string().uuid().optional(),
    opportunityId: Joi.string().uuid().optional()
  }).or('contactId', 'companyId', 'leadId', 'opportunityId')),
  async (req, res) => {
    try {
      const activities = await activityService.getActivityTimeline(req.query);

      res.json({
        success: true,
        activities
      });
    } catch (error) {
      logger.error('Failed to get activity timeline', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get activity timeline'
      });
    }
  }
);

// Get activity by ID
router.get('/:id',
  
  requirePermission('read'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const activity = await activityService.getActivityById(req.params.id);

      res.json({
        success: true,
        activity
      });
    } catch (error) {
      logger.error('Failed to get activity', { error: error.message, activityId: req.params.id });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Create activity
router.post('/',
  
  requirePermission('write'),
  validateBody(activityCreateSchema),
  async (req, res) => {
    try {
      const activity = await activityService.createActivity({
        ...req.body,
        createdById: req.user.id
      });

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('activity:created', { activity });
      if (req.body.assignedToId && req.body.assignedToId !== req.user.id) {
        io.to(`user:${req.body.assignedToId}`).emit('activity:assigned', { activity });
      }

      logger.info('Activity created', {
        activityId: activity.id,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        activity
      });
    } catch (error) {
      logger.error('Failed to create activity', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to create activity'
      });
    }
  }
);

// Log a call
router.post('/log-call',
  
  requirePermission('write'),
  validateBody(callLogSchema),
  async (req, res) => {
    try {
      const activity = await activityService.logCall({
        ...req.body,
        createdById: req.user.id
      });

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('activity:created', { activity });

      logger.info('Call logged', {
        activityId: activity.id,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        activity
      });
    } catch (error) {
      logger.error('Failed to log call', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to log call'
      });
    }
  }
);

// Log an email
router.post('/log-email',
  
  requirePermission('write'),
  validateBody(emailLogSchema),
  async (req, res) => {
    try {
      const activity = await activityService.logEmail({
        ...req.body,
        createdById: req.user.id
      });

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('activity:created', { activity });

      logger.info('Email logged', {
        activityId: activity.id,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        activity
      });
    } catch (error) {
      logger.error('Failed to log email', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to log email'
      });
    }
  }
);

// Schedule a meeting
router.post('/schedule-meeting',
  
  requirePermission('write'),
  validateBody(meetingScheduleSchema),
  async (req, res) => {
    try {
      const activity = await activityService.scheduleMeeting({
        ...req.body,
        createdById: req.user.id
      });

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('activity:created', { activity });
      if (req.body.assignedToId && req.body.assignedToId !== req.user.id) {
        io.to(`user:${req.body.assignedToId}`).emit('meeting:scheduled', { activity });
      }

      logger.info('Meeting scheduled', {
        activityId: activity.id,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        activity
      });
    } catch (error) {
      logger.error('Failed to schedule meeting', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to schedule meeting'
      });
    }
  }
);

// Bulk create activities
router.post('/bulk-create',
  
  requirePermission('write'),
  validateBody(bulkCreateSchema),
  async (req, res) => {
    try {
      // Add createdById to all activities
      const activitiesWithCreator = req.body.activities.map(activity => ({
        ...activity,
        createdById: req.user.id
      }));

      const results = await activityService.bulkCreateActivities(activitiesWithCreator);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('activities:bulk-created', { results });

      logger.info('Activities bulk created', {
        userId: req.user.id,
        total: req.body.activities.length,
        created: results.created
      });

      res.status(201).json({
        success: true,
        results
      });
    } catch (error) {
      logger.error('Failed to bulk create activities', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to bulk create activities'
      });
    }
  }
);

// Complete activity
router.post('/:id/complete',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(completeActivitySchema),
  async (req, res) => {
    try {
      const activity = await activityService.completeActivity(
        req.params.id,
        req.body.outcome,
        req.body.nextSteps
      );

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('activity:completed', { activity });

      logger.info('Activity completed', {
        activityId: req.params.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        activity
      });
    } catch (error) {
      logger.error('Failed to complete activity', { error: error.message, activityId: req.params.id });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Update activity
router.put('/:id',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(activityUpdateSchema),
  async (req, res) => {
    try {
      const activity = await activityService.updateActivity(req.params.id, req.body);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('activity:updated', { activity });

      logger.info('Activity updated', {
        activityId: req.params.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        activity
      });
    } catch (error) {
      logger.error('Failed to update activity', { error: error.message, activityId: req.params.id });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Delete activity
router.delete('/:id',
  
  requirePermission('delete'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      await activityService.deleteActivity(req.params.id);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('activity:deleted', { activityId: req.params.id });

      logger.info('Activity deleted', {
        activityId: req.params.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        message: 'Activity deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete activity', { error: error.message, activityId: req.params.id });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

module.exports = router;
