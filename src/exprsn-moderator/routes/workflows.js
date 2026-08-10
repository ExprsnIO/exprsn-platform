/**
 * ═══════════════════════════════════════════════════════════
 * Workflow Integration Routes
 * Handles workflow management and automated moderation
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const workflowService = require('../services/workflowIntegration');
const logger = require('../src/utils/logger');

/**
 * GET /api/workflows
 * List all active moderation workflows
 */
router.get('/', async (req, res) => {
  try {
    const workflows = await workflowService.listActiveWorkflows();

    res.json({
      success: true,
      workflows,
      count: workflows.length
    });

  } catch (error) {
    logger.error('Failed to list workflows', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to list workflows'
    });
  }
});

/**
 * GET /api/workflows/active
 * Get active workflows for dashboard display
 */
router.get('/active', async (req, res) => {
  try {
    const workflows = await workflowService.listActiveWorkflows();

    // Format for dashboard display
    const formatted = workflows.map(wf => ({
      id: wf.id,
      name: wf.name,
      description: wf.description,
      enabled: wf.enabled,
      executionCount: wf.executionCount || 0,
      updatedAt: wf.updatedAt
    }));

    res.json(formatted);

  } catch (error) {
    logger.error('Failed to get active workflows', { error: error.message });
    res.status(500).json([]);
  }
});

/**
 * POST /api/workflows
 * Create a new moderation workflow
 */
router.post('/', async (req, res) => {
  try {
    const { name, description, trigger, steps, enabled, tags } = req.body;

    // Validation
    if (!name || !steps || !Array.isArray(steps)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, steps'
      });
    }

    const result = await workflowService.createWorkflow({
      name,
      description,
      trigger,
      steps,
      enabled,
      tags
    });

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(500).json(result);
    }

  } catch (error) {
    logger.error('Failed to create workflow', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to create workflow'
    });
  }
});

/**
 * PUT /api/workflows/:id
 * Update a workflow
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const result = await workflowService.updateWorkflow(id, updates);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }

  } catch (error) {
    logger.error('Failed to update workflow', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to update workflow'
    });
  }
});

/**
 * DELETE /api/workflows/:id
 * Delete a workflow
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await workflowService.deleteWorkflow(id);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }

  } catch (error) {
    logger.error('Failed to delete workflow', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to delete workflow'
    });
  }
});

/**
 * POST /api/workflows/:id/execute
 * Execute a workflow manually
 */
router.post('/:id/execute', async (req, res) => {
  try {
    const { id } = req.params;
    const { data } = req.body;

    const result = await workflowService.executeWorkflow(id, data);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }

  } catch (error) {
    logger.error('Failed to execute workflow', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to execute workflow'
    });
  }
});

/**
 * POST /api/workflows/trigger/:id
 * Trigger a specific workflow (alias for execute)
 */
router.post('/trigger/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const result = await workflowService.executeWorkflow(id, data);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }

  } catch (error) {
    logger.error('Failed to trigger workflow', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to trigger workflow'
    });
  }
});

/**
 * GET /api/workflows/executions/:executionId
 * Get workflow execution status
 */
router.get('/executions/:executionId', async (req, res) => {
  try {
    const { executionId } = req.params;

    const result = await workflowService.getExecutionStatus(executionId);

    if (result.success) {
      res.json(result.execution);
    } else {
      res.status(404).json({
        success: false,
        error: 'Execution not found'
      });
    }

  } catch (error) {
    logger.error('Failed to get execution status', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get execution status'
    });
  }
});

/**
 * POST /api/workflows/callback
 * Handle callbacks from Workflow service
 */
router.post('/callback', async (req, res) => {
  try {
    const data = req.body;

    logger.info('Received workflow callback', {
      executionId: data.executionId,
      workflowId: data.workflowId
    });

    const result = await workflowService.handleCallback(data);

    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(500).json(result);
    }

  } catch (error) {
    logger.error('Failed to handle callback', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to handle callback'
    });
  }
});

/**
 * POST /api/workflows/setup-defaults
 * Create default moderation workflows
 */
router.post('/setup-defaults', async (req, res) => {
  try {
    const results = await workflowService.createDefaultWorkflows();

    const successCount = results.filter(r => r.success).length;

    res.json({
      success: true,
      created: successCount,
      total: results.length,
      results
    });

  } catch (error) {
    logger.error('Failed to setup defaults', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to setup default workflows'
    });
  }
});

/**
 * POST /api/moderate/auto
 * Trigger automated moderation workflow for content
 */
router.post('/moderate/auto', async (req, res) => {
  try {
    const { contentId, contentType, content, authorId, metadata } = req.body;

    // Validation
    if (!contentId || !contentType || !content) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: contentId, contentType, content'
      });
    }

    const result = await workflowService.triggerModerationWorkflow(
      {
        id: contentId,
        type: contentType,
        text: content,
        authorId,
        metadata
      },
      req.body.context || {}
    );

    if (result.success) {
      res.json({
        success: true,
        message: 'Moderation workflow triggered',
        executionId: result.executionId,
        workflowId: result.workflowId
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to trigger workflow',
        details: result.error
      });
    }

  } catch (error) {
    logger.error('Failed to auto-moderate', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to trigger automated moderation'
    });
  }
});

module.exports = router;
