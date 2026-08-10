/**
 * ═══════════════════════════════════════════════════════════
 * Health Routes
 * Comprehensive health check endpoints
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const { asyncHandler } = require('@exprsn/shared');
const { sequelize } = require('../models');
const axios = require('axios');
const config = require('../config');
const { getAllQueueStats } = require('../config/queue');
const Redis = require('ioredis');
const heraldService = require('../services/heraldService');
const elasticsearchService = require('../services/elasticsearchService');

const router = express.Router();

// Redis client for health checks
let redisClient;
if (process.env.REDIS_ENABLED === 'true') {
  redisClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    lazyConnect: true
  });
}

/**
 * GET /health
 * Comprehensive health check with all dependencies
 */
router.get('/', asyncHandler(async (req, res) => {
  const checks = {
    service: 'exprsn-timeline',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {}
  };

  let allHealthy = true;

  // 1. Database check
  try {
    const startTime = Date.now();
    await sequelize.authenticate();
    const latency = Date.now() - startTime;

    checks.checks.database = {
      status: 'connected',
      latency: `${latency}ms`
    };
  } catch (error) {
    checks.checks.database = {
      status: 'disconnected',
      error: error.message
    };
    allHealthy = false;
  }

  // 2. Redis check
  if (process.env.REDIS_ENABLED === 'true' && redisClient) {
    try {
      const startTime = Date.now();
      await redisClient.ping();
      const latency = Date.now() - startTime;

      checks.checks.redis = {
        status: 'connected',
        latency: `${latency}ms`
      };
    } catch (error) {
      checks.checks.redis = {
        status: 'disconnected',
        error: error.message
      };
      allHealthy = false;
    }
  } else {
    checks.checks.redis = {
      status: 'disabled',
      message: 'Redis is not enabled'
    };
  }

  // 3. CA service check
  try {
    const response = await axios.get(`${config.ca.url}/health`, {
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
    // CA disconnect is a warning, not critical failure
  }

  // 4. Herald service check
  if (config.herald.enabled) {
    try {
      const heraldHealth = await heraldService.checkHealth();

      checks.checks.herald = {
        status: heraldHealth.status,
        healthy: heraldHealth.healthy
      };

      if (!heraldHealth.healthy) {
        checks.checks.herald.error = heraldHealth.error;
      }
    } catch (error) {
      checks.checks.herald = {
        status: 'disconnected',
        error: error.message
      };
      // Herald disconnect is a warning, not critical failure
    }
  } else {
    checks.checks.herald = {
      status: 'disabled',
      message: 'Herald notification service is not enabled'
    };
  }

  // 5. ElasticSearch check
  if (config.elasticsearch.enabled) {
    try {
      const esHealth = await elasticsearchService.checkHealth();

      checks.checks.elasticsearch = {
        status: esHealth.status,
        healthy: esHealth.healthy,
        cluster: esHealth.cluster,
        indices: esHealth.indices
      };

      if (!esHealth.healthy) {
        checks.checks.elasticsearch.error = esHealth.error;
      }
    } catch (error) {
      checks.checks.elasticsearch = {
        status: 'disconnected',
        error: error.message
      };
      // ElasticSearch disconnect is a warning, not critical failure
    }
  } else {
    checks.checks.elasticsearch = {
      status: 'disabled',
      message: 'ElasticSearch is not enabled'
    };
  }

  // 6. Queue health check
  if (process.env.ENABLE_JOBS !== 'false') {
    try {
      const queueStats = await getAllQueueStats();

      let totalWaiting = 0;
      let totalActive = 0;
      let totalFailed = 0;

      const queueDetails = {};
      queueStats.forEach(stat => {
        totalWaiting += stat.waiting;
        totalActive += stat.active;
        totalFailed += stat.failed;

        queueDetails[stat.name] = {
          waiting: stat.waiting,
          active: stat.active,
          completed: stat.completed,
          failed: stat.failed,
          delayed: stat.delayed
        };
      });

      // Check if queues are backed up
      const isBackedUp = totalWaiting > 1000 || totalActive > 100;

      checks.checks.queues = {
        status: isBackedUp ? 'degraded' : 'healthy',
        totalWaiting,
        totalActive,
        totalFailed,
        queues: queueDetails
      };

      if (isBackedUp) {
        checks.checks.queues.warning = 'High job backlog detected';
      }
    } catch (error) {
      checks.checks.queues = {
        status: 'error',
        error: error.message
      };
      allHealthy = false;
    }
  } else {
    checks.checks.queues = {
      status: 'disabled',
      message: 'Background jobs are not enabled'
    };
  }

  // 7. Worker process check (if running)
  // Note: This check assumes worker is a separate process
  // In production, you'd check via shared state or monitoring
  checks.checks.worker = {
    status: 'unknown',
    message: 'Worker runs as separate process. Check process manager (PM2/systemd).'
  };

  // 8. Memory check
  const memUsage = process.memoryUsage();
  checks.checks.memory = {
    status: 'healthy',
    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
    rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
    external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
  };

  // Determine overall status
  if (!allHealthy) {
    checks.status = 'unhealthy';
    res.status(503);
  } else if (checks.checks.queues?.status === 'degraded') {
    checks.status = 'degraded';
    res.status(200); // Still operational, just degraded
  }

  res.json(checks);
}));

/**
 * GET /health/db
 * Database-only health check
 */
router.get('/db', asyncHandler(async (req, res) => {
  try {
    const startTime = Date.now();
    await sequelize.authenticate();
    const latency = Date.now() - startTime;

    res.json({
      status: 'healthy',
      database: 'connected',
      latency: `${latency}ms`
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message
    });
  }
}));

/**
 * GET /health/redis
 * Redis-only health check
 */
router.get('/redis', asyncHandler(async (req, res) => {
  if (process.env.REDIS_ENABLED !== 'true') {
    return res.json({
      status: 'disabled',
      message: 'Redis is not enabled'
    });
  }

  if (!redisClient) {
    return res.status(503).json({
      status: 'unhealthy',
      error: 'Redis client not initialized'
    });
  }

  try {
    const startTime = Date.now();
    await redisClient.ping();
    const latency = Date.now() - startTime;

    const info = await redisClient.info('memory');
    const memoryMatch = info.match(/used_memory_human:(\S+)/);
    const memoryUsed = memoryMatch ? memoryMatch[1] : 'unknown';

    res.json({
      status: 'healthy',
      redis: 'connected',
      latency: `${latency}ms`,
      memoryUsed
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      redis: 'disconnected',
      error: error.message
    });
  }
}));

/**
 * GET /health/ca
 * CA service health check
 */
router.get('/ca', asyncHandler(async (req, res) => {
  try {
    const response = await axios.get(`${config.ca.url}/health`, {
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
 * GET /health/herald
 * Herald notification service health check
 */
router.get('/herald', asyncHandler(async (req, res) => {
  if (!config.herald.enabled) {
    return res.json({
      status: 'disabled',
      message: 'Herald notification service is not enabled'
    });
  }

  try {
    const heraldHealth = await heraldService.checkHealth();

    if (heraldHealth.healthy) {
      res.json({
        status: 'healthy',
        herald: 'connected',
        heraldStatus: heraldHealth.data
      });
    } else {
      res.status(503).json({
        status: 'unhealthy',
        herald: 'disconnected',
        error: heraldHealth.error
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      herald: 'disconnected',
      error: error.message
    });
  }
}));

/**
 * GET /health/elasticsearch
 * ElasticSearch health check
 */
router.get('/elasticsearch', asyncHandler(async (req, res) => {
  if (!config.elasticsearch.enabled) {
    return res.json({
      status: 'disabled',
      message: 'ElasticSearch is not enabled'
    });
  }

  try {
    const esHealth = await elasticsearchService.checkHealth();

    if (esHealth.healthy) {
      res.json({
        status: 'healthy',
        elasticsearch: 'connected',
        cluster: esHealth.cluster,
        indices: esHealth.indices
      });
    } else {
      res.status(503).json({
        status: 'unhealthy',
        elasticsearch: 'disconnected',
        error: esHealth.error,
        cluster: esHealth.cluster
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      elasticsearch: 'disconnected',
      error: error.message
    });
  }
}));

/**
 * GET /health/queues
 * Queue statistics and health
 */
router.get('/queues', asyncHandler(async (req, res) => {
  if (process.env.ENABLE_JOBS === 'false') {
    return res.json({
      status: 'disabled',
      message: 'Background jobs are not enabled'
    });
  }

  try {
    const queueStats = await getAllQueueStats();

    let totalWaiting = 0;
    let totalActive = 0;
    let totalCompleted = 0;
    let totalFailed = 0;
    let totalDelayed = 0;

    queueStats.forEach(stat => {
      totalWaiting += stat.waiting;
      totalActive += stat.active;
      totalCompleted += stat.completed;
      totalFailed += stat.failed;
      totalDelayed += stat.delayed;
    });

    const isBackedUp = totalWaiting > 1000 || totalActive > 100;

    res.json({
      status: isBackedUp ? 'degraded' : 'healthy',
      summary: {
        totalWaiting,
        totalActive,
        totalCompleted,
        totalFailed,
        totalDelayed
      },
      queues: queueStats,
      warning: isBackedUp ? 'High job backlog detected' : null
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
}));

/**
 * GET /health/ready
 * Kubernetes-style readiness probe
 * Returns 200 if ready to accept traffic
 */
router.get('/ready', asyncHandler(async (req, res) => {
  try {
    // Check critical dependencies
    await sequelize.authenticate();

    if (process.env.REDIS_ENABLED === 'true' && redisClient) {
      await redisClient.ping();
    }

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
 * GET /health/live
 * Kubernetes-style liveness probe
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
