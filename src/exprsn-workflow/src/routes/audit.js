const express = require('express');
const router = express.Router();
const auditService = require('../services/auditService');
const { validateToken, requirePermission } = require('../middleware/auth');

/**
 * @route GET /api/audit
 * @desc Get audit logs with filters
 * @access Private (requires admin permission)
 */
router.get('/',
  validateToken,
  requirePermission('admin'),
  async (req, res) => {
    try {
      const {
        workflowId,
        executionId,
        userId,
        eventType,
        severity,
        success,
        startDate,
        endDate,
        limit,
        offset
      } = req.query;

      const result = await auditService.query({
        workflowId,
        executionId,
        userId,
        eventType,
        severity,
        success: success === 'true' ? true : success === 'false' ? false : undefined,
        startDate,
        endDate
      }, {
        limit: parseInt(limit) || 100,
        offset: parseInt(offset) || 0
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * @route GET /api/audit/statistics
 * @desc Get audit statistics
 * @access Private (requires admin permission)
 */
router.get('/statistics',
  validateToken,
  requirePermission('admin'),
  async (req, res) => {
    try {
      const { workflowId, userId, startDate, endDate } = req.query;

      const stats = await auditService.getStatistics({
        workflowId,
        userId,
        startDate,
        endDate
      });

      res.json({
        success: true,
        statistics: stats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * @route GET /api/audit/workflow/:workflowId
 * @desc Get audit logs for a specific workflow
 * @access Private
 */
router.get('/workflow/:workflowId',
  validateToken,
  async (req, res) => {
    try {
      const { workflowId } = req.params;
      const { limit, offset } = req.query;

      const result = await auditService.query({
        workflowId
      }, {
        limit: parseInt(limit) || 50,
        offset: parseInt(offset) || 0
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * @route GET /api/audit/execution/:executionId
 * @desc Get audit logs for a specific execution
 * @access Private
 */
router.get('/execution/:executionId',
  validateToken,
  async (req, res) => {
    try {
      const { executionId } = req.params;

      const result = await auditService.query({
        executionId
      }, {
        limit: 1000, // Get all logs for an execution
        offset: 0
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * @route POST /api/audit/archive
 * @desc Archive old audit logs
 * @access Private (requires admin permission)
 */
router.post('/archive',
  validateToken,
  requirePermission('admin'),
  async (req, res) => {
    try {
      const { daysToKeep = 90 } = req.body;

      const deleted = await auditService.archiveOldLogs(parseInt(daysToKeep));

      res.json({
        success: true,
        message: `Archived ${deleted} old audit logs`,
        deleted
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * @route GET /api/audit/events
 * @desc Get list of available event types
 * @access Private
 */
router.get('/events',
  validateToken,
  async (req, res) => {
    try {
      const eventTypes = [
        'workflow_create',
        'workflow_update',
        'workflow_delete',
        'workflow_clone',
        'workflow_execute',
        'workflow_cancel',
        'workflow_export',
        'workflow_import',
        'execution_start',
        'execution_complete',
        'execution_fail',
        'execution_cancel',
        'execution_retry',
        'step_execute',
        'step_fail',
        'permission_grant',
        'permission_revoke',
        'config_change'
      ];

      res.json({
        success: true,
        eventTypes
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

module.exports = router;
