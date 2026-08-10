/**
 * ═══════════════════════════════════════════════════════════
 * Git Security API Routes
 * Security scanning configuration and vulnerability tracking
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const GitSecurityService = require('../services/GitSecurityService');

// Initialize service
let securityService;
const getService = (req) => {
  if (!securityService) {
    const models = require('../models');
    securityService = new GitSecurityService(models);
  }
  return securityService;
};

const getUserId = (req) => {
  return req.user?.id || req.userId || null;
};

// ═══════════════════════════════════════════════════════════
// Scan Configuration Routes
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/git/security/scan-configs/repositories/:repositoryId
 * Get all scan configurations for repository
 */
router.get('/scan-configs/repositories/:repositoryId', async (req, res) => {
  try {
    const service = getService(req);
    const { scanType, enabled } = req.query;

    const filters = {};
    if (scanType) filters.scanType = scanType;
    if (enabled !== undefined) filters.enabled = enabled === 'true';

    const configs = await service.getScanConfigs(req.params.repositoryId, filters);

    res.json({
      success: true,
      data: configs
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
 * GET /api/git/security/scan-configs/:id
 * Get scan configuration by ID
 */
router.get('/scan-configs/:id', async (req, res) => {
  try {
    const service = getService(req);
    const config = await service.getScanConfig(req.params.id);

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
 * POST /api/git/security/scan-configs
 * Create security scan configuration
 */
router.post('/scan-configs', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);
    const { repositoryId, scanType, severityThreshold, enabled, schedule, config } = req.body;

    if (!repositoryId || !scanType) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'repositoryId and scanType are required'
      });
    }

    const scanConfig = await service.createScanConfig(repositoryId, {
      scanType,
      severityThreshold,
      enabled,
      schedule,
      config,
      userId
    });

    res.status(201).json({
      success: true,
      data: scanConfig
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
 * PUT /api/git/security/scan-configs/:id
 * Update scan configuration
 */
router.put('/scan-configs/:id', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    const config = await service.updateScanConfig(req.params.id, req.body, userId);

    res.json({
      success: true,
      data: config
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
 * DELETE /api/git/security/scan-configs/:id
 * Delete scan configuration
 */
router.delete('/scan-configs/:id', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    const result = await service.deleteScanConfig(req.params.id, userId);

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
// Scan Result Routes
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/git/security/scan-results
 * Record scan result
 */
router.post('/scan-results', async (req, res) => {
  try {
    const service = getService(req);
    const { configId, commitSha, branch, status, vulnerabilities, metadata } = req.body;

    if (!configId || !commitSha) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'configId and commitSha are required'
      });
    }

    const result = await service.recordScanResult({
      configId,
      commitSha,
      branch,
      status,
      vulnerabilities,
      metadata
    });

    res.status(201).json({
      success: true,
      data: result
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
 * GET /api/git/security/scan-results/:configId
 * Get scan results for configuration
 */
router.get('/scan-results/:configId', async (req, res) => {
  try {
    const service = getService(req);
    const { limit, offset, status } = req.query;

    const results = await service.getScanResults(req.params.configId, {
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0,
      status
    });

    res.json({
      success: true,
      data: results
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
 * GET /api/git/security/scan-results/:id/details
 * Get scan result details by ID
 */
router.get('/scan-results/:id/details', async (req, res) => {
  try {
    const service = getService(req);
    const result = await service.getScanResult(req.params.id);

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

/**
 * GET /api/git/security/scan-results/commits/:commitSha
 * Get all scan results for a commit
 */
router.get('/scan-results/commits/:commitSha', async (req, res) => {
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

    const results = await service.getCommitScanResults(repositoryId, req.params.commitSha);

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

// ═══════════════════════════════════════════════════════════
// Vulnerability Management Routes
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/git/security/repositories/:repositoryId/vulnerabilities
 * Get latest vulnerabilities for repository
 */
router.get('/repositories/:repositoryId/vulnerabilities', async (req, res) => {
  try {
    const service = getService(req);
    const { severity, status } = req.query;

    const filters = {};
    if (severity) filters.severity = severity;
    if (status) filters.status = status;

    const vulnerabilities = await service.getLatestVulnerabilities(
      req.params.repositoryId,
      filters
    );

    res.json({
      success: true,
      data: vulnerabilities
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
 * GET /api/git/security/repositories/:repositoryId/trends
 * Get vulnerability trends
 */
router.get('/repositories/:repositoryId/trends', async (req, res) => {
  try {
    const service = getService(req);
    const { days } = req.query;

    const trends = await service.getVulnerabilityTrends(
      req.params.repositoryId,
      parseInt(days) || 30
    );

    res.json({
      success: true,
      data: trends
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
 * GET /api/git/security/repositories/:repositoryId/score
 * Get security score for repository
 */
router.get('/repositories/:repositoryId/score', async (req, res) => {
  try {
    const service = getService(req);
    const score = await service.getSecurityScore(req.params.repositoryId);

    res.json({
      success: true,
      data: score
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
 * POST /api/git/security/vulnerabilities/:id/dismiss
 * Dismiss a vulnerability
 */
router.post('/vulnerabilities/:id/dismiss', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Dismissal reason is required'
      });
    }

    const result = await service.dismissVulnerability(req.params.id, reason, userId);

    res.json({
      success: true,
      data: result
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
 * POST /api/git/security/vulnerabilities/:id/reopen
 * Reopen a dismissed vulnerability
 */
router.post('/vulnerabilities/:id/reopen', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    const result = await service.reopenVulnerability(req.params.id, userId);

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
// Statistics and Reporting Routes
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/git/security/repositories/:repositoryId/stats
 * Get security statistics for repository
 */
router.get('/repositories/:repositoryId/stats', async (req, res) => {
  try {
    const service = getService(req);
    const stats = await service.getRepositorySecurityStats(req.params.repositoryId);

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

/**
 * GET /api/git/security/repositories/:repositoryId/compliance
 * Check repository security compliance
 */
router.get('/repositories/:repositoryId/compliance', async (req, res) => {
  try {
    const service = getService(req);
    const compliance = await service.checkSecurityCompliance(req.params.repositoryId);

    res.json({
      success: true,
      data: compliance
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
