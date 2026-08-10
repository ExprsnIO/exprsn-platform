const express = require('express');
const router = express.Router();
const executionEngine = require('../services/executionEngine');
const auth = require('../middleware/auth');
const { body, param, validationResult } = require('express-validator');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

/**
 * @route   POST /api/executions/:executionId/steps/:stepId/approve
 * @desc    Approve a pending approval step
 * @access  Private
 */
router.post(
  '/:executionId/steps/:stepId/approve',
  auth.validateToken,
  [
    param('executionId').isUUID(),
    param('stepId').notEmpty(),
    body('comments').optional().isString()
  ],
  validate,
  async (req, res) => {
    try {
      const { executionId, stepId } = req.params;
      const { comments } = req.body;
      const userId = req.user.id;

      const result = await executionEngine.approveStep(
        executionId,
        stepId,
        userId,
        comments
      );

      res.json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * @route   POST /api/executions/:executionId/steps/:stepId/reject
 * @desc    Reject a pending approval step
 * @access  Private
 */
router.post(
  '/:executionId/steps/:stepId/reject',
  auth.validateToken,
  [
    param('executionId').isUUID(),
    param('stepId').notEmpty(),
    body('reason').optional().isString()
  ],
  validate,
  async (req, res) => {
    try {
      const { executionId, stepId } = req.params;
      const { reason } = req.body;
      const userId = req.user.id;

      const result = await executionEngine.rejectStep(
        executionId,
        stepId,
        userId,
        reason
      );

      res.json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/executions/:executionId/pending-approvals
 * @desc    Get all pending approvals for an execution
 * @access  Private
 */
router.get(
  '/:executionId/pending-approvals',
  auth.validateToken,
  [param('executionId').isUUID()],
  validate,
  async (req, res) => {
    try {
      const { executionId } = req.params;

      const execution = await executionEngine.getExecutionStatus(executionId);

      const pendingApprovals = execution.context?.pendingApprovals || {};

      res.json({
        success: true,
        data: {
          executionId,
          pendingApprovals,
          count: Object.keys(pendingApprovals).length
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

module.exports = router;
