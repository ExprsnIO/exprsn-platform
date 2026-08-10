const express = require('express');
const router = express.Router();
const sequelize = require('../config/database');
const redis = require('../config/redis');
const config = require('../config');

/**
 * ═══════════════════════════════════════════════════════════
 * Health Check Routes
 * No authentication required
 * ═══════════════════════════════════════════════════════════
 */

// Basic health check
router.get('/', async (req, res) => {
  res.json({
    status: 'healthy',
    service: config.service.name,
    version: '1.0.0',
    timestamp: Date.now()
  });
});

// Database health check
router.get('/db', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({
      status: 'healthy',
      database: 'connected'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message
    });
  }
});

// Redis health check
router.get('/cache', async (req, res) => {
  try {
    await redis.ping();
    res.json({
      status: 'healthy',
      cache: 'connected'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      cache: 'disconnected',
      error: error.message
    });
  }
});

// Comprehensive health check
router.get('/all', async (req, res) => {
  const health = {
    status: 'healthy',
    service: config.service.name,
    timestamp: Date.now(),
    checks: {}
  };

  // Check database
  try {
    await sequelize.authenticate();
    health.checks.database = 'healthy';
  } catch (error) {
    health.checks.database = 'unhealthy';
    health.status = 'degraded';
  }

  // Check Redis
  try {
    await redis.ping();
    health.checks.cache = 'healthy';
  } catch (error) {
    health.checks.cache = 'unhealthy';
    health.status = 'degraded';
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

module.exports = router;
