/**
 * ═══════════════════════════════════════════════════════════
 * Git Runners API Routes
 * CI/CD runner management, cache, and artifacts
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const GitRunnerService = require('../services/GitRunnerService');

// Initialize service
let runnerService;
const getService = (req) => {
  if (!runnerService) {
    const models = require('../models');
    runnerService = new GitRunnerService(models);
  }
  return runnerService;
};

const getUserId = (req) => {
  return req.user?.id || req.userId || null;
};

// ═══════════════════════════════════════════════════════════
// Runner Management Routes
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/git/runners
 * Get all runners with optional filters
 */
router.get('/', async (req, res) => {
  try {
    const service = getService(req);
    const { runnerType, active, tags } = req.query;

    const filters = {};
    if (runnerType) filters.runnerType = runnerType;
    if (active !== undefined) filters.active = active === 'true';
    if (tags) filters.tags = tags.split(',');

    const runners = await service.getRunners(filters);

    res.json({
      success: true,
      data: runners
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/git/runners/:id
 * Get runner by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const service = getService(req);
    const runner = await service.getRunner(req.params.id);

    res.json({
      success: true,
      data: runner
    });
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message.includes('not found') ? 'NOT_FOUND' : 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * POST /api/git/runners/register
 * Register new runner
 */
router.post('/register', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    const runner = await service.registerRunner(req.body, userId);

    res.status(201).json({
      success: true,
      data: runner
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.message
    });
  }
});

/**
 * PUT /api/git/runners/:id
 * Update runner
 */
router.put('/:id', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    const runner = await service.updateRunner(req.params.id, req.body, userId);

    res.json({
      success: true,
      data: runner
    });
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 400).json({
      success: false,
      error: error.message.includes('not found') ? 'NOT_FOUND' : 'VALIDATION_ERROR',
      message: error.message
    });
  }
});

/**
 * DELETE /api/git/runners/:id
 * Delete runner
 */
router.delete('/:id', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    const result = await service.deleteRunner(req.params.id, userId);

    res.json(result);
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message.includes('not found') ? 'NOT_FOUND' : 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * POST /api/git/runners/:id/heartbeat
 * Update runner heartbeat
 */
router.post('/:id/heartbeat', async (req, res) => {
  try {
    const service = getService(req);

    const runner = await service.updateRunnerHeartbeat(req.params.id, req.body);

    res.json({
      success: true,
      data: runner
    });
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message.includes('not found') ? 'NOT_FOUND' : 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/git/runners/available
 * Get available runner for job
 */
router.get('/available/query', async (req, res) => {
  try {
    const service = getService(req);
    const { tags, runnerType } = req.query;

    const requiredTags = tags ? tags.split(',') : [];

    const runner = await service.getAvailableRunner(requiredTags, runnerType);

    if (!runner) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'No available runner found matching criteria'
      });
    }

    res.json({
      success: true,
      data: runner
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/git/runners/stats
 * Get runner statistics
 */
router.get('/stats/overview', async (req, res) => {
  try {
    const service = getService(req);
    const stats = await service.getRunnerStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
// Pipeline Cache Routes
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/git/runners/cache
 * Store cache entry
 */
router.post('/cache', async (req, res) => {
  try {
    const service = getService(req);
    const { repositoryId } = req.body;

    if (!repositoryId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'repositoryId is required'
      });
    }

    const cache = await service.storeCache(repositoryId, req.body);

    res.status(201).json({
      success: true,
      data: cache
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/git/runners/cache/:repositoryId
 * Get cache entry
 */
router.get('/cache/:repositoryId', async (req, res) => {
  try {
    const service = getService(req);
    const { repositoryId } = req.params;
    const { key, scope, scopeValue } = req.query;

    if (!key) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'key query parameter is required'
      });
    }

    const cache = await service.getCache(
      repositoryId,
      key,
      scope || 'branch',
      scopeValue || null
    );

    if (!cache) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Cache entry not found or expired'
      });
    }

    res.json({
      success: true,
      data: cache
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * DELETE /api/git/runners/cache/:cacheId
 * Delete cache entry
 */
router.delete('/cache/:cacheId', async (req, res) => {
  try {
    const service = getService(req);

    const result = await service.deleteCache(req.params.cacheId);

    res.json(result);
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message.includes('not found') ? 'NOT_FOUND' : 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * DELETE /api/git/runners/cache/repository/:repositoryId
 * Clear repository cache
 */
router.delete('/cache/repository/:repositoryId', async (req, res) => {
  try {
    const service = getService(req);
    const { scope } = req.query;

    const result = await service.clearRepositoryCache(req.params.repositoryId, scope);

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * POST /api/git/runners/cache/cleanup
 * Cleanup expired cache entries
 */
router.post('/cache/cleanup', async (req, res) => {
  try {
    const service = getService(req);

    const result = await service.cleanupExpiredCache();

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/git/runners/cache/stats/:repositoryId?
 * Get cache statistics
 */
router.get('/cache/stats/:repositoryId?', async (req, res) => {
  try {
    const service = getService(req);
    const { repositoryId } = req.params;

    const stats = await service.getCacheStats(repositoryId || null);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
// Artifact Routes
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/git/runners/artifacts
 * Store pipeline artifact
 */
router.post('/artifacts', async (req, res) => {
  try {
    const service = getService(req);
    const { pipelineRunId } = req.body;

    if (!pipelineRunId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'pipelineRunId is required'
      });
    }

    const artifact = await service.storeArtifact(pipelineRunId, req.body);

    res.status(201).json({
      success: true,
      data: artifact
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/git/runners/artifacts/pipeline/:pipelineRunId
 * Get artifacts for pipeline run
 */
router.get('/artifacts/pipeline/:pipelineRunId', async (req, res) => {
  try {
    const service = getService(req);
    const artifacts = await service.getArtifacts(req.params.pipelineRunId);

    res.json({
      success: true,
      data: artifacts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/git/runners/artifacts/:artifactId
 * Get artifact by ID (increments download count)
 */
router.get('/artifacts/:artifactId', async (req, res) => {
  try {
    const service = getService(req);
    const artifact = await service.getArtifact(req.params.artifactId);

    res.json({
      success: true,
      data: artifact
    });
  } catch (error) {
    res.status(error.message.includes('not found') || error.message.includes('expired') ? 404 : 500).json({
      success: false,
      error: error.message.includes('not found') || error.message.includes('expired') ? 'NOT_FOUND' : 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * DELETE /api/git/runners/artifacts/:artifactId
 * Delete artifact
 */
router.delete('/artifacts/:artifactId', async (req, res) => {
  try {
    const service = getService(req);

    const result = await service.deleteArtifact(req.params.artifactId);

    res.json(result);
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message.includes('not found') ? 'NOT_FOUND' : 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * POST /api/git/runners/artifacts/cleanup
 * Cleanup expired artifacts
 */
router.post('/artifacts/cleanup', async (req, res) => {
  try {
    const service = getService(req);

    const result = await service.cleanupExpiredArtifacts();

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

module.exports = router;
