/**
 * ═══════════════════════════════════════════════════════════
 * Workflow Testing Routes
 * Test workflow execution without committing changes
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const Workflow = require('../models/Workflow');
const WorkflowExecution = require('../models/WorkflowExecution');
const WorkflowLog = require('../models/WorkflowLog');
const { asyncHandler } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');

/**
 * POST /workflows/:id/test - Test workflow in dry-run mode
 */
router.post('/:id/test', asyncHandler(async (req, res) => {
  const workflow = await Workflow.findByPk(req.params.id);

  if (!workflow) {
    return res.status(404).json({
      success: false,
      error: 'Workflow not found'
    });
  }

  // Create test execution
  const execution = await WorkflowExecution.create({
    workflow_id: workflow.id,
    input_data: req.body.testData || {},
    status: 'running',
    started_at: new Date(),
    metadata: {
      testMode: true,
      dryRun: true
    }
  });

  try {
    // Execute workflow with dry-run flag
    const executionService = require('../services/executionService');
    const result = await executionService.execute(execution.id, {
      dryRun: true,
      testMode: true
    });

    // Get execution logs
    const logs = await WorkflowLog.findAll({
      where: { execution_id: execution.id },
      order: [['created_at', 'ASC']]
    });

    logger.info('Workflow test completed', {
      workflowId: workflow.id,
      executionId: execution.id,
      status: result.status
    });

    res.json({
      success: true,
      data: {
        execution: {
          id: execution.id,
          status: result.status,
          result: result.output,
          duration: result.duration
        },
        logs: logs.map(log => ({
          step: log.step_name,
          status: log.status,
          output: log.output,
          error: log.error_message,
          timestamp: log.created_at
        })),
        changes: result.changes || []
      },
      message: 'Test execution completed (no changes committed)'
    });
  } catch (error) {
    logger.error('Workflow test failed', {
      workflowId: workflow.id,
      executionId: execution.id,
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

/**
 * POST /workflows/:id/validate - Validate workflow definition
 */
router.post('/:id/validate', asyncHandler(async (req, res) => {
  const workflow = await Workflow.findByPk(req.params.id);

  if (!workflow) {
    return res.status(404).json({
      success: false,
      error: 'Workflow not found'
    });
  }

  const errors = [];
  const warnings = [];

  // Validate workflow structure
  if (!workflow.definition || !workflow.definition.steps || workflow.definition.steps.length === 0) {
    errors.push('Workflow must have at least one step');
  }

  // Validate steps
  if (workflow.definition && workflow.definition.steps) {
    workflow.definition.steps.forEach((step, index) => {
      if (!step.id) {
        errors.push(`Step ${index + 1}: Missing step ID`);
      }
      if (!step.type) {
        errors.push(`Step ${index + 1}: Missing step type`);
      }
      if (!step.name) {
        warnings.push(`Step ${index + 1}: Missing step name`);
      }
    });
  }

  // Check for unreachable steps
  if (workflow.definition && workflow.definition.steps && workflow.definition.steps.length > 1) {
    const reachableSteps = new Set([workflow.definition.steps[0].id]);
    let changed = true;

    while (changed) {
      changed = false;
      workflow.definition.steps.forEach(step => {
        if (reachableSteps.has(step.id)) {
          if (step.next) {
            if (!reachableSteps.has(step.next)) {
              reachableSteps.add(step.next);
              changed = true;
            }
          }
          if (step.branches) {
            step.branches.forEach(branch => {
              if (branch.next && !reachableSteps.has(branch.next)) {
                reachableSteps.add(branch.next);
                changed = true;
              }
            });
          }
        }
      });
    }

    workflow.definition.steps.forEach(step => {
      if (!reachableSteps.has(step.id) && step !== workflow.definition.steps[0]) {
        warnings.push(`Step "${step.name || step.id}" is unreachable`);
      }
    });
  }

  logger.info('Workflow validated', {
    workflowId: workflow.id,
    errors: errors.length,
    warnings: warnings.length
  });

  res.json({
    success: true,
    data: {
      valid: errors.length === 0,
      errors,
      warnings
    }
  });
}));

module.exports = router;
