const express = require('express');
const router = express.Router();
const { requirePermission } = require('../../../middleware/auth');
const workflowIntegration = require('../../../services/forge/workflowIntegration');
const logger = require('../../../utils/logger');

// List workflows
router.get('/',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const result = await workflowIntegration.listWorkflows({
        page: req.query.page || 1,
        limit: req.query.limit || 20
      });

      if (!result.success) {
        return res.status(500).json(result);
      }

      res.json(result);
    } catch (error) {
      logger.error('Failed to list workflows', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to list workflows'
      });
    }
  }
);

// Execute workflow
router.post('/:workflowId/execute',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const result = await workflowIntegration.executeWorkflow(
        req.params.workflowId,
        req.body.input || {},
        {
          userId: req.user.id,
          triggeredBy: 'manual'
        }
      );

      if (!result.success) {
        return res.status(500).json(result);
      }

      res.json(result);
    } catch (error) {
      logger.error('Failed to execute workflow', {
        error: error.message,
        workflowId: req.params.workflowId
      });
      res.status(500).json({
        success: false,
        error: 'Failed to execute workflow'
      });
    }
  }
);

// Get execution status
router.get('/executions/:executionId',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const result = await workflowIntegration.getExecutionStatus(req.params.executionId);

      if (!result.success) {
        return res.status(500).json(result);
      }

      res.json(result);
    } catch (error) {
      logger.error('Failed to get execution status', {
        error: error.message,
        executionId: req.params.executionId
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get execution status'
      });
    }
  }
);

module.exports = router;
