/**
 * Report Routes - API endpoints for report management and execution
 */

const express = require('express');
const router = express.Router();
const ReportService = require('../services/ReportService');
const { ReportSchedule } = require('../models');

/**
 * GET /api/reports - List reports for application
 */
router.get('/', async (req, res) => {
  try {
    const { applicationId, status, reportType, category, page, limit, sortBy, sortOrder } = req.query;

    if (!applicationId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETER',
        message: 'applicationId is required'
      });
    }

    const result = await ReportService.getReports(applicationId, {
      status,
      reportType,
      category,
      page,
      limit,
      sortBy,
      sortOrder
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[Reports API] Failed to list reports:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/reports/:id - Get report by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await ReportService.getReportById(req.params.id);

    if (!result.success) {
      return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[Reports API] Failed to get report:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * POST /api/reports - Create new report
 */
router.post('/', async (req, res) => {
  try {
    const {
      displayName,
      description,
      applicationId,
      reportType,
      status,
      dataSourceId,
      queryConfig,
      rawSql,
      parameters,
      visualizationConfig,
      cacheEnabled,
      cacheTTL,
      executionTimeout,
      category,
      tags
    } = req.body;

    if (!displayName || !applicationId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'displayName and applicationId are required'
      });
    }

    const result = await ReportService.createReport({
      displayName,
      description,
      applicationId,
      reportType,
      status,
      dataSourceId,
      queryConfig,
      rawSql,
      parameters,
      visualizationConfig,
      cacheEnabled,
      cacheTTL,
      executionTimeout,
      category,
      tags
    }, req.user?.id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(201).json(result);
  } catch (error) {
    console.error('[Reports API] Failed to create report:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * PUT /api/reports/:id - Update report
 */
router.put('/:id', async (req, res) => {
  try {
    const {
      displayName,
      description,
      status,
      reportType,
      dataSourceId,
      queryConfig,
      rawSql,
      parameters,
      visualizationConfig,
      cacheEnabled,
      cacheTTL,
      executionTimeout,
      category,
      tags
    } = req.body;

    const result = await ReportService.updateReport(req.params.id, {
      displayName,
      description,
      status,
      reportType,
      dataSourceId,
      queryConfig,
      rawSql,
      parameters,
      visualizationConfig,
      cacheEnabled,
      cacheTTL,
      executionTimeout,
      category,
      tags
    }, req.user?.id);

    if (!result.success) {
      return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[Reports API] Failed to update report:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * DELETE /api/reports/:id - Delete report
 */
router.delete('/:id', async (req, res) => {
  try {
    const result = await ReportService.deleteReport(req.params.id);

    if (!result.success) {
      return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[Reports API] Failed to delete report:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * POST /api/reports/:id/execute - Execute report
 */
router.post('/:id/execute', async (req, res) => {
  try {
    const { parameterValues = {} } = req.body;

    const result = await ReportService.executeReport(
      req.params.id,
      parameterValues,
      req.user?.id
    );

    if (!result.success) {
      return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[Reports API] Failed to execute report:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/reports/:id/executions - Get report execution history
 */
router.get('/:id/executions', async (req, res) => {
  try {
    const { page, limit } = req.query;

    const result = await ReportService.getExecutionHistory(req.params.id, {
      page,
      limit
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[Reports API] Failed to get execution history:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * POST /api/reports/:id/duplicate - Duplicate report
 */
router.post('/:id/duplicate', async (req, res) => {
  try {
    const result = await ReportService.duplicateReport(req.params.id, req.user?.id);

    if (!result.success) {
      return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json(result);
    }

    res.status(201).json(result);
  } catch (error) {
    console.error('[Reports API] Failed to duplicate report:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * POST /api/reports/:id/export - Export report to CSV, Excel, or PDF
 */
router.post('/:id/export', async (req, res) => {
  try {
    const { format = 'csv', parameterValues = {} } = req.body;
    const ExportService = require('../services/ExportService');

    // Execute report first
    const executionResult = await ReportService.executeReport(
      req.params.id,
      parameterValues,
      req.user?.id
    );

    if (!executionResult.success) {
      return res.status(executionResult.error === 'NOT_FOUND' ? 404 : 400).json(executionResult);
    }

    // Get report details for naming
    const reportResult = await ReportService.getReportById(req.params.id);
    const reportName = reportResult.success
      ? reportResult.data.displayName.replace(/[^a-z0-9]/gi, '_')
      : 'report';

    // Export data
    const exportResult = await ExportService.exportReport(
      executionResult.data,
      format,
      reportName,
      {
        title: reportResult.data?.displayName,
        description: reportResult.data?.description
      }
    );

    if (!exportResult.success) {
      return res.status(400).json(exportResult);
    }

    // Set response headers for file download
    res.setHeader('Content-Type', exportResult.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);

    if (exportResult.encoding) {
      res.setHeader('Content-Encoding', exportResult.encoding);
    }

    // Send file
    res.send(exportResult.data);
  } catch (error) {
    console.error('[Reports API] Failed to export report:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/reports/:id/schedules - Get all schedules for a report
 */
router.get('/:id/schedules', async (req, res) => {
  try {
    const schedules = await ReportSchedule.findAll({
      where: { reportId: req.params.id }
    });

    res.json({
      success: true,
      data: schedules
    });
  } catch (error) {
    console.error('[Reports API] Failed to get schedules:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * POST /api/reports/:id/schedules - Create a schedule for a report
 */
router.post('/:id/schedules', async (req, res) => {
  try {
    const {
      cronExpression,
      timezone,
      deliveryMethod,
      deliveryConfig,
      exportFormat,
      parameterValues,
      enabled
    } = req.body;

    const reportResult = await ReportService.getReportById(req.params.id);
    if (!reportResult.success) {
      return res.status(404).json(reportResult);
    }

    const schedule = await ReportSchedule.create({
      reportId: req.params.id,
      applicationId: reportResult.data.applicationId,
      cronExpression,
      timezone: timezone || 'UTC',
      deliveryMethod: deliveryMethod || 'dashboard',
      deliveryConfig: deliveryConfig || {},
      exportFormat: exportFormat || 'csv',
      parameterValues: parameterValues || {},
      enabled: enabled !== undefined ? enabled : true
    });

    // Reload scheduler if enabled
    if (schedule.enabled) {
      const schedulerService = require('../services/SchedulerService');
      await schedulerService.reloadSchedule(schedule.id);
    }

    res.status(201).json({
      success: true,
      data: schedule
    });
  } catch (error) {
    console.error('[Reports API] Failed to create schedule:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * PUT /api/reports/:id/schedules/:scheduleId - Update a schedule
 */
router.put('/:id/schedules/:scheduleId', async (req, res) => {
  try {
    const schedule = await ReportSchedule.findOne({
      where: {
        id: req.params.scheduleId,
        reportId: req.params.id
      }
    });

    if (!schedule) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Schedule not found'
      });
    }

    const {
      cronExpression,
      timezone,
      deliveryMethod,
      deliveryConfig,
      exportFormat,
      parameterValues,
      enabled
    } = req.body;

    await schedule.update({
      cronExpression: cronExpression || schedule.cronExpression,
      timezone: timezone || schedule.timezone,
      deliveryMethod: deliveryMethod || schedule.deliveryMethod,
      deliveryConfig: deliveryConfig || schedule.deliveryConfig,
      exportFormat: exportFormat || schedule.exportFormat,
      parameterValues: parameterValues || schedule.parameterValues,
      enabled: enabled !== undefined ? enabled : schedule.enabled
    });

    // Reload scheduler
    const schedulerService = require('../services/SchedulerService');
    await schedulerService.reloadSchedule(schedule.id);

    res.json({
      success: true,
      data: schedule
    });
  } catch (error) {
    console.error('[Reports API] Failed to update schedule:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * DELETE /api/reports/:id/schedules/:scheduleId - Delete a schedule
 */
router.delete('/:id/schedules/:scheduleId', async (req, res) => {
  try {
    const schedule = await ReportSchedule.findOne({
      where: {
        id: req.params.scheduleId,
        reportId: req.params.id
      }
    });

    if (!schedule) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Schedule not found'
      });
    }

    // Unschedule first
    const schedulerService = require('../services/SchedulerService');
    await schedulerService.unscheduleReport(schedule.id);

    await schedule.destroy();

    res.json({
      success: true,
      message: 'Schedule deleted successfully'
    });
  } catch (error) {
    console.error('[Reports API] Failed to delete schedule:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

module.exports = router;
