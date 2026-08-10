/**
 * Health Monitoring Module
 * Comprehensive health checks for all Exprsn services
 */

const axios = require('axios');
const { Client } = require('pg');
const redis = require('redis');
const logger = require('../utils/logger');
const { SERVICE_DEFINITIONS } = require('./discovery');

/**
 * Check database connectivity for a service
 * @param {Object} dbConfig - Database configuration
 * @returns {Promise<Object>} Database health status
 */
async function checkDatabaseHealth(dbConfig) {
  const client = new Client({
    host: dbConfig.host || 'localhost',
    port: dbConfig.port || 5432,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    connectionTimeoutMillis: 3000
  });

  try {
    await client.connect();

    // Test query
    const result = await client.query('SELECT NOW() as current_time, version() as version');

    await client.end();

    return {
      healthy: true,
      connected: true,
      timestamp: result.rows[0].current_time,
      version: result.rows[0].version.split(' ')[1] // Extract version number
    };
  } catch (error) {
    logger.error('Database health check failed:', error);
    return {
      healthy: false,
      connected: false,
      error: error.message
    };
  }
}

/**
 * Check Redis connectivity
 * @param {Object} redisConfig - Redis configuration
 * @returns {Promise<Object>} Redis health status
 */
async function checkRedisHealth(redisConfig) {
  const client = redis.createClient({
    socket: {
      host: redisConfig.host || 'localhost',
      port: redisConfig.port || 6379,
      connectTimeout: 3000
    },
    password: redisConfig.password
  });

  try {
    await client.connect();

    // Test ping
    const pong = await client.ping();

    // Get info
    const info = await client.info('server');
    const versionMatch = info.match(/redis_version:([^\r\n]+)/);
    const version = versionMatch ? versionMatch[1] : 'unknown';

    await client.quit();

    return {
      healthy: true,
      connected: true,
      responsive: pong === 'PONG',
      version
    };
  } catch (error) {
    logger.error('Redis health check failed:', error);
    return {
      healthy: false,
      connected: false,
      error: error.message
    };
  }
}

/**
 * Perform comprehensive health check on a service
 * @param {string} serviceId - Service identifier
 * @returns {Promise<Object>} Comprehensive health status
 */
async function performHealthCheck(serviceId) {
  const config = SERVICE_DEFINITIONS[serviceId];
  if (!config) {
    throw new Error(`Unknown service: ${serviceId}`);
  }

  const healthStatus = {
    service: serviceId,
    name: config.name,
    port: config.port,
    timestamp: new Date().toISOString(),
    overall: 'unknown',
    checks: {}
  };

  try {
    // Check HTTP endpoint
    const httpResponse = await axios.get(`http://localhost:${config.port}/health`, {
      timeout: 5000,
      validateStatus: () => true
    });

    healthStatus.checks.http = {
      healthy: httpResponse.status < 500,
      statusCode: httpResponse.status,
      responseTime: httpResponse.headers['x-response-time'] || 'unknown'
    };

    if (httpResponse.data) {
      // Check database if service reports it
      if (httpResponse.data.database !== undefined) {
        healthStatus.checks.database = {
          healthy: httpResponse.data.database === true || httpResponse.data.database === 'healthy',
          details: typeof httpResponse.data.database === 'object' ? httpResponse.data.database : {}
        };
      }

      // Check Redis if service reports it
      if (httpResponse.data.redis !== undefined) {
        healthStatus.checks.redis = {
          healthy: httpResponse.data.redis === true || httpResponse.data.redis === 'healthy',
          details: typeof httpResponse.data.redis === 'object' ? httpResponse.data.redis : {}
        };
      }

      // Extract other health metrics
      healthStatus.uptime = httpResponse.data.uptime;
      healthStatus.version = httpResponse.data.version;
      healthStatus.environment = httpResponse.data.environment;
    }

    // Determine overall health
    const allChecks = Object.values(healthStatus.checks);
    const allHealthy = allChecks.every(check => check.healthy);
    const anyHealthy = allChecks.some(check => check.healthy);

    if (allHealthy) {
      healthStatus.overall = 'healthy';
    } else if (anyHealthy) {
      healthStatus.overall = 'degraded';
    } else {
      healthStatus.overall = 'unhealthy';
    }

  } catch (error) {
    logger.error(`Health check failed for ${serviceId}:`, error);
    healthStatus.checks.http = {
      healthy: false,
      error: error.message
    };
    healthStatus.overall = 'unreachable';
  }

  return healthStatus;
}

/**
 * Check health of all services
 * @returns {Promise<Array>} Array of health statuses
 */
async function checkAllServices() {
  logger.info('Starting health check for all services...');

  const healthPromises = Object.keys(SERVICE_DEFINITIONS).map(
    serviceId => performHealthCheck(serviceId)
  );

  const healthStatuses = await Promise.all(healthPromises);

  const healthyCount = healthStatuses.filter(s => s.overall === 'healthy').length;
  logger.info(`Health check complete: ${healthyCount}/${healthStatuses.length} services healthy`);

  return healthStatuses;
}

/**
 * Get detailed health endpoint data
 * @param {string} serviceId - Service identifier
 * @returns {Promise<Object>} Detailed health data
 */
async function getDetailedHealth(serviceId) {
  const config = SERVICE_DEFINITIONS[serviceId];
  if (!config) {
    throw new Error(`Unknown service: ${serviceId}`);
  }

  try {
    // Get health endpoint
    const healthResponse = await axios.get(`http://localhost:${config.port}/health`, {
      timeout: 5000
    });

    const detailedHealth = {
      service: serviceId,
      timestamp: new Date().toISOString(),
      health: healthResponse.data
    };

    // Try to get database health endpoint if available
    try {
      const dbHealthResponse = await axios.get(`http://localhost:${config.port}/health/db`, {
        timeout: 3000,
        validateStatus: () => true
      });
      if (dbHealthResponse.status === 200) {
        detailedHealth.databaseDetails = dbHealthResponse.data;
      }
    } catch (error) {
      // Endpoint not available
    }

    // Try to get cache health endpoint if available
    try {
      const cacheHealthResponse = await axios.get(`http://localhost:${config.port}/health/cache`, {
        timeout: 3000,
        validateStatus: () => true
      });
      if (cacheHealthResponse.status === 200) {
        detailedHealth.cacheDetails = cacheHealthResponse.data;
      }
    } catch (error) {
      // Endpoint not available
    }

    return detailedHealth;
  } catch (error) {
    logger.error(`Failed to get detailed health for ${serviceId}:`, error);
    throw error;
  }
}

/**
 * Monitor service health continuously
 * @param {string} serviceId - Service identifier
 * @param {Function} callback - Callback function for health updates
 * @param {number} interval - Check interval in ms
 * @returns {Function} Stop monitoring function
 */
function monitorServiceHealth(serviceId, callback, interval = 5000) {
  logger.info(`Starting health monitoring for ${serviceId} (interval: ${interval}ms)`);

  const intervalId = setInterval(async () => {
    try {
      const health = await performHealthCheck(serviceId);
      callback(health);
    } catch (error) {
      logger.error(`Monitoring error for ${serviceId}:`, error);
      callback({
        service: serviceId,
        overall: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }, interval);

  // Return stop function
  return () => {
    clearInterval(intervalId);
    logger.info(`Stopped health monitoring for ${serviceId}`);
  };
}

/**
 * Get system-wide health summary
 * @returns {Promise<Object>} System health summary
 */
async function getSystemHealthSummary() {
  const allHealth = await checkAllServices();

  const summary = {
    timestamp: new Date().toISOString(),
    totalServices: allHealth.length,
    healthy: allHealth.filter(s => s.overall === 'healthy').length,
    degraded: allHealth.filter(s => s.overall === 'degraded').length,
    unhealthy: allHealth.filter(s => s.overall === 'unhealthy').length,
    unreachable: allHealth.filter(s => s.overall === 'unreachable').length,
    services: allHealth
  };

  // Calculate overall system health
  const healthPercentage = (summary.healthy / summary.totalServices) * 100;
  if (healthPercentage === 100) {
    summary.systemStatus = 'healthy';
  } else if (healthPercentage >= 80) {
    summary.systemStatus = 'degraded';
  } else if (healthPercentage >= 50) {
    summary.systemStatus = 'unhealthy';
  } else {
    summary.systemStatus = 'critical';
  }

  return summary;
}

module.exports = {
  checkDatabaseHealth,
  checkRedisHealth,
  performHealthCheck,
  checkAllServices,
  getDetailedHealth,
  monitorServiceHealth,
  getSystemHealthSummary
};
