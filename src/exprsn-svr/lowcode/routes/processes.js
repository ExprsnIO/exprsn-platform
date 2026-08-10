/**
 * Process Routes
 * BPM/Workflow process definition management
 */

const express = require('express');
const router = express.Router();
const ProcessService = require('../services/ProcessService');
const { requireLowCodeAdmin } = require('../middleware/caTokenAuth');
const Joi = require('joi');

/**
 * Validation Schemas
 */
const createProcessSchema = Joi.object({
  name: Joi.string().pattern(/^[a-zA-Z][a-zA-Z0-9_-]*$/).min(1).max(255).required(),
  displayName: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(5000).allow('', null),
  category: Joi.string().max(100).allow(null),
  definition: Joi.object().required(),
  bpmnDefinition: Joi.string().allow('', null),
  inputs: Joi.array().items(Joi.object()),
  outputs: Joi.array().items(Joi.object()),
  triggers: Joi.array().items(Joi.object()),
  config: Joi.object({
    timeout: Joi.number().integer().min(1000),
    retryOnError: Joi.boolean(),
    maxRetries: Joi.number().integer().min(0).max(10)
  })
});

const updateProcessSchema = Joi.object({
  displayName: Joi.string().min(1).max(255),
  description: Joi.string().max(5000).allow('', null),
  category: Joi.string().max(100).allow(null),
  definition: Joi.object(),
  bpmnDefinition: Joi.string().allow('', null),
  inputs: Joi.array().items(Joi.object()),
  outputs: Joi.array().items(Joi.object()),
  triggers: Joi.array().items(Joi.object()),
  config: Joi.object()
}).min(1);

/**
 * GET /api/applications/:applicationId/processes
 * List all processes for an application
 */
router.get('/:applicationId/processes', async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { status, category, search, page, limit } = req.query;

    const result = await ProcessService.listProcesses(
      applicationId,
      { status, category, search },
      { page: parseInt(page) || 1, limit: parseInt(limit) || 50 }
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/applications/:applicationId/processes
 * Create a new process
 */
router.post('/:applicationId/processes', requireLowCodeAdmin, async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { error, value } = createProcessSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        details: error.details[0].message
      });
    }

    const result = await ProcessService.createProcess(applicationId, value, req.user.id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/processes/:id
 * Get a specific process
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await ProcessService.getProcess(req.params.id);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/processes/:id
 * Update a process
 */
router.put('/:id', requireLowCodeAdmin, async (req, res) => {
  try {
    const { error, value } = updateProcessSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        details: error.details[0].message
      });
    }

    const result = await ProcessService.updateProcess(req.params.id, value, req.user.id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/processes/:id/activate
 * Activate/publish a process
 */
router.post('/:id/activate', requireLowCodeAdmin, async (req, res) => {
  try {
    const result = await ProcessService.activateProcess(req.params.id, req.user.id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/processes/:id/deprecate
 * Deprecate a process
 */
router.post('/:id/deprecate', requireLowCodeAdmin, async (req, res) => {
  try {
    const result = await ProcessService.deprecateProcess(req.params.id, req.user.id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/processes/:id
 * Delete a process
 */
router.delete('/:id', requireLowCodeAdmin, async (req, res) => {
  try {
    const result = await ProcessService.deleteProcess(req.params.id, req.user.id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/processes/:id/start
 * Start a process instance
 */
router.post('/:id/start', async (req, res) => {
  try {
    const { inputData } = req.body;

    const result = await ProcessService.startProcess(req.params.id, inputData, req.user.id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/processes/:id/instances
 * List process instances
 */
router.get('/:id/instances', async (req, res) => {
  try {
    const { status, initiatedBy, page, limit } = req.query;

    const result = await ProcessService.listProcessInstances(req.params.id, {
      status,
      initiatedBy,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/processes/:id/statistics
 * Get process execution statistics
 */
router.get('/:id/statistics', async (req, res) => {
  try {
    const result = await ProcessService.getProcessStatistics(req.params.id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/instances/:instanceId
 * Get a specific process instance
 */
router.get('/instances/:instanceId', async (req, res) => {
  try {
    const result = await ProcessService.getProcessInstance(req.params.instanceId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/instances/:instanceId/complete-task
 * Complete a user task
 */
router.post('/instances/:instanceId/complete-task', async (req, res) => {
  try {
    const { taskData } = req.body;

    const result = await ProcessService.completeUserTask(
      req.params.instanceId,
      taskData,
      req.user.id
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/instances/:instanceId/cancel
 * Cancel a process instance
 */
router.post('/instances/:instanceId/cancel', async (req, res) => {
  try {
    const { reason } = req.body;

    const result = await ProcessService.cancelProcessInstance(
      req.params.instanceId,
      req.user.id,
      reason
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
