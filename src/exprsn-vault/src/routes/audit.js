/**
 * Exprsn Vault - Audit Logs Routes
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { requireToken } = require('../middleware/auth');
const auditService = require('../services/auditService');

// Validation schema
const listLogsSchema = Joi.object({
  resourceType: Joi.string().optional(),
  resourceId: Joi.string().uuid().optional(),
  resourcePath: Joi.string().optional(),
  actor: Joi.string().optional(),
  action: Joi.string().optional(),
  success: Joi.boolean().optional(),
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional(),
  limit: Joi.number().integer().min(1).max(1000).default(100),
  offset: Joi.number().integer().min(0).default(0)
});

// Get audit logs
router.get('/logs', requireToken({ requiredPermissions: { read: true }, resourcePrefix: '/audit' }), async (req, res) => {
  try {
    // Validate query parameters
    const { error, value } = listLogsSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const logs = await auditService.getLogs(value);

    res.json({
      success: true,
      data: logs,
      count: logs.length,
      limit: value.limit,
      offset: value.offset
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get audit statistics
router.get('/stats', requireToken({ requiredPermissions: { read: true }, resourcePrefix: '/audit' }), async (req, res) => {
  try {
    const { startDate, endDate, actor, resourceType } = req.query;

    const stats = await auditService.getStats({
      startDate,
      endDate,
      actor,
      resourceType
    });

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Export audit logs to CSV
router.get('/export', requireToken({ requiredPermissions: { read: true }, resourcePrefix: '/audit' }), async (req, res) => {
  try {
    const { resourceType, actor, startDate, endDate } = req.query;

    const csvData = await auditService.exportToCSV({
      resourceType,
      actor,
      startDate,
      endDate
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${Date.now()}.csv"`);
    res.send(csvData);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
