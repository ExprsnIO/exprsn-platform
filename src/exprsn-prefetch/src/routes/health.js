/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Prefetch - Health Routes
 * Comprehensive health check endpoints with dependency monitoring
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const { asyncHandler } = require('@exprsn/shared');
const axios = require('axios');
const config = require('../config');
const RedisCache = require('../cache/redis');
const logger = require('../utils/logger');

const router = express.Router();

// Initialize test cache clients
const hotCache = new RedisCache('hot');
const warmCache = new RedisCache('warm');

/**
 * GET /health - Comprehensive health check
 */
router.get('/', asyncHandler(async (req, res) => {
  const checks = {
    service: 'exprsn-prefetch',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {}
  };

  let allHealthy = true;

  // 1. Hot Cache (Redis DB 0)
  try {
    const startTime = Date.now();
    await hotCache.client.ping();
    const latency = Date.now() - startTime;

    const info = await hotCache.client.info('memory');
    const memoryMatch = info.match(/used_memory_human:(\S+)/);
    const keysCount = await hotCache.client.dbsize();

    checks.checks.hotCache = {
      status: 'connected',
      latency: `${latency}ms`,
      memory: memoryMatch ? memoryMatch[1] : 'unknown',
      db: hotCache.db,
      keys: keysCount
    };
  } catch (error) {
    checks.checks.hotCache = {
      status: 'disconnected',
      error: error.message
    };
    allHealthy = false;
  }

  // 2. Warm Cache (Redis DB 1)
  try {
    const startTime = Date.now();
    await warmCache.client.ping();
    const latency = Date.now() - startTime;
    const keysCount = await warmCache.client.dbsize();

    checks.checks.warmCache = {
      status: 'connected',
      latency: `${latency}ms`,
      db: warmCache.db,
      keys: keysCount
    };
  } catch (error) {
    checks.checks.warmCache = {
      status: 'disconnected',
      error: error.message
    };
    allHealthy = false;
  }

  // 3. Timeline Service
  try {
    const response = await axios.get(`${config.services.timeline}/health`, {
      timeout: 3000
    });

    checks.checks.timeline = {
      status: 'connected',
      timelineStatus: response.data.status || 'unknown'
    };
  } catch (error) {
    checks.checks.timeline = {
      status: 'disconnected',
      error: error.message
    };
    // Timeline disconnect is warning, not critical
  }

  // 4. CA Service
  try {
    const caUrl = process.env.CA_URL || 'http://localhost:3000';
    const response = await axios.get(`${caUrl}/health`, {
      timeout: 3000
    });

    checks.checks.ca = {
      status: 'connected',
      caStatus: response.data.status || 'unknown'
    };
  } catch (error) {
    checks.checks.ca = {
      status: 'disconnected',
      error: error.message
    };
    // CA disconnect is warning, not critical
  }

  // 5. Memory check
  const memUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
  const heapPercentage = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);

  checks.checks.memory = {
    status: heapPercentage > 90 ? 'warning' : 'healthy',
    heapUsed: `${heapUsedMB}MB`,
    heapTotal: `${heapTotalMB}MB`,
    heapPercentage: `${heapPercentage}%`,
    rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
    external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
  };

  // 6. Queue health check (if Bull queue is available)
  try {
    const { getQueueStats } = require('../queues/prefetchQueue');
    const queueStats = await getQueueStats();

    const isBackedUp = queueStats.waiting > 500 || queueStats.active > 50;

    checks.checks.queue = {
      status: isBackedUp ? 'degraded' : 'healthy',
      waiting: queueStats.waiting,
      active: queueStats.active,
      completed: queueStats.completed,
      failed: queueStats.failed,
      delayed: queueStats.delayed
    };

    if (isBackedUp) {
      checks.checks.queue.warning = 'High job backlog detected';
    }
  } catch (error) {
    // Queue might not be initialized yet, skip
    checks.checks.queue = {
      status: 'not_initialized',
      message: 'Queue system not yet initialized or disabled'
    };
  }

  // Determine overall status
  if (!allHealthy) {
    checks.status = 'unhealthy';
    res.status(503);
  } else if (checks.checks.queue?.status === 'degraded' || checks.checks.memory?.status === 'warning') {
    checks.status = 'degraded';
    res.status(200); // Still operational, just degraded
  }

  res.json(checks);
}));

/**
 * GET /health/redis - Redis-only health check
 */
router.get('/redis', asyncHandler(async (req, res) => {
  try {
    const [hotPing, warmPing] = await Promise.all([
      hotCache.client.ping(),
      warmCache.client.ping()
    ]);

    const [hotKeys, warmKeys] = await Promise.all([
      hotCache.client.dbsize(),
      warmCache.client.dbsize()
    ]);

    const info = await hotCache.client.info('memory');
    const memoryMatch = info.match(/used_memory_human:(\S+)/);

    res.json({
      status: 'healthy',
      hot: {
        status: 'connected',
        db: hotCache.db,
        keys: hotKeys
      },
      warm: {
        status: 'connected',
        db: warmCache.db,
        keys: warmKeys
      },
      memory: memoryMatch ? memoryMatch[1] : 'unknown'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
}));

/**
 * GET /health/timeline - Timeline service health check
 */
router.get('/timeline', asyncHandler(async (req, res) => {
  try {
    const response = await axios.get(`${config.services.timeline}/health`, {
      timeout: 5000
    });

    res.json({
      status: 'healthy',
      timeline: 'connected',
      timelineStatus: response.data
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timeline: 'disconnected',
      error: error.message
    });
  }
}));

/**
 * GET /health/ca - CA service health check
 */
router.get('/ca', asyncHandler(async (req, res) => {
  try {
    const caUrl = process.env.CA_URL || 'http://localhost:3000';
    const response = await axios.get(`${caUrl}/health`, {
      timeout: 5000
    });

    res.json({
      status: 'healthy',
      ca: 'connected',
      caStatus: response.data
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      ca: 'disconnected',
      error: error.message
    });
  }
}));

/**
 * GET /health/cache - Detailed cache statistics
 */
router.get('/cache', asyncHandler(async (req, res) => {
  try {
    const [hotKeys, warmKeys] = await Promise.all([
      hotCache.client.dbsize(),
      warmCache.client.dbsize()
    ]);

    const hotInfo = await hotCache.client.info('stats');
    const warmInfo = await warmCache.client.info('stats');

    res.json({
      status: 'healthy',
      hot: {
        keys: hotKeys,
        db: hotCache.db,
        ttl: config.cache.hotTTL
      },
      warm: {
        keys: warmKeys,
        db: warmCache.db,
        ttl: config.cache.warmTTL
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
}));

/**
 * GET /health/ready - Kubernetes readiness probe
 * Returns 200 if ready to accept traffic
 */
router.get('/ready', asyncHandler(async (req, res) => {
  try {
    // Check critical dependencies
    await Promise.all([
      hotCache.client.ping(),
      warmCache.client.ping()
    ]);

    res.json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      error: error.message
    });
  }
}));

/**
 * GET /health/live - Kubernetes liveness probe
 * Returns 200 if process is alive
 */
router.get('/live', (req, res) => {
  res.json({
    status: 'alive',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
