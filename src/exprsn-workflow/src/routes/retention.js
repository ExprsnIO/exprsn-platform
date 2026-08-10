const express = require('express');
const router = express.Router();
const retentionService = require('../services/retentionService');
const { validateToken, requirePermission } = require('../middleware/auth');

/**
 * @route GET /api/retention/statistics
 * @desc Get retention statistics
 * @access Private (requires admin permission)
 */
router.get('/statistics',
  validateToken,
  requirePermission('admin'),
  async (req, res) => {
    try {
      const stats = await retentionService.getStatistics();

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
 * @route POST /api/retention/archive
 * @desc Archive old executions
 * @access Private (requires admin permission)
 */
router.post('/archive',
  validateToken,
  requirePermission('admin'),
  async (req, res) => {
    try {
      const { retentionDays, batchSize, workflowId } = req.body;

      const result = await retentionService.archiveExecutions({
        retentionDays,
        batchSize,
        workflowId
      });

      res.json({
        success: result.success,
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
 * @route POST /api/retention/archive-logs
 * @desc Archive old logs
 * @access Private (requires admin permission)
 */
router.post('/archive-logs',
  validateToken,
  requirePermission('admin'),
  async (req, res) => {
    try {
      const { retentionDays, batchSize } = req.body;

      const result = await retentionService.archiveLogs({
        retentionDays,
        batchSize
      });

      res.json({
        success: result.success,
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
 * @route POST /api/retention/prune
 * @desc Hard delete old data
 * @access Private (requires admin permission)
 */
router.post('/prune',
  validateToken,
  requirePermission('admin'),
  async (req, res) => {
    try {
      const { retentionDays, includeCompleted = false } = req.body;

      const result = await retentionService.pruneOldData({
        retentionDays,
        includeCompleted
      });

      res.json({
        success: result.success,
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
 * @route PUT /api/retention/policy
 * @desc Update retention policy
 * @access Private (requires admin permission)
 */
router.put('/policy',
  validateToken,
  requirePermission('admin'),
  async (req, res) => {
    try {
      const { retentionDays, archiveEnabled, deleteAfterArchive } = req.body;

      retentionService.updateRetentionPolicy(
        retentionDays,
        archiveEnabled,
        deleteAfterArchive
      );

      res.json({
        success: true,
        message: 'Retention policy updated',
        policy: {
          retentionDays,
          archiveEnabled,
          deleteAfterArchive
        }
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
 * @route POST /api/retention/restore/:executionId
 * @desc Restore archived execution
 * @access Private (requires admin permission)
 */
router.post('/restore/:executionId',
  validateToken,
  requirePermission('admin'),
  async (req, res) => {
    try {
      const { executionId } = req.params;

      const result = await retentionService.restoreExecution(executionId);

      res.json({
        success: true,
        execution: result
      });
    } catch (error) {
      res.status(501).json({
        success: false,
        error: error.message
      });
    }
  }
);

module.exports = router;
