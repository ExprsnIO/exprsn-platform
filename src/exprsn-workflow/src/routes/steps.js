const express = require('express');
const router = express.Router();
const { WorkflowStep } = require('../models');
const { validateToken } = require('../middleware/auth');
const auditService = require('../services/auditService');
const logger = require('../utils/logger');
const Joi = require('joi');

/**
 * Validation schema for step comment update
 */
const updateCommentSchema = Joi.object({
  comment: Joi.string().allow('', null).max(5000).required()
});

/**
 * Validation schema for bulk comment update
 */
const bulkUpdateCommentsSchema = Joi.object({
  comments: Joi.array().items(
    Joi.object({
      stepId: Joi.string().required(),
      comment: Joi.string().allow('', null).max(5000).required()
    })
  ).min(1).max(50).required()
});

/**
 * @route   PUT /api/workflows/:workflowId/steps/:stepId/comment
 * @desc    Update comment for a specific workflow step
 * @access  Private
 */
router.put('/:workflowId/steps/:stepId/comment', validateToken, async (req, res) => {
  try {
    const { error, value } = updateCommentSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const { workflowId, stepId } = req.params;
    const { comment } = value;

    // Find the step
    const step = await WorkflowStep.findOne({
      where: {
        workflow_id: workflowId,
        step_id: stepId
      }
    });

    if (!step) {
      return res.status(404).json({
        success: false,
        error: 'Workflow step not found'
      });
    }

    // Store old comment for audit
    const oldComment = step.comment;

    // Update the comment
    await step.update({ comment });

    // Log audit event
    await auditService.log({
      eventType: 'step_comment_update',
      workflowId,
      userId: req.user.id,
      success: true,
      metadata: {
        stepId,
        stepName: step.name,
        oldComment: oldComment || null,
        newComment: comment || null,
        commentLength: comment ? comment.length : 0
      }
    });

    logger.info('Step comment updated', {
      workflowId,
      stepId,
      userId: req.user.id,
      commentLength: comment ? comment.length : 0
    });

    res.json({
      success: true,
      data: {
        stepId: step.step_id,
        comment: step.comment
      },
      message: 'Step comment updated successfully'
    });
  } catch (error) {
    logger.error('Failed to update step comment', {
      error: error.message,
      workflowId: req.params.workflowId,
      stepId: req.params.stepId,
      userId: req.user.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to update step comment'
    });
  }
});

/**
 * @route   GET /api/workflows/:workflowId/steps/:stepId/comment
 * @desc    Get comment for a specific workflow step
 * @access  Private
 */
router.get('/:workflowId/steps/:stepId/comment', validateToken, async (req, res) => {
  try {
    const { workflowId, stepId } = req.params;

    const step = await WorkflowStep.findOne({
      where: {
        workflow_id: workflowId,
        step_id: stepId
      },
      attributes: ['step_id', 'name', 'comment', 'updated_at']
    });

    if (!step) {
      return res.status(404).json({
        success: false,
        error: 'Workflow step not found'
      });
    }

    res.json({
      success: true,
      data: {
        stepId: step.step_id,
        stepName: step.name,
        comment: step.comment,
        updatedAt: step.updated_at
      }
    });
  } catch (error) {
    logger.error('Failed to get step comment', {
      error: error.message,
      workflowId: req.params.workflowId,
      stepId: req.params.stepId,
      userId: req.user.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get step comment'
    });
  }
});

/**
 * @route   DELETE /api/workflows/:workflowId/steps/:stepId/comment
 * @desc    Delete comment from a specific workflow step
 * @access  Private
 */
router.delete('/:workflowId/steps/:stepId/comment', validateToken, async (req, res) => {
  try {
    const { workflowId, stepId } = req.params;

    const step = await WorkflowStep.findOne({
      where: {
        workflow_id: workflowId,
        step_id: stepId
      }
    });

    if (!step) {
      return res.status(404).json({
        success: false,
        error: 'Workflow step not found'
      });
    }

    const oldComment = step.comment;

    // Clear the comment
    await step.update({ comment: null });

    // Log audit event
    await auditService.log({
      eventType: 'step_comment_delete',
      workflowId,
      userId: req.user.id,
      success: true,
      metadata: {
        stepId,
        stepName: step.name,
        deletedComment: oldComment
      }
    });

    logger.info('Step comment deleted', {
      workflowId,
      stepId,
      userId: req.user.id
    });

    res.json({
      success: true,
      message: 'Step comment deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete step comment', {
      error: error.message,
      workflowId: req.params.workflowId,
      stepId: req.params.stepId,
      userId: req.user.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to delete step comment'
    });
  }
});

/**
 * @route   GET /api/workflows/:workflowId/steps/comments
 * @desc    Get all comments for all steps in a workflow
 * @access  Private
 */
router.get('/:workflowId/steps/comments', validateToken, async (req, res) => {
  try {
    const { workflowId } = req.params;

    const steps = await WorkflowStep.findAll({
      where: {
        workflow_id: workflowId
      },
      attributes: ['step_id', 'name', 'comment', 'order', 'updated_at'],
      order: [['order', 'ASC']]
    });

    // Filter only steps with comments
    const stepsWithComments = steps.filter(step => step.comment);

    res.json({
      success: true,
      data: {
        workflowId,
        totalSteps: steps.length,
        stepsWithComments: stepsWithComments.length,
        comments: stepsWithComments.map(step => ({
          stepId: step.step_id,
          stepName: step.name,
          comment: step.comment,
          order: step.order,
          updatedAt: step.updated_at
        }))
      }
    });
  } catch (error) {
    logger.error('Failed to get workflow step comments', {
      error: error.message,
      workflowId: req.params.workflowId,
      userId: req.user.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get workflow step comments'
    });
  }
});

/**
 * @route   PUT /api/workflows/:workflowId/steps/comments/bulk
 * @desc    Bulk update comments for multiple steps
 * @access  Private
 */
router.put('/:workflowId/steps/comments/bulk', validateToken, async (req, res) => {
  try {
    const { error, value } = bulkUpdateCommentsSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const { workflowId } = req.params;
    const { comments } = value;

    const results = [];
    const errors = [];

    for (const { stepId, comment } of comments) {
      try {
        const step = await WorkflowStep.findOne({
          where: {
            workflow_id: workflowId,
            step_id: stepId
          }
        });

        if (!step) {
          errors.push({
            stepId,
            error: 'Step not found'
          });
          continue;
        }

        const oldComment = step.comment;
        await step.update({ comment });

        // Log audit event
        await auditService.log({
          eventType: 'step_comment_update',
          workflowId,
          userId: req.user.id,
          success: true,
          metadata: {
            stepId,
            stepName: step.name,
            oldComment: oldComment || null,
            newComment: comment || null,
            bulkOperation: true
          }
        });

        results.push({
          stepId,
          success: true
        });
      } catch (err) {
        errors.push({
          stepId,
          error: err.message
        });
      }
    }

    logger.info('Bulk step comments updated', {
      workflowId,
      userId: req.user.id,
      total: comments.length,
      successful: results.length,
      failed: errors.length
    });

    res.json({
      success: true,
      data: {
        total: comments.length,
        successful: results.length,
        failed: errors.length,
        results,
        errors
      },
      message: `Updated ${results.length} of ${comments.length} step comments`
    });
  } catch (error) {
    logger.error('Failed to bulk update step comments', {
      error: error.message,
      workflowId: req.params.workflowId,
      userId: req.user.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to bulk update step comments'
    });
  }
});

/**
 * @route   GET /api/workflows/:workflowId/steps/comments/search
 * @desc    Search step comments
 * @access  Private
 */
router.get('/:workflowId/steps/comments/search', validateToken, async (req, res) => {
  try {
    const { workflowId } = req.params;
    const { query } = req.query;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    const steps = await WorkflowStep.findAll({
      where: {
        workflow_id: workflowId
      },
      attributes: ['step_id', 'name', 'comment', 'order']
    });

    // Filter steps where comment contains the query (case-insensitive)
    const searchQuery = query.toLowerCase();
    const matchingSteps = steps.filter(step =>
      step.comment && step.comment.toLowerCase().includes(searchQuery)
    );

    res.json({
      success: true,
      data: {
        query,
        totalMatches: matchingSteps.length,
        matches: matchingSteps.map(step => ({
          stepId: step.step_id,
          stepName: step.name,
          comment: step.comment,
          order: step.order
        }))
      }
    });
  } catch (error) {
    logger.error('Failed to search step comments', {
      error: error.message,
      workflowId: req.params.workflowId,
      userId: req.user.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to search step comments'
    });
  }
});

/**
 * @route   POST /api/workflows/:workflowId/steps/:stepId/copy
 * @desc    Copy step to clipboard (stores in session/memory)
 * @access  Private
 */
router.post('/:workflowId/steps/:stepId/copy', validateToken, async (req, res) => {
  try {
    const { workflowId, stepId } = req.params;

    const step = await WorkflowStep.findOne({
      where: {
        workflow_id: workflowId,
        step_id: stepId
      }
    });

    if (!step) {
      return res.status(404).json({
        success: false,
        error: 'Workflow step not found'
      });
    }

    // Serialize step for clipboard
    const clipboardData = {
      step_id: step.step_id,
      step_type: step.step_type,
      name: step.name,
      description: step.description,
      comment: step.comment,
      position: step.position,
      config: step.config,
      inputs: step.inputs,
      outputs: step.outputs,
      conditions: step.conditions,
      next_steps: step.next_steps,
      error_handler: step.error_handler,
      timeout: step.timeout,
      retry_config: step.retry_config,
      flags: step.flags,
      order: step.order,
      is_enabled: step.is_enabled
    };

    // Log audit event
    await auditService.log({
      eventType: 'step_copy',
      workflowId,
      userId: req.user.id,
      success: true,
      metadata: {
        stepId,
        stepName: step.name
      }
    });

    logger.info('Step copied to clipboard', {
      workflowId,
      stepId,
      userId: req.user.id
    });

    res.json({
      success: true,
      data: {
        clipboard: clipboardData,
        stepId: step.step_id,
        stepName: step.name
      },
      message: 'Step copied to clipboard. Use the paste endpoint to paste it.'
    });
  } catch (error) {
    logger.error('Failed to copy step', {
      error: error.message,
      workflowId: req.params.workflowId,
      stepId: req.params.stepId,
      userId: req.user.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to copy step'
    });
  }
});

/**
 * @route   POST /api/workflows/:workflowId/steps/:stepId/duplicate
 * @desc    Duplicate step in the same workflow
 * @access  Private
 */
router.post('/:workflowId/steps/:stepId/duplicate', validateToken, async (req, res) => {
  try {
    const { workflowId, stepId } = req.params;
    const { positionOffset = { x: 50, y: 50 } } = req.body;

    const sourceStep = await WorkflowStep.findOne({
      where: {
        workflow_id: workflowId,
        step_id: stepId
      }
    });

    if (!sourceStep) {
      return res.status(404).json({
        success: false,
        error: 'Workflow step not found'
      });
    }

    // Generate new step_id
    const timestamp = Date.now();
    const newStepId = `${sourceStep.step_id}_copy_${timestamp}`;

    // Calculate new position
    const newPosition = sourceStep.position
      ? {
          x: (sourceStep.position.x || 0) + positionOffset.x,
          y: (sourceStep.position.y || 0) + positionOffset.y
        }
      : null;

    // Create duplicate
    const duplicatedStep = await WorkflowStep.create({
      workflow_id: workflowId,
      step_id: newStepId,
      step_type: sourceStep.step_type,
      name: `${sourceStep.name} (Copy)`,
      description: sourceStep.description,
      comment: sourceStep.comment,
      position: newPosition,
      config: sourceStep.config,
      inputs: sourceStep.inputs,
      outputs: sourceStep.outputs,
      conditions: sourceStep.conditions,
      next_steps: sourceStep.next_steps,
      error_handler: sourceStep.error_handler,
      timeout: sourceStep.timeout,
      retry_config: sourceStep.retry_config,
      flags: sourceStep.flags,
      order: sourceStep.order + 1,
      is_enabled: sourceStep.is_enabled
    });

    // Log audit event
    await auditService.log({
      eventType: 'step_duplicate',
      workflowId,
      userId: req.user.id,
      success: true,
      metadata: {
        sourceStepId: stepId,
        newStepId,
        sourceStepName: sourceStep.name
      }
    });

    logger.info('Step duplicated', {
      workflowId,
      sourceStepId: stepId,
      newStepId,
      userId: req.user.id
    });

    res.status(201).json({
      success: true,
      data: {
        step: duplicatedStep,
        sourceStepId: stepId
      },
      message: 'Step duplicated successfully'
    });
  } catch (error) {
    logger.error('Failed to duplicate step', {
      error: error.message,
      workflowId: req.params.workflowId,
      stepId: req.params.stepId,
      userId: req.user.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to duplicate step'
    });
  }
});

/**
 * @route   POST /api/workflows/:workflowId/steps/paste
 * @desc    Paste step(s) from clipboard data
 * @access  Private
 */
router.post('/:workflowId/steps/paste', validateToken, async (req, res) => {
  try {
    const { workflowId } = req.params;
    const { clipboardData, positionOffset = { x: 0, y: 0 }, generateNewIds = true } = req.body;

    if (!clipboardData) {
      return res.status(400).json({
        success: false,
        error: 'Clipboard data is required'
      });
    }

    // Check if workflow exists
    const workflow = await Workflow.findByPk(workflowId);

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    // Handle single step or array of steps
    const stepsToPaste = Array.isArray(clipboardData) ? clipboardData : [clipboardData];
    const pastedSteps = [];
    const errors = [];

    for (const stepData of stepsToPaste) {
      try {
        // Generate new step_id if requested
        const newStepId = generateNewIds
          ? `${stepData.step_id}_pasted_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          : stepData.step_id;

        // Check if step_id already exists
        const existing = await WorkflowStep.findOne({
          where: {
            workflow_id: workflowId,
            step_id: newStepId
          }
        });

        if (existing && !generateNewIds) {
          errors.push({
            stepId: stepData.step_id,
            error: 'Step ID already exists in workflow'
          });
          continue;
        }

        // Calculate new position
        const newPosition = stepData.position
          ? {
              x: (stepData.position.x || 0) + positionOffset.x,
              y: (stepData.position.y || 0) + positionOffset.y
            }
          : null;

        // Create pasted step
        const pastedStep = await WorkflowStep.create({
          workflow_id: workflowId,
          step_id: newStepId,
          step_type: stepData.step_type,
          name: stepData.name,
          description: stepData.description,
          comment: stepData.comment,
          position: newPosition,
          config: stepData.config || {},
          inputs: stepData.inputs || {},
          outputs: stepData.outputs || {},
          conditions: stepData.conditions,
          next_steps: stepData.next_steps,
          error_handler: stepData.error_handler,
          timeout: stepData.timeout,
          retry_config: stepData.retry_config || {},
          flags: stepData.flags || {},
          order: stepData.order || 0,
          is_enabled: stepData.is_enabled !== false
        });

        pastedSteps.push(pastedStep);
      } catch (err) {
        errors.push({
          stepId: stepData.step_id,
          error: err.message
        });
      }
    }

    // Log audit event
    await auditService.log({
      eventType: 'step_paste',
      workflowId,
      userId: req.user.id,
      success: true,
      metadata: {
        stepsCount: stepsToPaste.length,
        successfulCount: pastedSteps.length,
        failedCount: errors.length
      }
    });

    logger.info('Steps pasted', {
      workflowId,
      total: stepsToPaste.length,
      successful: pastedSteps.length,
      failed: errors.length,
      userId: req.user.id
    });

    res.status(201).json({
      success: true,
      data: {
        pastedSteps,
        total: stepsToPaste.length,
        successful: pastedSteps.length,
        failed: errors.length,
        errors
      },
      message: `Pasted ${pastedSteps.length} of ${stepsToPaste.length} steps`
    });
  } catch (error) {
    logger.error('Failed to paste steps', {
      error: error.message,
      workflowId: req.params.workflowId,
      userId: req.user.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to paste steps'
    });
  }
});

/**
 * @route   POST /api/workflows/:sourceWorkflowId/steps/copy-to/:targetWorkflowId
 * @desc    Copy steps from one workflow to another
 * @access  Private
 */
router.post('/:sourceWorkflowId/steps/copy-to/:targetWorkflowId', validateToken, async (req, res) => {
  try {
    const { sourceWorkflowId, targetWorkflowId } = req.params;
    const { stepIds, positionOffset = { x: 0, y: 0 } } = req.body;

    if (!stepIds || !Array.isArray(stepIds) || stepIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'stepIds array is required'
      });
    }

    // Check target workflow exists
    const targetWorkflow = await Workflow.findByPk(targetWorkflowId);

    if (!targetWorkflow) {
      return res.status(404).json({
        success: false,
        error: 'Target workflow not found'
      });
    }

    // Get source steps
    const sourceSteps = await WorkflowStep.findAll({
      where: {
        workflow_id: sourceWorkflowId,
        step_id: stepIds
      }
    });

    if (sourceSteps.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No steps found with provided IDs'
      });
    }

    const copiedSteps = [];

    for (const sourceStep of sourceSteps) {
      const newStepId = `${sourceStep.step_id}_copied_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const newPosition = sourceStep.position
        ? {
            x: (sourceStep.position.x || 0) + positionOffset.x,
            y: (sourceStep.position.y || 0) + positionOffset.y
          }
        : null;

      const copiedStep = await WorkflowStep.create({
        workflow_id: targetWorkflowId,
        step_id: newStepId,
        step_type: sourceStep.step_type,
        name: sourceStep.name,
        description: sourceStep.description,
        comment: sourceStep.comment,
        position: newPosition,
        config: sourceStep.config,
        inputs: sourceStep.inputs,
        outputs: sourceStep.outputs,
        conditions: sourceStep.conditions,
        next_steps: sourceStep.next_steps,
        error_handler: sourceStep.error_handler,
        timeout: sourceStep.timeout,
        retry_config: sourceStep.retry_config,
        flags: sourceStep.flags,
        order: sourceStep.order,
        is_enabled: sourceStep.is_enabled
      });

      copiedSteps.push(copiedStep);
    }

    // Log audit event
    await auditService.log({
      eventType: 'step_cross_workflow_copy',
      workflowId: targetWorkflowId,
      userId: req.user.id,
      success: true,
      metadata: {
        sourceWorkflowId,
        targetWorkflowId,
        stepsCopied: copiedSteps.length
      }
    });

    logger.info('Steps copied between workflows', {
      sourceWorkflowId,
      targetWorkflowId,
      stepsCopied: copiedSteps.length,
      userId: req.user.id
    });

    res.status(201).json({
      success: true,
      data: {
        copiedSteps,
        sourceWorkflowId,
        targetWorkflowId
      },
      message: `Copied ${copiedSteps.length} steps to target workflow`
    });
  } catch (error) {
    logger.error('Failed to copy steps between workflows', {
      error: error.message,
      sourceWorkflowId: req.params.sourceWorkflowId,
      targetWorkflowId: req.params.targetWorkflowId,
      userId: req.user.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to copy steps between workflows'
    });
  }
});

module.exports = router;
