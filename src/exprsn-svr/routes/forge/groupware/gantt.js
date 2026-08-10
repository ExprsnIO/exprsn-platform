const express = require('express');
const router = express.Router();
const { requirePermission } = require('../../../middleware/auth');
const { validateBody, validateQuery, validateParams, schemas } = require('../../../middleware/validation');
const Joi = require('joi');
const ganttService = require('../../../services/forge/groupware/ganttService');
const logger = require('../../../utils/logger');

// Validation schemas
const ganttDataSchema = Joi.object({
  projectId: Joi.string().uuid().optional(),
  parentTaskId: Joi.string().uuid().optional(),
  taskIds: Joi.array().items(Joi.string().uuid()).optional(),
  includeCompleted: Joi.boolean().optional(),
  calculateCriticalPath: Joi.boolean().optional()
});

const resourceAllocationSchema = Joi.object({
  projectId: Joi.string().uuid().optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  userIds: Joi.array().items(Joi.string().uuid()).optional()
});

// ===== Gantt Chart Routes =====

// Generate Gantt chart data
router.post('/data',
  
  requirePermission('read'),
  validateBody(ganttDataSchema),
  async (req, res) => {
    try {
      const ganttData = await ganttService.generateGanttData(req.body);

      res.json({
        success: true,
        ...ganttData
      });
    } catch (error) {
      logger.error('Failed to generate Gantt data', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to generate Gantt chart data'
      });
    }
  }
);

// Get Gantt data for a project
router.get('/project/:projectId',
  
  requirePermission('read'),
  validateParams(Joi.object({ projectId: Joi.string().uuid().required() })),
  validateQuery(Joi.object({
    includeCompleted: Joi.boolean().optional(),
    calculateCriticalPath: Joi.boolean().optional()
  })),
  async (req, res) => {
    try {
      const ganttData = await ganttService.generateGanttData({
        projectId: req.params.projectId,
        includeCompleted: req.query.includeCompleted === 'true',
        calculateCriticalPath: req.query.calculateCriticalPath !== 'false'
      });

      res.json({
        success: true,
        ...ganttData
      });
    } catch (error) {
      logger.error('Failed to get project Gantt data', { error: error.message, projectId: req.params.projectId });
      res.status(500).json({
        success: false,
        error: 'Failed to get Gantt chart data'
      });
    }
  }
);

// Get critical path for a project
router.get('/project/:projectId/critical-path',
  
  requirePermission('read'),
  validateParams(Joi.object({ projectId: Joi.string().uuid().required() })),
  async (req, res) => {
    try {
      const ganttData = await ganttService.generateGanttData({
        projectId: req.params.projectId,
        includeCompleted: false,
        calculateCriticalPath: true
      });

      res.json({
        success: true,
        criticalPath: ganttData.criticalPath,
        statistics: ganttData.statistics
      });
    } catch (error) {
      logger.error('Failed to get critical path', { error: error.message, projectId: req.params.projectId });
      res.status(500).json({
        success: false,
        error: 'Failed to calculate critical path'
      });
    }
  }
);

// Get project statistics
router.get('/project/:projectId/statistics',
  
  requirePermission('read'),
  validateParams(Joi.object({ projectId: Joi.string().uuid().required() })),
  async (req, res) => {
    try {
      const ganttData = await ganttService.generateGanttData({
        projectId: req.params.projectId,
        includeCompleted: true,
        calculateCriticalPath: false
      });

      res.json({
        success: true,
        statistics: ganttData.statistics
      });
    } catch (error) {
      logger.error('Failed to get project statistics', { error: error.message, projectId: req.params.projectId });
      res.status(500).json({
        success: false,
        error: 'Failed to get project statistics'
      });
    }
  }
);

// Get resource allocation
router.post('/resource-allocation',
  
  requirePermission('read'),
  validateBody(resourceAllocationSchema),
  async (req, res) => {
    try {
      const allocation = await ganttService.getResourceAllocation(req.body);

      res.json({
        success: true,
        allocation
      });
    } catch (error) {
      logger.error('Failed to get resource allocation', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get resource allocation'
      });
    }
  }
);

// Get schedule suggestions
router.get('/project/:projectId/suggest-schedule',
  
  requirePermission('read'),
  validateParams(Joi.object({ projectId: Joi.string().uuid().required() })),
  async (req, res) => {
    try {
      const suggestions = await ganttService.suggestSchedule(req.params.projectId);

      res.json({
        success: true,
        suggestions
      });
    } catch (error) {
      logger.error('Failed to get schedule suggestions', { error: error.message, projectId: req.params.projectId });
      res.status(500).json({
        success: false,
        error: 'Failed to generate schedule suggestions'
      });
    }
  }
);

module.exports = router;
