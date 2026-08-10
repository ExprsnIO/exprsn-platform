/**
 * Reports Routes
 * Unified reporting API for all Forge modules
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { requirePermission } = require('../../../middleware/auth');
const reportService = require('../../../services/forge/shared/reportService');
const reportExportService = require('../../../services/forge/shared/reportExportService');
const reportSchedulingService = require('../../../services/forge/shared/reportSchedulingService');
const logger = require('../../../utils/logger');

// ===== Validation Schemas =====

const createReportSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(1000).allow(null, ''),
  reportType: Joi.string().valid(
    'crm_contacts', 'crm_leads', 'crm_opportunities', 'crm_activities',
    'crm_campaigns', 'crm_tickets', 'erp_financial', 'erp_inventory',
    'erp_sales', 'erp_hr', 'erp_assets', 'groupware_tasks',
    'groupware_time_tracking', 'groupware_projects', 'custom'
  ).required(),
  category: Joi.string().max(100).default('custom'),
  visibility: Joi.string().valid('private', 'team', 'organization', 'public').default('private'),
  config: Joi.object().required(),
  visualization: Joi.object().optional(),
  customQuery: Joi.string().when('reportType', {
    is: 'custom',
    then: Joi.required(),
    otherwise: Joi.forbidden()
  }),
  cacheDurationMinutes: Joi.number().min(0).max(1440).default(15),
  tags: Joi.array().items(Joi.string()).default([]),
  isTemplate: Joi.boolean().default(false)
});

const updateReportSchema = Joi.object({
  name: Joi.string().min(1).max(255),
  description: Joi.string().max(1000).allow(null, ''),
  visibility: Joi.string().valid('private', 'team', 'organization', 'public'),
  config: Joi.object(),
  visualization: Joi.object(),
  cacheDurationMinutes: Joi.number().min(0).max(1440),
  status: Joi.string().valid('draft', 'active', 'archived'),
  tags: Joi.array().items(Joi.string()),
  isFavorite: Joi.boolean()
});

const executeReportSchema = Joi.object({
  parameters: Joi.object().default({}),
  skipCache: Joi.boolean().default(false),
  exportFormat: Joi.string().valid('pdf', 'excel', 'csv', 'json').optional()
});

const createScheduleSchema = Joi.object({
  reportId: Joi.string().uuid().required(),
  name: Joi.string().min(1).max(255).required(),
  frequency: Joi.string().valid('once', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom').required(),
  cronExpression: Joi.string().when('frequency', {
    is: 'custom',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  runAt: Joi.string().pattern(/^\d{2}:\d{2}:\d{2}$/).default('09:00:00'),
  dayOfWeek: Joi.number().min(0).max(6).when('frequency', {
    is: 'weekly',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  dayOfMonth: Joi.number().min(1).max(31).when('frequency', {
    is: Joi.alternatives().try('monthly', 'quarterly', 'yearly'),
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  timezone: Joi.string().default('UTC'),
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional(),
  exportFormat: Joi.string().valid('pdf', 'excel', 'csv', 'json').default('pdf'),
  deliveryMethod: Joi.string().valid('email', 'download', 'storage', 'webhook').default('email'),
  recipients: Joi.array().items(Joi.string().email()).when('deliveryMethod', {
    is: 'email',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  storagePath: Joi.string().max(500).when('deliveryMethod', {
    is: 'storage',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  webhookUrl: Joi.string().uri().when('deliveryMethod', {
    is: 'webhook',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  parameters: Joi.object().default({})
});

// ===== Report Management Routes =====

/**
 * GET /api/reports
 * List all reports accessible by the user
 */
router.get('/',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const options = {
        reportType: req.query.reportType,
        category: req.query.category,
        status: req.query.status || 'active',
        visibility: req.query.visibility,
        search: req.query.search,
        favorites: req.query.favorites === 'true',
        templates: req.query.templates === 'true',
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20
      };

      const result = await reportService.listReports(userId, options);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      logger.error('Failed to list reports', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/reports
 * Create a new report
 */
router.post('/',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = createReportSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const report = await reportService.createReport(req.user.id, value);

      res.status(201).json({
        success: true,
        report
      });
    } catch (error) {
      logger.error('Failed to create report', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/reports/:id
 * Get report details
 */
router.get('/:id',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const report = await reportService.getReport(req.params.id, req.user.id);

      res.json({
        success: true,
        report
      });
    } catch (error) {
      const status = error.message === 'Report not found' ? 404 :
                      error.message === 'Access denied' ? 403 : 500;

      res.status(status).json({
        success: false,
        error: error.message.toUpperCase().replace(/ /g, '_'),
        message: error.message
      });
    }
  }
);

/**
 * PUT /api/reports/:id
 * Update a report
 */
router.put('/:id',
  
  requirePermission('update'),
  async (req, res) => {
    try {
      const { error, value } = updateReportSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const report = await reportService.updateReport(
        req.params.id,
        req.user.id,
        value
      );

      res.json({
        success: true,
        report
      });
    } catch (error) {
      const status = error.message.includes('not found') ? 404 :
                      error.message.includes('Only') ? 403 : 500;

      res.status(status).json({
        success: false,
        error: error.message.toUpperCase().replace(/ /g, '_'),
        message: error.message
      });
    }
  }
);

/**
 * DELETE /api/reports/:id
 * Delete (archive) a report
 */
router.delete('/:id',
  
  requirePermission('delete'),
  async (req, res) => {
    try {
      await reportService.deleteReport(req.params.id, req.user.id);

      res.json({
        success: true,
        message: 'Report archived successfully'
      });
    } catch (error) {
      const status = error.message.includes('not found') ? 404 :
                      error.message.includes('Only') ? 403 : 500;

      res.status(status).json({
        success: false,
        error: error.message.toUpperCase().replace(/ /g, '_'),
        message: error.message
      });
    }
  }
);

// ===== Report Execution Routes =====

/**
 * POST /api/reports/:id/execute
 * Execute a report
 */
router.post('/:id/execute',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { error, value } = executeReportSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const result = await reportService.executeReport(
        req.params.id,
        req.user.id,
        value.parameters,
        { skipCache: value.skipCache }
      );

      // If export requested, export and return file info
      if (value.exportFormat) {
        const report = await reportService.getReport(req.params.id, req.user.id);
        const exportResult = await reportExportService.exportReport(
          report,
          result.result,
          value.exportFormat
        );

        res.json({
          success: true,
          executionId: result.executionId,
          duration: result.duration,
          fromCache: result.fromCache,
          export: exportResult
        });
      } else {
        res.json({
          success: true,
          executionId: result.executionId,
          result: result.result,
          duration: result.duration,
          fromCache: result.fromCache
        });
      }
    } catch (error) {
      logger.error('Report execution failed', {
        reportId: req.params.id,
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: 'EXECUTION_FAILED',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/reports/:id/executions
 * Get execution history for a report
 */
router.get('/:id/executions',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const options = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 50
      };

      const result = await reportService.getExecutionHistory(
        req.params.id,
        req.user.id,
        options
      );

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/reports/executions/:executionId
 * Get specific execution details
 */
router.get('/executions/:executionId',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const execution = await reportService.getExecution(
        req.params.executionId,
        req.user.id
      );

      res.json({
        success: true,
        execution
      });
    } catch (error) {
      const status = error.message.includes('not found') ? 404 :
                      error.message.includes('denied') ? 403 : 500;

      res.status(status).json({
        success: false,
        error: error.message.toUpperCase().replace(/ /g, '_'),
        message: error.message
      });
    }
  }
);

// ===== Report Sharing Routes =====

/**
 * POST /api/reports/:id/share
 * Share report with users
 */
router.post('/:id/share',
  
  requirePermission('update'),
  async (req, res) => {
    try {
      const { userIds } = req.body;

      if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'userIds must be a non-empty array'
        });
      }

      const report = await reportService.shareReport(
        req.params.id,
        req.user.id,
        userIds
      );

      res.json({
        success: true,
        report,
        message: `Report shared with ${userIds.length} users`
      });
    } catch (error) {
      res.status(error.message.includes('Only') ? 403 : 500).json({
        success: false,
        error: error.message.toUpperCase().replace(/ /g, '_'),
        message: error.message
      });
    }
  }
);

// ===== Cache Management Routes =====

/**
 * DELETE /api/reports/:id/cache
 * Clear report cache
 */
router.delete('/:id/cache',
  
  requirePermission('update'),
  async (req, res) => {
    try {
      const result = await reportService.clearCache(req.params.id, req.user.id);

      res.json({
        success: true,
        ...result,
        message: 'Cache cleared successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: error.message
      });
    }
  }
);

// ===== Scheduling Routes =====

/**
 * GET /api/reports/:id/schedules
 * Get schedules for a report
 */
router.get('/:id/schedules',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const schedules = await reportSchedulingService.getReportSchedules(
        req.params.id,
        req.user.id
      );

      res.json({
        success: true,
        schedules
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/reports/schedules
 * Create a report schedule
 */
router.post('/schedules',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = createScheduleSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const schedule = await reportSchedulingService.createSchedule(
        req.user.id,
        value
      );

      res.status(201).json({
        success: true,
        schedule
      });
    } catch (error) {
      res.status(error.message.includes('Only') ? 403 : 500).json({
        success: false,
        error: error.message.toUpperCase().replace(/ /g, '_'),
        message: error.message
      });
    }
  }
);

/**
 * PUT /api/reports/schedules/:scheduleId
 * Update a schedule
 */
router.put('/schedules/:scheduleId',
  
  requirePermission('update'),
  async (req, res) => {
    try {
      const schedule = await reportSchedulingService.updateSchedule(
        req.params.scheduleId,
        req.user.id,
        req.body
      );

      res.json({
        success: true,
        schedule
      });
    } catch (error) {
      const status = error.message.includes('not found') ? 404 :
                      error.message.includes('Only') ? 403 : 500;

      res.status(status).json({
        success: false,
        error: error.message.toUpperCase().replace(/ /g, '_'),
        message: error.message
      });
    }
  }
);

/**
 * POST /api/reports/schedules/:scheduleId/toggle
 * Pause/resume a schedule
 */
router.post('/schedules/:scheduleId/toggle',
  
  requirePermission('update'),
  async (req, res) => {
    try {
      const { isActive } = req.body;

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'isActive must be a boolean'
        });
      }

      const schedule = await reportSchedulingService.toggleSchedule(
        req.params.scheduleId,
        req.user.id,
        isActive
      );

      res.json({
        success: true,
        schedule,
        message: `Schedule ${isActive ? 'activated' : 'paused'}`
      });
    } catch (error) {
      res.status(error.message === 'Unauthorized' ? 403 : 500).json({
        success: false,
        error: error.message.toUpperCase().replace(/ /g, '_'),
        message: error.message
      });
    }
  }
);

/**
 * DELETE /api/reports/schedules/:scheduleId
 * Delete a schedule
 */
router.delete('/schedules/:scheduleId',
  
  requirePermission('delete'),
  async (req, res) => {
    try {
      await reportSchedulingService.deleteSchedule(
        req.params.scheduleId,
        req.user.id
      );

      res.json({
        success: true,
        message: 'Schedule deleted successfully'
      });
    } catch (error) {
      const status = error.message.includes('not found') ? 404 :
                      error.message.includes('Only') ? 403 : 500;

      res.status(status).json({
        success: false,
        error: error.message.toUpperCase().replace(/ /g, '_'),
        message: error.message
      });
    }
  }
);

// ===== Export Download Routes =====

/**
 * GET /api/reports/exports/:filename
 * Download an exported report file
 */
router.get('/exports/:filename',
  
  async (req, res) => {
    try {
      const filePath = await reportExportService.getExportFile(req.params.filename);

      res.download(filePath, req.params.filename);
    } catch (error) {
      res.status(404).json({
        success: false,
        error: 'FILE_NOT_FOUND',
        message: error.message
      });
    }
  }
);

module.exports = router;
