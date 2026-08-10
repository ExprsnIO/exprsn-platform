/**
 * ═══════════════════════════════════════════════════════════════════════
 * Redis & Caching Administration Routes
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const Redis = require('ioredis');
const logger = require('../utils/logger');

// Store active Redis connections
const redisConnections = new Map();

/**
 * GET /api/redis/status - Get Redis connection status
 */
router.get('/status', async (req, res) => {
  try {
    const config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB) || 0
    };

    let client;
    try {
      client = new Redis({
        ...config,
        lazyConnect: true,
        retryStrategy: () => null
      });

      await client.connect();
      const ping = await client.ping();
      const info = await client.info('server');

      await client.quit();

      res.json({
        success: true,
        status: {
          connected: ping === 'PONG',
          config: {
            host: config.host,
            port: config.port,
            db: config.db
          }
        }
      });
    } catch (error) {
      res.json({
        success: true,
        status: {
          connected: false,
          config: {
            host: config.host,
            port: config.port,
            db: config.db
          },
          error: error.message
        }
      });
    }
  } catch (error) {
    logger.error('Error checking Redis status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/redis/test - Test Redis connection
 */
router.post('/test', async (req, res) => {
  try {
    const { host, port, password, db } = req.body;

    const client = new Redis({
      host: host || 'localhost',
      port: port || 6379,
      password: password || undefined,
      db: db || 0,
      lazyConnect: true,
      retryStrategy: () => null
    });

    await client.connect();
    const ping = await client.ping();

    if (ping === 'PONG') {
      const info = await client.info('server');
      await client.quit();

      res.json({
        success: true,
        message: 'Connection successful'
      });
    } else {
      throw new Error('Invalid PING response');
    }
  } catch (error) {
    logger.error('Redis connection test failed:', error);
    res.status(400).json({
      success: false,
      error: 'Connection failed: ' + error.message
    });
  }
});

/**
 * POST /api/redis/flush - Flush Redis database
 */
router.post('/flush', async (req, res) => {
  try {
    const { db } = req.body;

    const client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: db || 0
    });

    await client.flushdb();
    await client.quit();

    // Emit Socket.IO event
    if (global.adminIO) {
      global.adminIO.emit('redis:flushed', {
        db,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Redis database flushed successfully'
    });
  } catch (error) {
    logger.error('Failed to flush Redis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to flush Redis: ' + error.message
    });
  }
});

module.exports = router;
