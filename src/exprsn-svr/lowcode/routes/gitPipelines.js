/**
 * ═══════════════════════════════════════════════════════════
 * Git Pipelines API Routes
 * CI/CD pipeline management and execution
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const GitPipelineService = require('../services/GitPipelineService');
const logger = require('../../utils/logger');

/**
 * Create pipeline
 * POST /api/git/repositories/:repoId/pipelines
 */
router.post('/:repoId/pipelines', async (req, res) => {
  try {
    const { name, description, triggerOn, branches, stages, environmentVariables, workflowId, timeoutMinutes } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Pipeline name is required'
      });
    }

    const createdBy = req.user?.id || req.body.createdBy;

    const pipeline = await GitPipelineService.createPipeline(req.params.repoId, {
      name,
      description,
      triggerOn,
      branches,
      stages,
      environmentVariables,
      workflowId,
      timeoutMinutes,
      createdBy
    });

    res.status(201).json({
      success: true,
      data: pipeline
    });
  } catch (error) {
    logger.error('Failed to create pipeline:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * List pipelines
 * GET /api/git/repositories/:repoId/pipelines
 */
router.get('/:repoId/pipelines', async (req, res) => {
  try {
    const { active, limit, offset } = req.query;

    const result = await GitPipelineService.listPipelines(req.params.repoId, {
      active: active === 'true',
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Failed to list pipelines:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Get pipeline
 * GET /api/git/pipelines/:pipelineId
 */
router.get('/pipelines/:pipelineId', async (req, res) => {
  try {
    const pipeline = await GitPipelineService.getPipeline(req.params.pipelineId);

    if (!pipeline) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Pipeline not found'
      });
    }

    res.json({
      success: true,
      data: pipeline
    });
  } catch (error) {
    logger.error('Failed to get pipeline:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Update pipeline
 * PATCH /api/git/pipelines/:pipelineId
 */
router.patch('/pipelines/:pipelineId', async (req, res) => {
  try {
    const updates = req.body;

    const pipeline = await GitPipelineService.updatePipeline(req.params.pipelineId, updates);

    res.json({
      success: true,
      data: pipeline
    });
  } catch (error) {
    logger.error('Failed to update pipeline:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Delete pipeline
 * DELETE /api/git/pipelines/:pipelineId
 */
router.delete('/pipelines/:pipelineId', async (req, res) => {
  try {
    await GitPipelineService.deletePipeline(req.params.pipelineId);

    res.json({
      success: true,
      message: 'Pipeline deleted'
    });
  } catch (error) {
    logger.error('Failed to delete pipeline:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Trigger pipeline
 * POST /api/git/pipelines/:pipelineId/trigger
 */
router.post('/pipelines/:pipelineId/trigger', async (req, res) => {
  try {
    const { trigger, branch, commitSha, prId } = req.body;

    if (!trigger || !branch || !commitSha) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Trigger, branch, and commit SHA are required'
      });
    }

    const startedBy = req.user?.id || req.body.startedBy;

    const run = await GitPipelineService.triggerPipeline(req.params.pipelineId, {
      trigger,
      branch,
      commitSha,
      prId,
      startedBy
    });

    if (!run) {
      return res.json({
        success: true,
        message: 'Pipeline not triggered (conditions not met)'
      });
    }

    res.status(201).json({
      success: true,
      data: run
    });
  } catch (error) {
    logger.error('Failed to trigger pipeline:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Cancel pipeline run
 * POST /api/git/pipeline-runs/:runId/cancel
 */
router.post('/pipeline-runs/:runId/cancel', async (req, res) => {
  try {
    const run = await GitPipelineService.cancelPipeline(req.params.runId);

    res.json({
      success: true,
      data: run
    });
  } catch (error) {
    logger.error('Failed to cancel pipeline:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Get pipeline run logs
 * GET /api/git/pipeline-runs/:runId/logs
 */
router.get('/pipeline-runs/:runId/logs', async (req, res) => {
  try {
    const logs = await GitPipelineService.getPipelineLogs(req.params.runId);

    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    logger.error('Failed to get pipeline logs:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Get pipeline statistics
 * GET /api/git/pipelines/:pipelineId/stats
 */
router.get('/pipelines/:pipelineId/stats', async (req, res) => {
  try {
    const stats = await GitPipelineService.getPipelineStats(req.params.pipelineId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get pipeline stats:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

module.exports = router;
