/**
 * ═══════════════════════════════════════════════════════════
 * Git Setup API Routes
 * System configuration, templates, and global settings
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const GitSetupService = require('../services/GitSetupService');

// Initialize service
let setupService;
const getService = (req) => {
  if (!setupService) {
    const models = require('../models');
    setupService = new GitSetupService(models);
  }
  return setupService;
};

// Middleware to extract user from request (assumes authentication middleware)
const getUserId = (req) => {
  return req.user?.id || req.userId || null;
};

// ═══════════════════════════════════════════════════════════
// System Configuration Routes
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/git/setup/config
 * Get all system configurations or filter by type
 */
router.get('/config', async (req, res) => {
  try {
    const service = getService(req);
    const { type } = req.query;

    const configs = type
      ? await service.getConfigsByType(type)
      : await service.getAllConfigs();

    res.json({
      success: true,
      data: configs
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
 * GET /api/git/setup/config/:key
 * Get specific configuration by key
 */
router.get('/config/:key', async (req, res) => {
  try {
    const service = getService(req);
    const config = await service.getConfig(req.params.key);

    res.json({
      success: true,
      data: config
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
 * POST /api/git/setup/config
 * Set or update configuration
 */
router.post('/config', async (req, res) => {
  try {
    const service = getService(req);
    const { key, value, type, encrypted } = req.body;
    const userId = getUserId(req);

    if (!key || !value) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Key and value are required'
      });
    }

    const config = await service.setConfig(key, value, {
      type: type || 'system',
      encrypted: encrypted || false,
      updatedBy: userId
    });

    res.json({
      success: true,
      data: config
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
 * PUT /api/git/setup/config/bulk
 * Bulk update configurations
 */
router.put('/config/bulk', async (req, res) => {
  try {
    const service = getService(req);
    const { configs } = req.body;
    const userId = getUserId(req);

    if (!Array.isArray(configs)) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Configs must be an array'
      });
    }

    const results = await service.bulkUpdateConfigs(configs, userId);

    res.json({
      success: true,
      data: results
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
 * DELETE /api/git/setup/config/:key
 * Delete configuration
 */
router.delete('/config/:key', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    const result = await service.deleteConfig(req.params.key, userId);

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
 * GET /api/git/setup/config/validate
 * Validate system configuration
 */
router.get('/config/validate', async (req, res) => {
  try {
    const service = getService(req);
    const validation = await service.validateConfiguration();

    res.json({
      success: true,
      data: validation
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
// Repository Template Routes
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/git/setup/templates/repositories
 * Get all repository templates
 */
router.get('/templates/repositories', async (req, res) => {
  try {
    const service = getService(req);
    const { isPublic, language } = req.query;

    const filters = {};
    if (isPublic !== undefined) filters.isPublic = isPublic === 'true';
    if (language) filters.language = language;

    const templates = await service.getRepositoryTemplates(filters);

    res.json({
      success: true,
      data: templates
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
 * GET /api/git/setup/templates/repositories/:id
 * Get repository template by ID
 */
router.get('/templates/repositories/:id', async (req, res) => {
  try {
    const service = getService(req);
    const template = await service.getRepositoryTemplate(req.params.id);

    res.json({
      success: true,
      data: template
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
 * POST /api/git/setup/templates/repositories
 * Create repository template
 */
router.post('/templates/repositories', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    const template = await service.createRepositoryTemplate(req.body, userId);

    res.status(201).json({
      success: true,
      data: template
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
 * PUT /api/git/setup/templates/repositories/:id
 * Update repository template
 */
router.put('/templates/repositories/:id', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    const template = await service.updateRepositoryTemplate(
      req.params.id,
      req.body,
      userId
    );

    res.json({
      success: true,
      data: template
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
 * DELETE /api/git/setup/templates/repositories/:id
 * Delete repository template
 */
router.delete('/templates/repositories/:id', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    const result = await service.deleteRepositoryTemplate(req.params.id, userId);

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
// Issue Template Routes
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/git/setup/templates/issues
 * Get issue templates (global or for specific repository)
 */
router.get('/templates/issues', async (req, res) => {
  try {
    const service = getService(req);
    const { repositoryId } = req.query;

    const templates = await service.getIssueTemplates(
      repositoryId || null
    );

    res.json({
      success: true,
      data: templates
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
 * GET /api/git/setup/templates/issues/:id
 * Get issue template by ID
 */
router.get('/templates/issues/:id', async (req, res) => {
  try {
    const service = getService(req);
    const template = await service.getIssueTemplate(req.params.id);

    res.json({
      success: true,
      data: template
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
 * POST /api/git/setup/templates/issues
 * Create issue template
 */
router.post('/templates/issues', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    const template = await service.createIssueTemplate(req.body, userId);

    res.status(201).json({
      success: true,
      data: template
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
 * PUT /api/git/setup/templates/issues/:id
 * Update issue template
 */
router.put('/templates/issues/:id', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    const template = await service.updateIssueTemplate(
      req.params.id,
      req.body,
      userId
    );

    res.json({
      success: true,
      data: template
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
 * DELETE /api/git/setup/templates/issues/:id
 * Delete issue template
 */
router.delete('/templates/issues/:id', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    const result = await service.deleteIssueTemplate(req.params.id, userId);

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
// Statistics and Health Routes
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/git/setup/stats
 * Get system statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const service = getService(req);
    const stats = await service.getSystemStats();

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

/**
 * GET /api/git/setup/audit-logs
 * Get audit logs
 */
router.get('/audit-logs', async (req, res) => {
  try {
    const service = getService(req);
    const filters = {
      userId: req.query.userId,
      entityType: req.query.entityType,
      repositoryId: req.query.repositoryId,
      action: req.query.action,
      limit: parseInt(req.query.limit) || 100,
      offset: parseInt(req.query.offset) || 0
    };

    const logs = await service.getAuditLogs(filters);

    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

module.exports = router;
