/**
 * ═══════════════════════════════════════════════════════════════════════
 * Health Check Routes
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const db = require('../models');
const storage = require('../storage');
const logger = require('../utils/logger');

/**
 * GET /health - Service health check
 */
router.get('/', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      service: 'FileVault',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {}
    };

    // Check database
    try {
      await db.sequelize.authenticate();
      health.checks.database = { status: 'healthy' };
    } catch (error) {
      health.checks.database = {
        status: 'unhealthy',
        error: error.message
      };
      health.status = 'degraded';
    }

    // Check storage backends
    try {
      const storageHealth = await storage.healthCheck();
      health.checks.storage = storageHealth;

      if (!storageHealth.healthy) {
        health.status = 'degraded';
      }
    } catch (error) {
      health.checks.storage = {
        healthy: false,
        error: error.message
      };
      health.status = 'degraded';
    }

    // Memory usage
    const memUsage = process.memoryUsage();
    health.checks.memory = {
      status: 'healthy',
      usage: {
        rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB'
      }
    };

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

/**
 * GET /health/db - Database health check
 */
router.get('/db', async (req, res) => {
  try {
    await db.sequelize.authenticate();

    const [[result]] = await db.sequelize.query('SELECT NOW() as now');

    res.json({
      status: 'healthy',
      database: 'PostgreSQL',
      timestamp: result.now,
      connection: 'active'
    });
  } catch (error) {
    logger.error('Database health check failed', { error: error.message });
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

/**
 * GET /health/storage - Storage backends health check
 */
router.get('/storage', async (req, res) => {
  try {
    const health = await storage.healthCheck();

    const statusCode = health.healthy ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Storage health check failed', { error: error.message });
    res.status(503).json({
      healthy: false,
      error: error.message
    });
  }
});

/**
 * GET /health/ready - Readiness probe (for Kubernetes)
 */
router.get('/ready', async (req, res) => {
  try {
    // Check if service is ready to accept traffic
    await db.sequelize.authenticate();

    res.json({
      ready: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      ready: false,
      error: error.message
    });
  }
});

/**
 * GET /health/live - Liveness probe (for Kubernetes)
 */
router.get('/live', (req, res) => {
  // Simple liveness check - if we can respond, we're alive
  res.json({
    alive: true,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
