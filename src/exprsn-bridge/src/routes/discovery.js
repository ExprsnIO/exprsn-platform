/**
 * Service Discovery Routes
 *
 * Provides service registry and discovery endpoints for the Exprsn ecosystem.
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const config = require('../config');
const logger = require('../config/logger');

/**
 * Get all registered services
 */
router.get('/services', (req, res) => {
  const services = Object.entries(config.services).map(([name, url]) => ({
    name,
    url,
    port: new URL(url).port || (url.startsWith('https') ? '443' : '80'),
    protocol: new URL(url).protocol.replace(':', '')
  }));

  res.json({
    success: true,
    data: {
      services,
      count: services.length
    }
  });
});

/**
 * Get specific service details
 */
router.get('/services/:name', (req, res) => {
  const { name } = req.params;
  const url = config.services[name];

  if (!url) {
    return res.status(404).json({
      success: false,
      error: 'SERVICE_NOT_FOUND',
      message: `Service '${name}' not registered`
    });
  }

  res.json({
    success: true,
    data: {
      name,
      url,
      port: new URL(url).port || (url.startsWith('https') ? '443' : '80'),
      protocol: new URL(url).protocol.replace(':', '')
    }
  });
});

/**
 * Check health of all services
 */
router.get('/health/all', async (req, res) => {
  const results = [];
  const timeout = parseInt(req.query.timeout || '3000', 10);

  for (const [name, url] of Object.entries(config.services)) {
    try {
      const startTime = Date.now();
      const response = await axios.get(`${url}/health`, {
        timeout,
        validateStatus: () => true // Accept any status code
      });
      const responseTime = Date.now() - startTime;

      results.push({
        service: name,
        url,
        status: response.status === 200 ? 'healthy' : 'unhealthy',
        statusCode: response.status,
        responseTime,
        data: response.data,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      results.push({
        service: name,
        url,
        status: 'unreachable',
        error: error.code || error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  const healthyCount = results.filter(r => r.status === 'healthy').length;
  const totalCount = results.length;
  const overallHealth = healthyCount === totalCount ? 'healthy' :
                       healthyCount > 0 ? 'degraded' : 'critical';

  res.json({
    success: true,
    data: {
      overall: overallHealth,
      healthy: healthyCount,
      total: totalCount,
      services: results
    }
  });
});

/**
 * Check health of specific service
 */
router.get('/health/:service', async (req, res) => {
  const { service } = req.params;
  const url = config.services[service];

  if (!url) {
    return res.status(404).json({
      success: false,
      error: 'SERVICE_NOT_FOUND',
      message: `Service '${service}' not registered`
    });
  }

  try {
    const timeout = parseInt(req.query.timeout || '3000', 10);
    const startTime = Date.now();
    const response = await axios.get(`${url}/health`, {
      timeout,
      validateStatus: () => true
    });
    const responseTime = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        service,
        url,
        status: response.status === 200 ? 'healthy' : 'unhealthy',
        statusCode: response.status,
        responseTime,
        data: response.data,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      data: {
        service,
        url,
        status: 'unreachable',
        error: error.code || error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * Get service metrics aggregation
 */
router.get('/metrics', async (req, res) => {
  const metrics = {
    bridge: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    },
    services: {}
  };

  // Collect metrics from services that expose /health/metrics
  for (const [name, url] of Object.entries(config.services)) {
    try {
      const response = await axios.get(`${url}/health/metrics`, {
        timeout: 2000,
        validateStatus: () => true
      });

      if (response.status === 200) {
        metrics.services[name] = response.data;
      }
    } catch (error) {
      // Skip services that don't have metrics endpoint
      logger.debug(`No metrics available for ${name}`);
    }
  }

  res.json({
    success: true,
    data: metrics
  });
});

module.exports = router;
