/**
 * Schedules Routes
 */

const express = require('express');
const router = express.Router();
const { validateCAToken, requirePermissions, asyncHandler } = require('@exprsn/shared');
const ScheduleService = require('../services/ScheduleService');
const Joi = require('joi');

const createScheduleSchema = Joi.object({
  reportId: Joi.string().uuid().required(),
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().allow('', null),
  cronExpression: Joi.string().required(),
  timezone: Joi.string().default('UTC'),
  parameters: Joi.object(),
  format: Joi.string().valid('pdf', 'excel', 'csv', 'html', 'json').default('pdf'),
  recipients: Joi.array().items(Joi.string().email()).required(),
  deliveryMethod: Joi.string().valid('email', 'webhook', 's3', 'both').default('email'),
  webhookUrl: Joi.string().uri(),
  s3Bucket: Joi.string(),
  s3Path: Joi.string(),
  emailSubject: Joi.string(),
  emailBody: Joi.string(),
  isActive: Joi.boolean().default(true),
  startDate: Joi.date(),
  endDate: Joi.date()
});

// List schedules
router.get('/',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { reportId, isActive } = req.query;

    const schedules = await ScheduleService.list({ reportId, isActive });

    res.json({
      success: true,
      data: schedules
    });
  })
);

// Get schedule by ID
router.get('/:id',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const schedule = await ScheduleService.getById(req.params.id);

    if (!schedule) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Schedule not found'
      });
    }

    res.json({
      success: true,
      data: schedule
    });
  })
);

// Create schedule
router.post('/',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = createScheduleSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const schedule = await ScheduleService.create(value, req.user.id);

    res.status(201).json({
      success: true,
      data: schedule
    });
  })
);

// Execute schedule immediately
router.post('/:id/execute',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    await ScheduleService.executeSchedule(req.params.id);

    res.json({
      success: true,
      message: 'Schedule execution started'
    });
  })
);

// Update schedule
router.put('/:id',
  validateCAToken,
  requirePermissions({ update: true }),
  asyncHandler(async (req, res) => {
    const schedule = await ScheduleService.update(req.params.id, req.body, req.user.id);

    res.json({
      success: true,
      data: schedule
    });
  })
);

// Delete schedule
router.delete('/:id',
  validateCAToken,
  requirePermissions({ delete: true }),
  asyncHandler(async (req, res) => {
    await ScheduleService.delete(req.params.id);

    res.json({
      success: true,
      message: 'Schedule deleted successfully'
    });
  })
);

module.exports = router;
