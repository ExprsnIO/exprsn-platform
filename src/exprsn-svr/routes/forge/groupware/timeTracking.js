const express = require('express');
const router = express.Router();
const { requirePermission } = require('../../../middleware/auth');
const { validateBody, validateQuery, validateParams, schemas } = require('../../../middleware/validation');
const Joi = require('joi');
const timeTrackingService = require('../../../services/forge/groupware/timeTrackingService');
const logger = require('../../../utils/logger');

// Validation schemas
const startTimerSchema = Joi.object({
  taskId: Joi.string().uuid().optional(),
  projectId: Joi.string().uuid().optional(),
  activityType: Joi.string().max(100).optional(),
  description: Joi.string().optional(),
  isBillable: Joi.boolean().optional(),
  hourlyRate: Joi.number().positive().optional()
});

const manualEntrySchema = Joi.object({
  taskId: Joi.string().uuid().optional(),
  projectId: Joi.string().uuid().optional(),
  activityType: Joi.string().max(100).optional(),
  description: Joi.string().optional(),
  startTime: Joi.date().iso().required(),
  endTime: Joi.date().iso().required(),
  duration: Joi.number().integer().positive().optional(),
  isBillable: Joi.boolean().optional(),
  hourlyRate: Joi.number().positive().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  location: Joi.string().max(255).optional()
});

const updateEntrySchema = Joi.object({
  taskId: Joi.string().uuid().optional(),
  projectId: Joi.string().uuid().optional(),
  activityType: Joi.string().max(100).optional(),
  description: Joi.string().optional(),
  startTime: Joi.date().iso().optional(),
  endTime: Joi.date().iso().optional(),
  isBillable: Joi.boolean().optional(),
  hourlyRate: Joi.number().positive().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  location: Joi.string().max(255).optional(),
  notes: Joi.string().optional()
});

const addBreakSchema = Joi.object({
  breakDurationSeconds: Joi.number().integer().positive().required()
});

const submitEntriesSchema = Joi.object({
  timeEntryIds: Joi.array().items(Joi.string().uuid()).min(1).required()
});

const approveEntriesSchema = Joi.object({
  timeEntryIds: Joi.array().items(Joi.string().uuid()).min(1).required()
});

const rejectEntriesSchema = Joi.object({
  timeEntryIds: Joi.array().items(Joi.string().uuid()).min(1).required(),
  reason: Joi.string().required()
});

// ===== Timer Routes =====

// Start timer
router.post('/timer/start',
  
  requirePermission('write'),
  validateBody(startTimerSchema),
  async (req, res) => {
    try {
      const timeEntry = await timeTrackingService.startTimer({
        userId: req.user.id,
        ...req.body
      });

      res.status(201).json({
        success: true,
        timeEntry
      });
    } catch (error) {
      logger.error('Failed to start timer', { error: error.message, userId: req.user.id });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Stop timer
router.post('/timer/stop',
  
  requirePermission('write'),
  validateBody(Joi.object({
    timeEntryId: Joi.string().uuid().optional()
  })),
  async (req, res) => {
    try {
      const timeEntry = await timeTrackingService.stopTimer(
        req.user.id,
        req.body.timeEntryId
      );

      res.json({
        success: true,
        timeEntry
      });
    } catch (error) {
      logger.error('Failed to stop timer', { error: error.message, userId: req.user.id });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Get running timer
router.get('/timer/current',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const timeEntry = await timeTrackingService.getRunningTimer(req.user.id);

      res.json({
        success: true,
        timeEntry
      });
    } catch (error) {
      logger.error('Failed to get running timer', { error: error.message, userId: req.user.id });
      res.status(500).json({
        success: false,
        error: 'Failed to get running timer'
      });
    }
  }
);

// Add break to timer
router.post('/timer/:id/break',
  
  requirePermission('write'),
  validateParams(schemas.id),
  validateBody(addBreakSchema),
  async (req, res) => {
    try {
      const timeEntry = await timeTrackingService.addBreak(
        req.params.id,
        req.body.breakDurationSeconds
      );

      res.json({
        success: true,
        timeEntry
      });
    } catch (error) {
      logger.error('Failed to add break', { error: error.message, timeEntryId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to add break'
      });
    }
  }
);

// ===== Time Entry Routes =====

// List time entries
router.get('/entries',
  
  requirePermission('read'),
  validateQuery(schemas.pagination.keys({
    taskId: Joi.string().uuid().optional(),
    projectId: Joi.string().uuid().optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    status: Joi.string().valid('draft', 'submitted', 'approved', 'rejected', 'invoiced').optional(),
    isBillable: Joi.boolean().optional(),
    isInvoiced: Joi.boolean().optional(),
    activityType: Joi.string().optional()
  })),
  async (req, res) => {
    try {
      const {
        page,
        limit,
        taskId,
        projectId,
        startDate,
        endDate,
        status,
        isBillable,
        isInvoiced,
        activityType
      } = req.query;
      const offset = (page - 1) * limit;

      const result = await timeTrackingService.listTimeEntries({
        userId: req.user.id,
        taskId,
        projectId,
        startDate,
        endDate,
        status,
        isBillable,
        isInvoiced,
        activityType,
        limit,
        offset
      });

      res.json({
        success: true,
        timeEntries: result.timeEntries,
        pagination: {
          total: result.total,
          page,
          limit,
          pages: Math.ceil(result.total / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to list time entries', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to list time entries'
      });
    }
  }
);

// Create manual time entry
router.post('/entries',
  
  requirePermission('write'),
  validateBody(manualEntrySchema),
  async (req, res) => {
    try {
      const timeEntry = await timeTrackingService.createManualEntry({
        userId: req.user.id,
        ...req.body
      });

      res.status(201).json({
        success: true,
        timeEntry
      });
    } catch (error) {
      logger.error('Failed to create time entry', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Get time entry by ID
router.get('/entries/:id',
  
  requirePermission('read'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const result = await timeTrackingService.listTimeEntries({
        userId: req.user.id,
        limit: 1,
        offset: 0
      });

      const timeEntry = result.timeEntries.find(e => e.id === req.params.id);

      if (!timeEntry) {
        return res.status(404).json({
          success: false,
          error: 'Time entry not found'
        });
      }

      res.json({
        success: true,
        timeEntry
      });
    } catch (error) {
      logger.error('Failed to get time entry', { error: error.message, entryId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to get time entry'
      });
    }
  }
);

// Update time entry
router.put('/entries/:id',
  
  requirePermission('write'),
  validateParams(schemas.id),
  validateBody(updateEntrySchema),
  async (req, res) => {
    try {
      const timeEntry = await timeTrackingService.updateTimeEntry(
        req.params.id,
        req.user.id,
        req.body
      );

      res.json({
        success: true,
        timeEntry
      });
    } catch (error) {
      logger.error('Failed to update time entry', { error: error.message, entryId: req.params.id });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Delete time entry
router.delete('/entries/:id',
  
  requirePermission('delete'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const result = await timeTrackingService.deleteTimeEntry(
        req.params.id,
        req.user.id
      );

      res.json(result);
    } catch (error) {
      logger.error('Failed to delete time entry', { error: error.message, entryId: req.params.id });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// ===== Reporting Routes =====

// Get time summary
router.get('/summary',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    taskId: Joi.string().uuid().optional(),
    projectId: Joi.string().uuid().optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    groupBy: Joi.string().valid('day', 'week', 'month', 'task', 'project', 'activityType').optional()
  })),
  async (req, res) => {
    try {
      const summary = await timeTrackingService.getTimeSummary({
        userId: req.user.id,
        ...req.query
      });

      res.json({
        success: true,
        summary
      });
    } catch (error) {
      logger.error('Failed to get time summary', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get time summary'
      });
    }
  }
);

// ===== Approval Routes =====

// Submit time entries for approval
router.post('/entries/submit',
  
  requirePermission('write'),
  validateBody(submitEntriesSchema),
  async (req, res) => {
    try {
      const result = await timeTrackingService.submitTimeEntries(
        req.user.id,
        req.body.timeEntryIds
      );

      res.json(result);
    } catch (error) {
      logger.error('Failed to submit time entries', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Approve time entries
router.post('/entries/approve',
  
  requirePermission('write'),
  validateBody(approveEntriesSchema),
  async (req, res) => {
    try {
      const result = await timeTrackingService.approveTimeEntries(
        req.user.id,
        req.body.timeEntryIds
      );

      res.json(result);
    } catch (error) {
      logger.error('Failed to approve time entries', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Reject time entries
router.post('/entries/reject',
  
  requirePermission('write'),
  validateBody(rejectEntriesSchema),
  async (req, res) => {
    try {
      const result = await timeTrackingService.rejectTimeEntries(
        req.user.id,
        req.body.timeEntryIds,
        req.body.reason
      );

      res.json(result);
    } catch (error) {
      logger.error('Failed to reject time entries', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

module.exports = router;
