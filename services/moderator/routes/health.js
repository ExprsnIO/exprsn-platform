/**
 * ═══════════════════════════════════════════════════════════
 * Health Check Routes
 * Service health and status endpoints
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../models');
const aiProviderFactory = require('../src/ai-providers');
const logger = require('../src/utils/logger');

/**
 * GET /health
 * Basic health check
 */
router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'exprsn-moderator',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /health/db
 * Database health check
 */
router.get('/db', async (req, res) => {
  try {
    await pool.query('SELECT 1');

    res.json({
      status: 'healthy',
      database: 'connected'
    });
  } catch (error) {
    logger.error('Database health check failed', { error: error.message });
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message
    });
  }
});

/**
 * GET /health/ai-providers
 * AI providers health check
 */
router.get('/ai-providers', async (req, res) => {
  try {
    const status = await aiProviderFactory.getProvidersStatus();

    const allHealthy = Object.values(status).every(s => s.available);

    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'healthy' : 'degraded',
      providers: status
    });
  } catch (error) {
    logger.error('AI providers health check failed', { error: error.message });
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

module.exports = router;
