/**
 * ═══════════════════════════════════════════════════════════
 * Git Environments API Routes
 * Deployment environments, variables, and registry configuration
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const GitEnvironmentService = require('../services/GitEnvironmentService');

// Initialize service
let environmentService;
const getService = (req) => {
  if (!environmentService) {
    const models = require('../models');
    environmentService = new GitEnvironmentService(models);
  }
  return environmentService;
};

const getUserId = (req) => {
  return req.user?.id || req.userId || null;
};

// ═══════════════════════════════════════════════════════════
// Deployment Environment Routes
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/git/environments/repositories/:repositoryId
 * Get all environments for repository
 */
router.get('/repositories/:repositoryId', async (req, res) => {
  try {
    const service = getService(req);
    const environments = await service.getEnvironments(req.params.repositoryId);

    res.json({
      success: true,
      data: environments
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
 * GET /api/git/environments/:id
 * Get environment by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const service = getService(req);
    const environment = await service.getEnvironment(req.params.id);

    res.json({
      success: true,
      data: environment
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
 * POST /api/git/environments
 * Create deployment environment
 */
router.post('/', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);
    const {
      repositoryId,
      name,
      description,
      deploymentBranch,
      requireApproval,
      approvers,
      autoDeployEnabled
    } = req.body;

    if (!repositoryId || !name) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'repositoryId and name are required'
      });
    }

    const environment = await service.createEnvironment(repositoryId, {
      name,
      description,
      deploymentBranch,
      requireApproval,
      approvers,
      autoDeployEnabled,
      userId
    });

    res.status(201).json({
      success: true,
      data: environment
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
 * PUT /api/git/environments/:id
 * Update environment
 */
router.put('/:id', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    const environment = await service.updateEnvironment(
      req.params.id,
      req.body,
      userId
    );

    res.json({
      success: true,
      data: environment
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
 * DELETE /api/git/environments/:id
 * Delete environment
 */
router.delete('/:id', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    const result = await service.deleteEnvironment(req.params.id, userId);

    res.json(result);
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message.includes('not found') ? 'NOT_FOUND' : 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
// Environment Variable Routes
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/git/environments/:environmentId/variables
 * Get all variables for environment
 */
router.get('/:environmentId/variables', async (req, res) => {
  try {
    const service = getService(req);
    const variables = await service.getEnvironmentVariables(req.params.environmentId);

    res.json({
      success: true,
      data: variables
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
 * GET /api/git/environments/:environmentId/variables/effective
 * Get effective variables (merged global → repo → env)
 */
router.get('/:environmentId/variables/effective', async (req, res) => {
  try {
    const service = getService(req);
    const { repositoryId } = req.query;

    if (!repositoryId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'repositoryId query parameter is required'
      });
    }

    const variables = await service.getEffectiveVariables(
      repositoryId,
      req.params.environmentId
    );

    res.json({
      success: true,
      data: variables
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
 * POST /api/git/environments/variables
 * Set environment variable
 */
router.post('/variables', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);
    const {
      key,
      value,
      encrypted,
      scope,
      repositoryId,
      environmentId,
      masked,
      protected: isProtected
    } = req.body;

    if (!key || !value || !scope) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'key, value, and scope are required'
      });
    }

    const variable = await service.setEnvironmentVariable({
      key,
      value,
      encrypted,
      scope,
      repositoryId,
      environmentId,
      masked,
      protected: isProtected,
      userId
    });

    res.status(201).json({
      success: true,
      data: variable
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
 * PUT /api/git/environments/variables/:id
 * Update environment variable
 */
router.put('/variables/:id', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    const variable = await service.updateEnvironmentVariable(
      req.params.id,
      req.body,
      userId
    );

    res.json({
      success: true,
      data: variable
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
 * DELETE /api/git/environments/variables/:id
 * Delete environment variable
 */
router.delete('/variables/:id', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    const result = await service.deleteEnvironmentVariable(req.params.id, userId);

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
 * GET /api/git/environments/variables/repositories/:repositoryId
 * Get repository-scoped variables
 */
router.get('/variables/repositories/:repositoryId', async (req, res) => {
  try {
    const service = getService(req);
    const variables = await service.getRepositoryVariables(req.params.repositoryId);

    res.json({
      success: true,
      data: variables
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
 * GET /api/git/environments/variables/global
 * Get global variables
 */
router.get('/variables/global', async (req, res) => {
  try {
    const service = getService(req);
    const variables = await service.getGlobalVariables();

    res.json({
      success: true,
      data: variables
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
// Registry Configuration Routes
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/git/environments/registries
 * Get all registry configurations
 */
router.get('/registries', async (req, res) => {
  try {
    const service = getService(req);
    const { registryType, repositoryId } = req.query;

    const filters = {};
    if (registryType) filters.registryType = registryType;
    if (repositoryId) filters.repositoryId = repositoryId;

    const registries = await service.getRegistries(filters);

    res.json({
      success: true,
      data: registries
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
 * GET /api/git/environments/registries/:id
 * Get registry configuration by ID
 */
router.get('/registries/:id', async (req, res) => {
  try {
    const service = getService(req);
    const registry = await service.getRegistry(req.params.id);

    res.json({
      success: true,
      data: registry
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
 * POST /api/git/environments/registries
 * Create registry configuration
 */
router.post('/registries', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);
    const {
      name,
      registryType,
      url,
      username,
      password,
      repositoryId,
      scope,
      config
    } = req.body;

    if (!name || !registryType || !url) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'name, registryType, and url are required'
      });
    }

    const registry = await service.createRegistryConfig({
      name,
      registryType,
      url,
      username,
      password,
      repositoryId,
      scope,
      config,
      userId
    });

    res.status(201).json({
      success: true,
      data: registry
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
 * PUT /api/git/environments/registries/:id
 * Update registry configuration
 */
router.put('/registries/:id', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    const registry = await service.updateRegistryConfig(
      req.params.id,
      req.body,
      userId
    );

    res.json({
      success: true,
      data: registry
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
 * DELETE /api/git/environments/registries/:id
 * Delete registry configuration
 */
router.delete('/registries/:id', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    const result = await service.deleteRegistryConfig(req.params.id, userId);

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
 * POST /api/git/environments/registries/:id/test
 * Test registry connection
 */
router.post('/registries/:id/test', async (req, res) => {
  try {
    const service = getService(req);
    const result = await service.testRegistryConnection(req.params.id);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message.includes('not found') ? 'NOT_FOUND' : 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
// Deployment Tracking Routes
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/git/environments/:environmentId/deployments
 * Get deployment history for environment
 */
router.get('/:environmentId/deployments', async (req, res) => {
  try {
    const service = getService(req);
    const { limit, offset, status } = req.query;

    const deployments = await service.getDeploymentHistory(req.params.environmentId, {
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0,
      status
    });

    res.json({
      success: true,
      data: deployments
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
 * GET /api/git/environments/:environmentId/deployments/latest
 * Get latest deployment for environment
 */
router.get('/:environmentId/deployments/latest', async (req, res) => {
  try {
    const service = getService(req);
    const deployment = await service.getLatestDeployment(req.params.environmentId);

    if (!deployment) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'No deployments found for this environment'
      });
    }

    res.json({
      success: true,
      data: deployment
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
 * GET /api/git/environments/repositories/:repositoryId/deployments/stats
 * Get deployment statistics for repository
 */
router.get('/repositories/:repositoryId/deployments/stats', async (req, res) => {
  try {
    const service = getService(req);
    const { days } = req.query;

    const stats = await service.getDeploymentStats(
      req.params.repositoryId,
      parseInt(days) || 30
    );

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message.includes('not found') ? 'NOT_FOUND' : 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

module.exports = router;
