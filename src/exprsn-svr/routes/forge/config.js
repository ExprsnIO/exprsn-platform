const express = require('express');
const router = express.Router();
// const nexusConfig = require('../../config/nexus'); // Nexus config not yet implemented
const databaseConfig = require('../../config/database');
const redisConfig = require('../../config/redis');
const logger = require('../../utils/logger');

/**
 * Configuration Management Routes
 *
 * Provides configuration information for setup dashboard
 * and service integration
 */

/**
 * GET /api/config
 * Get all service configurations
 */
router.get('/', async (req, res) => {
  try {
    const config = {
      service: 'exprsn-forge',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',

      features: {
        groupware: process.env.ENABLE_GROUPWARE === 'true',
        crm: process.env.ENABLE_CRM === 'true',
        erp: process.env.ENABLE_ERP === 'true',
        workflows: process.env.ENABLE_WORKFLOWS === 'true',
        reporting: process.env.ENABLE_REPORTING === 'true'
      },

      integrations: {
        // nexus: {
        //   enabled: nexusConfig.config.enabled,
        //   serviceUrl: nexusConfig.config.serviceUrl,
        //   features: nexusConfig.config.features,
        //   status: 'checking'
        // },
        workflow: {
          enabled: process.env.WORKFLOW_ENABLED === 'true',
          serviceUrl: process.env.WORKFLOW_URL || 'http://localhost:3017'
        }
      },

      database: {
        host: databaseConfig.config.host,
        port: databaseConfig.config.port,
        database: databaseConfig.config.database,
        status: 'connected'
      },

      redis: {
        enabled: redisConfig.enabled,
        host: redisConfig.enabled ? process.env.REDIS_HOST : null,
        port: redisConfig.enabled ? parseInt(process.env.REDIS_PORT) : null,
        db: redisConfig.enabled ? parseInt(process.env.REDIS_DB) : null
      }
    };

    // Test Nexus connection if enabled
    if (nexusConfig.config.enabled) {
      const nexusHealth = await nexusConfig.testConnection();
      config.integrations.nexus.status = nexusHealth.connected ? 'connected' : 'disconnected';
      config.integrations.nexus.error = nexusHealth.error || null;
    } else {
      config.integrations.nexus.status = 'disabled';
    }

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    logger.error('Failed to get configuration', {
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve configuration'
    });
  }
});

/**
 * GET /api/config/nexus
 * Get Nexus integration configuration
 */
router.get('/nexus', async (req, res) => {
  try {
    const config = nexusConfig.getConfig();

    // Remove sensitive data
    const sanitizedConfig = {
      enabled: config.enabled,
      serviceUrl: config.serviceUrl,
      apiVersion: config.apiVersion,
      timeout: config.timeout,

      features: config.features,

      database: {
        enabled: config.database.enabled,
        host: config.database.host,
        port: config.database.port,
        database: config.database.database
        // Password excluded
      },

      redis: {
        enabled: config.redis.enabled,
        host: config.redis.host,
        port: config.redis.port,
        db: config.redis.db,
        keyPrefix: config.redis.keyPrefix
        // Password excluded
      },

      sync: config.sync,
      dav: config.dav,
      integration: config.integration,
      retry: config.retry,
      rateLimit: config.rateLimit
    };

    // Test connection
    const connectionTest = await nexusConfig.testConnection();

    res.json({
      success: true,
      data: {
        config: sanitizedConfig,
        connection: connectionTest
      }
    });
  } catch (error) {
    logger.error('Failed to get Nexus configuration', {
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve Nexus configuration'
    });
  }
});

/**
 * GET /api/config/nexus/health
 * Get Nexus service health
 */
router.get('/nexus/health', async (req, res) => {
  try {
    const health = await nexusConfig.getHealth();

    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    logger.error('Failed to get Nexus health', {
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve Nexus health status'
    });
  }
});

/**
 * GET /api/config/nexus/stats
 * Get Nexus service statistics
 */
router.get('/nexus/stats', async (req, res) => {
  try {
    const stats = await nexusConfig.getStats();

    if (!stats) {
      return res.status(503).json({
        success: false,
        error: 'Nexus service unavailable'
      });
    }

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get Nexus stats', {
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve Nexus statistics'
    });
  }
});

/**
 * POST /api/config/nexus/test
 * Test Nexus connection
 */
router.post('/nexus/test', async (req, res) => {
  try {
    const connectionTest = await nexusConfig.testConnection();

    res.json({
      success: connectionTest.connected,
      data: connectionTest
    });
  } catch (error) {
    logger.error('Nexus connection test failed', {
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: 'Connection test failed',
      details: error.message
    });
  }
});

/**
 * POST /api/config/nexus/discover
 * Discover Nexus service URL from setup service
 */
router.post('/nexus/discover', async (req, res) => {
  try {
    const discoveredUrl = await nexusConfig.discoverServiceUrl();

    if (!discoveredUrl) {
      return res.status(404).json({
        success: false,
        error: 'Nexus service not found in service registry'
      });
    }

    // Test connection to discovered URL
    const connectionTest = await nexusConfig.testConnection();

    res.json({
      success: true,
      data: {
        discoveredUrl,
        connection: connectionTest
      }
    });
  } catch (error) {
    logger.error('Failed to discover Nexus service', {
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: 'Service discovery failed'
    });
  }
});

/**
 * GET /api/config/database
 * Get database configuration
 */
router.get('/database', async (req, res) => {
  try {
    const config = {
      host: databaseConfig.config.host,
      port: databaseConfig.config.port,
      database: databaseConfig.config.database,
      dialect: databaseConfig.config.dialect,
      pool: databaseConfig.config.pool
    };

    // Test connection
    const connected = await databaseConfig.testConnection();

    res.json({
      success: true,
      data: {
        config,
        connected
      }
    });
  } catch (error) {
    logger.error('Failed to get database configuration', {
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve database configuration'
    });
  }
});

/**
 * GET /api/config/redis
 * Get Redis configuration
 */
router.get('/redis', (req, res) => {
  try {
    if (!redisConfig.enabled) {
      return res.json({
        success: true,
        data: {
          enabled: false,
          message: 'Redis is disabled'
        }
      });
    }

    const config = {
      enabled: redisConfig.enabled,
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT),
      db: parseInt(process.env.REDIS_DB),
      connected: redisConfig.client?.status === 'ready'
    };

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    logger.error('Failed to get Redis configuration', {
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve Redis configuration'
    });
  }
});

module.exports = router;
