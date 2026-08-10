const express = require('express');
const router = express.Router();
const executionController = require('../controllers/executionController');
const { validateToken, checkWorkflowPermission } = require('../middleware/auth');
const { validate, validateQuery, executeWorkflowSchema, listExecutionsQuerySchema } = require('../middleware/validation');

/**
 * @route   POST /api/workflows/:workflowId/execute
 * @desc    Start workflow execution
 * @access  Private
 */
router.post('/:workflowId/execute',
  validateToken,
  checkWorkflowPermission('execute'),
  validate(executeWorkflowSchema),
  executionController.startExecution
);

/**
 * @route   GET /api/executions
 * @desc    List executions
 * @access  Private
 */
router.get('/',
  validateToken,
  validateQuery(listExecutionsQuerySchema),
  executionController.listExecutions
);

/**
 * @route   GET /api/executions/stats
 * @desc    Get execution statistics
 * @access  Private
 */
router.get('/stats',
  validateToken,
  executionController.getExecutionStatistics
);

/**
 * @route   GET /api/executions/:id
 * @desc    Get execution status
 * @access  Private
 */
router.get('/:id',
  validateToken,
  executionController.getExecutionStatus
);

/**
 * @route   POST /api/executions/:id/cancel
 * @desc    Cancel execution
 * @access  Private
 */
router.post('/:id/cancel',
  validateToken,
  executionController.cancelExecution
);

/**
 * @route   POST /api/executions/:id/retry
 * @desc    Retry failed execution
 * @access  Private
 */
router.post('/:id/retry',
  validateToken,
  executionController.retryExecution
);

/**
 * @route   GET /api/executions/:id/logs
 * @desc    Get execution logs
 * @access  Private
 */
router.get('/:id/logs',
  validateToken,
  executionController.getExecutionLogs
);

/**
 * @route   POST /api/executions/:id/labels
 * @desc    Add labels to execution
 * @access  Private
 */
router.post('/:id/labels',
  validateToken,
  executionController.addExecutionLabels
);

/**
 * @route   DELETE /api/executions/:id/labels
 * @desc    Remove labels from execution
 * @access  Private
 */
router.delete('/:id/labels',
  validateToken,
  executionController.removeExecutionLabels
);

/**
 * @route   GET /api/executions/labels/all
 * @desc    Get all available labels
 * @access  Private
 */
router.get('/labels/all',
  validateToken,
  executionController.getAllLabels
);

module.exports = router;
