/**
 * ═══════════════════════════════════════════════════════════════════════
 * Redis Infrastructure Routes
 * API endpoints for Redis management
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const redisManager = require('../../services/infrastructure/redisManager');
const logger = require('../../utils/logger');

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CONNECTION & HEALTH
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/infrastructure/redis/test - Test Redis connection
router.get('/test', async (req, res) => {
  try {
    const { host, port, password, db, tls } = req.query;

    const options = {};
    if (host) options.host = host;
    if (port) options.port = parseInt(port);
    if (password) options.password = password;
    if (db) options.db = parseInt(db);
    if (tls) options.tls = tls === 'true';

    const result = await redisManager.testConnection(options);

    res.json(result);
  } catch (error) {
    logger.error('Redis connection test failed:', error);
    res.status(500).json({
      success: false,
      error: 'Connection test failed',
      message: error.message
    });
  }
});

// GET /api/infrastructure/redis/info - Get server info
router.get('/info', async (req, res) => {
  try {
    const info = await redisManager.getServerInfo();

    res.json(info);
  } catch (error) {
    logger.error('Failed to get Redis info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get server info',
      message: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * KEY OPERATIONS
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/infrastructure/redis/keys - Get keys by pattern
router.get('/keys', async (req, res) => {
  try {
    const { pattern = '*', limit, cursor } = req.query;

    const options = {};
    if (limit) options.limit = parseInt(limit);
    if (cursor) options.cursor = parseInt(cursor);

    const result = await redisManager.getKeys(pattern, options);

    res.json(result);
  } catch (error) {
    logger.error('Failed to get keys:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get keys',
      message: error.message
    });
  }
});

// GET /api/infrastructure/redis/keys/:key - Get key details
router.get('/keys/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const decodedKey = decodeURIComponent(key);

    const details = await redisManager.getKeyDetails(decodedKey);

    res.json(details);
  } catch (error) {
    logger.error(`Failed to get key details for ${req.params.key}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get key details',
      message: error.message
    });
  }
});

// DELETE /api/infrastructure/redis/keys - Delete keys by pattern
router.delete('/keys', async (req, res) => {
  try {
    const { pattern } = req.body;

    if (!pattern) {
      return res.status(400).json({
        success: false,
        error: 'Pattern is required'
      });
    }

    logger.info(`Deleting keys with pattern: ${pattern}`);

    const result = await redisManager.deleteKeys(pattern);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('redis:keys-deleted', {
        pattern,
        deleted: result.deleted,
        timestamp: new Date().toISOString()
      });
    }

    res.json(result);
  } catch (error) {
    logger.error('Failed to delete keys:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete keys',
      message: error.message
    });
  }
});

// POST /api/infrastructure/redis/flush - Flush database
router.post('/flush', async (req, res) => {
  try {
    const { db } = req.body;

    logger.warn(`Flushing Redis database ${db !== undefined ? db : 'ALL'}`);

    const result = await redisManager.flushDatabase(db);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('redis:flushed', {
        database: db !== undefined ? db : 'all',
        timestamp: new Date().toISOString()
      });
    }

    res.json(result);
  } catch (error) {
    logger.error('Failed to flush database:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to flush database',
      message: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * PREFIX MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/infrastructure/redis/prefixes - Get all service prefixes
router.get('/prefixes', (req, res) => {
  try {
    res.json({
      success: true,
      prefixes: redisManager.servicePrefixes
    });
  } catch (error) {
    logger.error('Failed to get prefixes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get prefixes',
      message: error.message
    });
  }
});

// GET /api/infrastructure/redis/prefixes/:serviceId/keys - Get keys by service prefix
router.get('/prefixes/:serviceId/keys', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { pattern, limit, cursor } = req.query;

    const options = {};
    if (pattern) options.pattern = pattern;
    if (limit) options.limit = parseInt(limit);
    if (cursor) options.cursor = parseInt(cursor);

    const result = await redisManager.getServiceKeys(serviceId, options);

    res.json(result);
  } catch (error) {
    logger.error(`Failed to get keys for service ${req.params.serviceId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get service keys',
      message: error.message
    });
  }
});

// GET /api/infrastructure/redis/prefixes/memory - Get memory usage by prefix
router.get('/prefixes/memory', async (req, res) => {
  try {
    const memory = await redisManager.getMemoryByPrefix();

    res.json(memory);
  } catch (error) {
    logger.error('Failed to get memory by prefix:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get memory by prefix',
      message: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * MONITORING & STATISTICS
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/infrastructure/redis/stats/memory - Get memory statistics
router.get('/stats/memory', async (req, res) => {
  try {
    const stats = await redisManager.getMemoryStats();

    res.json(stats);
  } catch (error) {
    logger.error('Failed to get memory stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get memory statistics',
      message: error.message
    });
  }
});

// GET /api/infrastructure/redis/stats/commands - Get command statistics
router.get('/stats/commands', async (req, res) => {
  try {
    const stats = await redisManager.getCommandStats();

    res.json(stats);
  } catch (error) {
    logger.error('Failed to get command stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get command statistics',
      message: error.message
    });
  }
});

// GET /api/infrastructure/redis/connections - Get client connections
router.get('/connections', async (req, res) => {
  try {
    const connections = await redisManager.getConnections();

    res.json(connections);
  } catch (error) {
    logger.error('Failed to get connections:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get connections',
      message: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CONFIGURATION MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/infrastructure/redis/config - Get Redis configuration
router.get('/config', async (req, res) => {
  try {
    const { parameter = '*' } = req.query;

    const config = await redisManager.getConfig(parameter);

    res.json(config);
  } catch (error) {
    logger.error('Failed to get config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get configuration',
      message: error.message
    });
  }
});

// POST /api/infrastructure/redis/config - Set Redis configuration
router.post('/config', async (req, res) => {
  try {
    const { parameter, value } = req.body;

    if (!parameter || value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Parameter and value are required'
      });
    }

    logger.info(`Setting Redis config: ${parameter} = ${value}`);

    const result = await redisManager.setConfig(parameter, value);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('redis:config-updated', {
        parameter,
        value,
        timestamp: new Date().toISOString()
      });
    }

    res.json(result);
  } catch (error) {
    logger.error('Failed to set config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to set configuration',
      message: error.message
    });
  }
});

// POST /api/infrastructure/redis/config/rewrite - Rewrite configuration file
router.post('/config/rewrite', async (req, res) => {
  try {
    logger.info('Rewriting Redis configuration file');

    const result = await redisManager.rewriteConfig();

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('redis:config-rewritten', {
        timestamp: new Date().toISOString()
      });
    }

    res.json(result);
  } catch (error) {
    logger.error('Failed to rewrite config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to rewrite configuration',
      message: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * REALTIME UPDATES
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/infrastructure/redis/subscribe - Subscribe to Redis events
router.get('/subscribe', (req, res) => {
  // This endpoint is for documentation purposes
  // Actual subscription happens via Socket.IO client
  res.json({
    success: true,
    message: 'Use Socket.IO to subscribe to Redis events',
    events: [
      'redis:keys-deleted',
      'redis:flushed',
      'redis:config-updated',
      'redis:config-rewritten',
      'redis:stats-updated'
    ]
  });
});

module.exports = router;
