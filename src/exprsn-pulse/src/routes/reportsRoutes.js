/**
 * Reports Routes
 */

const express = require('express');
const router = express.Router();
const { validateCAToken, requirePermissions, asyncHandler } = require('@exprsn/shared');
const ReportService = require('../services/ReportService');
const ScheduleService = require('../services/ScheduleService');
const Joi = require('joi');

const createReportSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().allow('', null),
  category: Joi.string(),
  type: Joi.string().valid('tabular', 'chart', 'mixed', 'custom').required(),
  definition: Joi.object().required(),
  format: Joi.string().valid('pdf', 'excel', 'csv', 'html', 'json'),
  pageSize: Joi.string().valid('letter', 'a4', 'legal', 'tabloid'),
  orientation: Joi.string().valid('portrait', 'landscape'),
  template: Joi.string(),
  isPublic: Joi.boolean(),
  isTemplate: Joi.boolean(),
  tags: Joi.array().items(Joi.string()),
  parameters: Joi.array(),
  filters: Joi.array()
});

// List reports
router.get('/',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { category, type, isPublic, isTemplate, orderBy, orderDirection, limit, offset, includeDetails } = req.query;

    const result = await ReportService.list(
      { category, type, isPublic, isTemplate, orderBy, orderDirection, includeDetails: includeDetails === 'true' },
      { limit: parseInt(limit) || 50, offset: parseInt(offset) || 0 }
    );

    res.json({
      success: true,
      ...result
    });
  })
);

// Get report by ID
router.get('/:id',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const report = await ReportService.getById(req.params.id);

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Report not found'
      });
    }

    res.json({
      success: true,
      data: report
    });
  })
);

// Create report
router.post('/',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = createReportSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const report = await ReportService.create(value, req.user.id);

    res.status(201).json({
      success: true,
      data: report
    });
  })
);

// Execute report
router.post('/:id/execute',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { parameters, format } = req.body;

    const result = await ReportService.execute(req.params.id, parameters || {}, { format });

    // Return binary data for PDF/Excel
    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="report_${req.params.id}.pdf"`);
      return res.send(result.output);
    }

    if (format === 'excel') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="report_${req.params.id}.xlsx"`);
      return res.send(result.output);
    }

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="report_${req.params.id}.csv"`);
      return res.send(result.output);
    }

    // JSON/HTML - return as JSON response
    res.json({
      success: true,
      data: result
    });
  })
);

// Get report schedules
router.get('/:id/schedules',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const schedules = await ScheduleService.list({ reportId: req.params.id });

    res.json({
      success: true,
      data: schedules
    });
  })
);

// Update report
router.put('/:id',
  validateCAToken,
  requirePermissions({ update: true }),
  asyncHandler(async (req, res) => {
    const report = await ReportService.update(req.params.id, req.body, req.user.id);

    res.json({
      success: true,
      data: report
    });
  })
);

// Delete report
router.delete('/:id',
  validateCAToken,
  requirePermissions({ delete: true }),
  asyncHandler(async (req, res) => {
    await ReportService.delete(req.params.id);

    res.json({
      success: true,
      message: 'Report deleted successfully'
    });
  })
);

module.exports = router;
