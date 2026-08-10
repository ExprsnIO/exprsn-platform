const express = require('express');
const router = express.Router();
const schedulerService = require('../services/schedulerService');
const schedulePresetsService = require('../services/schedulePresets');
const { validateToken, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const Joi = require('joi');

/**
 * Validation schema for schedule configuration
 */
const scheduleSchema = Joi.object({
  schedule: Joi.string().required().description('Cron expression (e.g., "0 0 * * *")'),
  timezone: Joi.string().default('UTC').description('Timezone for schedule (e.g., "America/New_York")'),
  enabled: Joi.boolean().default(true).description('Whether schedule is enabled'),
  inputData: Joi.object().default({}).description('Default input data for scheduled executions')
});

const updateScheduleSchema = Joi.object({
  schedule: Joi.string().optional().description('Cron expression'),
  timezone: Joi.string().optional().description('Timezone for schedule'),
  enabled: Joi.boolean().optional().description('Whether schedule is enabled'),
  inputData: Joi.object().optional().description('Default input data for scheduled executions')
}).min(1);

/**
 * @route   POST /api/scheduler/workflows/:workflowId/schedule
 * @desc    Configure workflow schedule
 * @access  Private
 */
router.post('/workflows/:workflowId/schedule', validateToken, async (req, res) => {
  try {
    const { error, value } = scheduleSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const result = await schedulerService.updateSchedule(req.params.workflowId, value);

    logger.info('Workflow schedule configured', {
      workflowId: req.params.workflowId,
      schedule: value.schedule,
      userId: req.user.id
    });

    res.json({
      success: true,
      data: result,
      message: 'Workflow schedule configured successfully'
    });
  } catch (error) {
    logger.error('Failed to configure workflow schedule', {
      error: error.message,
      workflowId: req.params.workflowId,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/scheduler/workflows/:workflowId/schedule
 * @desc    Update workflow schedule
 * @access  Private
 */
router.put('/workflows/:workflowId/schedule', validateToken, async (req, res) => {
  try {
    const { error, value } = updateScheduleSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const result = await schedulerService.updateSchedule(req.params.workflowId, value);

    logger.info('Workflow schedule updated', {
      workflowId: req.params.workflowId,
      userId: req.user.id
    });

    res.json({
      success: true,
      data: result,
      message: 'Workflow schedule updated successfully'
    });
  } catch (error) {
    logger.error('Failed to update workflow schedule', {
      error: error.message,
      workflowId: req.params.workflowId,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/scheduler/workflows/:workflowId/schedule
 * @desc    Get workflow schedule info
 * @access  Private
 */
router.get('/workflows/:workflowId/schedule', validateToken, async (req, res) => {
  try {
    const info = await schedulerService.getScheduleInfo(req.params.workflowId);

    res.json({
      success: true,
      data: info
    });
  } catch (error) {
    logger.error('Failed to get workflow schedule info', {
      error: error.message,
      workflowId: req.params.workflowId,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/scheduler/workflows/:workflowId/enable
 * @desc    Enable workflow schedule
 * @access  Private
 */
router.post('/workflows/:workflowId/enable', validateToken, async (req, res) => {
  try {
    const result = await schedulerService.enableSchedule(req.params.workflowId);

    logger.info('Workflow schedule enabled', {
      workflowId: req.params.workflowId,
      userId: req.user.id
    });

    res.json({
      success: true,
      data: result,
      message: 'Workflow schedule enabled successfully'
    });
  } catch (error) {
    logger.error('Failed to enable workflow schedule', {
      error: error.message,
      workflowId: req.params.workflowId,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/scheduler/workflows/:workflowId/disable
 * @desc    Disable workflow schedule
 * @access  Private
 */
router.post('/workflows/:workflowId/disable', validateToken, async (req, res) => {
  try {
    const result = await schedulerService.disableSchedule(req.params.workflowId);

    logger.info('Workflow schedule disabled', {
      workflowId: req.params.workflowId,
      userId: req.user.id
    });

    res.json({
      success: true,
      data: result,
      message: 'Workflow schedule disabled successfully'
    });
  } catch (error) {
    logger.error('Failed to disable workflow schedule', {
      error: error.message,
      workflowId: req.params.workflowId,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/scheduler/workflows/:workflowId/schedule
 * @desc    Remove workflow schedule
 * @access  Private
 */
router.delete('/workflows/:workflowId/schedule', validateToken, async (req, res) => {
  try {
    const unscheduled = schedulerService.unscheduleWorkflow(req.params.workflowId);

    if (!unscheduled) {
      return res.status(404).json({
        success: false,
        error: 'Workflow is not scheduled'
      });
    }

    logger.info('Workflow schedule removed', {
      workflowId: req.params.workflowId,
      userId: req.user.id
    });

    res.json({
      success: true,
      message: 'Workflow schedule removed successfully'
    });
  } catch (error) {
    logger.error('Failed to remove workflow schedule', {
      error: error.message,
      workflowId: req.params.workflowId,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/scheduler/workflows/:workflowId/trigger
 * @desc    Manually trigger a scheduled workflow
 * @access  Private
 */
router.post('/workflows/:workflowId/trigger', validateToken, async (req, res) => {
  try {
    const execution = await schedulerService.triggerNow(req.params.workflowId, req.user.id);

    logger.info('Scheduled workflow triggered manually', {
      workflowId: req.params.workflowId,
      executionId: execution.id,
      userId: req.user.id
    });

    res.status(202).json({
      success: true,
      data: execution,
      message: 'Scheduled workflow triggered successfully'
    });
  } catch (error) {
    logger.error('Failed to trigger scheduled workflow', {
      error: error.message,
      workflowId: req.params.workflowId,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/scheduler/scheduled
 * @desc    Get all scheduled workflows
 * @access  Private (Admin)
 */
router.get('/scheduled', validateToken, requireRole('admin'), async (req, res) => {
  try {
    const scheduled = await schedulerService.getAllScheduled();

    res.json({
      success: true,
      data: scheduled,
      count: scheduled.length
    });
  } catch (error) {
    logger.error('Failed to get scheduled workflows', {
      error: error.message,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/scheduler/validate
 * @desc    Validate cron expression
 * @access  Private
 */
router.post('/validate', validateToken, async (req, res) => {
  try {
    const { schedule, timezone = 'UTC' } = req.body;

    if (!schedule) {
      return res.status(400).json({
        success: false,
        error: 'Schedule is required'
      });
    }

    const isValid = schedulerService.validateCronExpression(schedule);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid cron expression',
        valid: false
      });
    }

    const nextExecution = schedulerService.getNextExecution(schedule, timezone);
    const nextExecutions = schedulerService.getNextExecutions(schedule, timezone, 5);
    const description = schedulerService.describeCronExpression(schedule);

    res.json({
      success: true,
      valid: true,
      schedule,
      timezone,
      description,
      nextExecution,
      nextExecutions
    });
  } catch (error) {
    logger.error('Failed to validate cron expression', {
      error: error.message,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message,
      valid: false
    });
  }
});

/**
 * @route   GET /api/scheduler/examples
 * @desc    Get cron expression examples
 * @access  Private
 */
router.get('/examples', validateToken, async (req, res) => {
  try {
    const examples = [
      {
        expression: '* * * * *',
        description: 'Every minute',
        useCase: 'Testing, high-frequency monitoring'
      },
      {
        expression: '*/5 * * * *',
        description: 'Every 5 minutes',
        useCase: 'Regular monitoring, data sync'
      },
      {
        expression: '*/15 * * * *',
        description: 'Every 15 minutes',
        useCase: 'Periodic checks, cache refresh'
      },
      {
        expression: '*/30 * * * *',
        description: 'Every 30 minutes',
        useCase: 'Report generation, data aggregation'
      },
      {
        expression: '0 * * * *',
        description: 'Every hour at minute 0',
        useCase: 'Hourly reports, cleanup tasks'
      },
      {
        expression: '0 */2 * * *',
        description: 'Every 2 hours',
        useCase: 'Batch processing, backups'
      },
      {
        expression: '0 */6 * * *',
        description: 'Every 6 hours',
        useCase: 'Daily data sync, health checks'
      },
      {
        expression: '0 0 * * *',
        description: 'Daily at midnight',
        useCase: 'Daily reports, maintenance tasks'
      },
      {
        expression: '0 2 * * *',
        description: 'Daily at 2:00 AM',
        useCase: 'Nightly backups, data archival'
      },
      {
        expression: '0 9 * * 1-5',
        description: 'Weekdays at 9:00 AM',
        useCase: 'Business hours automation'
      },
      {
        expression: '0 0 * * 0',
        description: 'Weekly on Sunday at midnight',
        useCase: 'Weekly reports, cleanup'
      },
      {
        expression: '0 0 1 * *',
        description: 'Monthly on the 1st at midnight',
        useCase: 'Monthly reports, billing'
      },
      {
        expression: '0 0 1 1 *',
        description: 'Yearly on January 1st at midnight',
        useCase: 'Annual reports, year-end tasks'
      },
      {
        expression: '0 12 * * 1',
        description: 'Every Monday at noon',
        useCase: 'Weekly meetings, status updates'
      },
      {
        expression: '30 9 * * *',
        description: 'Daily at 9:30 AM',
        useCase: 'Morning reports, start-of-day tasks'
      }
    ];

    res.json({
      success: true,
      data: examples,
      count: examples.length
    });
  } catch (error) {
    logger.error('Failed to get cron examples', {
      error: error.message,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/scheduler/presets
 * @desc    Get schedule presets
 * @access  Private
 */
router.get('/presets', validateToken, async (req, res) => {
  try {
    const { category } = req.query;

    const presets = category
      ? schedulePresetsService.getPresetsByCategory(category)
      : schedulePresetsService.getAllPresets();

    res.json({
      success: true,
      data: presets,
      categories: schedulePresetsService.getCategories()
    });
  } catch (error) {
    logger.error('Failed to get schedule presets', {
      error: error.message,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
