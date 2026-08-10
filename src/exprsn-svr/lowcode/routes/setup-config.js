/**
 * ═══════════════════════════════════════════════════════════════════════
 * Setup Configuration Routes
 * ═══════════════════════════════════════════════════════════════════════
 * Comprehensive API for platform configuration management
 * No authentication required in dev mode (LOW_CODE_DEV_AUTH=true)
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const SetupConfigService = require('../services/SetupConfigService');

/**
 * ═══════════════════════════════════════════════════════════════════
 * MAIN SETUP VIEW
 * ═══════════════════════════════════════════════════════════════════
 */

/**
 * GET /lowcode/setup-config
 * Main setup configuration interface
 */
router.get('/', async (req, res) => {
  try {
    res.render('setup-config', {
      title: 'Platform Configuration',
      appId: req.query.appId || null
    });
  } catch (error) {
    console.error('[Setup] Error rendering setup config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load setup configuration',
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════
 * SYSTEM HEALTH API
 * ═══════════════════════════════════════════════════════════════════
 */

/**
 * GET /lowcode/api/setup/system-health
 * Get complete system health overview
 */
router.get('/api/system-health', async (req, res) => {
  try {
    const health = await SetupConfigService.getSystemHealth();

    res.json({
      success: true,
      health
    });
  } catch (error) {
    console.error('[Setup] Error getting system health:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get system health',
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════
 * SERVICES API
 * ═══════════════════════════════════════════════════════════════════
 */

/**
 * GET /lowcode/api/setup/services
 * Get all services with health status
 */
router.get('/api/services', async (req, res) => {
  try {
    const services = await SetupConfigService.checkAllServices();

    res.json({
      success: true,
      services,
      count: services.length
    });
  } catch (error) {
    console.error('[Setup] Error getting services:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get services',
      error: error.message
    });
  }
});

/**
 * GET /lowcode/api/setup/services/:serviceId
 * Get individual service details
 */
router.get('/api/services/:serviceId', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const services = await SetupConfigService.checkAllServices();
    const service = services.find(s => s.id === serviceId);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    res.json({
      success: true,
      service
    });
  } catch (error) {
    console.error('[Setup] Error getting service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get service',
      error: error.message
    });
  }
});

/**
 * POST /lowcode/api/setup/services/:serviceId/test
 * Test individual service connection
 */
router.post('/api/services/:serviceId/test', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const services = await SetupConfigService.checkAllServices();
    const service = services.find(s => s.id === serviceId);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    const health = await SetupConfigService.checkService(service.port);

    res.json({
      success: health.running,
      serviceId,
      port: service.port,
      responseTime: health.responseTime,
      uptime: health.uptime,
      running: health.running
    });
  } catch (error) {
    console.error('[Setup] Error testing service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test service',
      error: error.message
    });
  }
});

/**
 * POST /lowcode/api/setup/services/:serviceId/start
 * Start a service (placeholder for future implementation)
 */
router.post('/api/services/:serviceId/start', async (req, res) => {
  try {
    const { serviceId } = req.params;

    res.json({
      success: false,
      message: 'Service start not implemented yet',
      serviceId
    });
  } catch (error) {
    console.error('[Setup] Error starting service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start service',
      error: error.message
    });
  }
});

/**
 * POST /lowcode/api/setup/services/:serviceId/stop
 * Stop a service (placeholder for future implementation)
 */
router.post('/api/services/:serviceId/stop', async (req, res) => {
  try {
    const { serviceId } = req.params;

    res.json({
      success: false,
      message: 'Service stop not implemented yet',
      serviceId
    });
  } catch (error) {
    console.error('[Setup] Error stopping service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop service',
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════
 * DATABASES API
 * ═══════════════════════════════════════════════════════════════════
 */

/**
 * GET /lowcode/api/setup/databases
 * Get all databases with status
 */
router.get('/api/databases', async (req, res) => {
  try {
    const databases = await SetupConfigService.getAllDatabases();

    res.json({
      success: true,
      databases,
      count: databases.length
    });
  } catch (error) {
    console.error('[Setup] Error getting databases:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get databases',
      error: error.message
    });
  }
});

/**
 * GET /lowcode/api/setup/databases/:databaseId
 * Get individual database details
 */
router.get('/api/databases/:databaseId', async (req, res) => {
  try {
    const { databaseId } = req.params;
    const databases = await SetupConfigService.getAllDatabases();
    const database = databases.find(db => db.id === databaseId);

    if (!database) {
      return res.status(404).json({
        success: false,
        message: 'Database not found'
      });
    }

    res.json({
      success: true,
      database
    });
  } catch (error) {
    console.error('[Setup] Error getting database:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get database',
      error: error.message
    });
  }
});

/**
 * POST /lowcode/api/setup/databases/:databaseId/test
 * Test database connection
 */
router.post('/api/databases/:databaseId/test', async (req, res) => {
  try {
    const { databaseId } = req.params;
    const databases = await SetupConfigService.getAllDatabases();
    const database = databases.find(db => db.id === databaseId);

    if (!database) {
      return res.status(404).json({
        success: false,
        message: 'Database not found'
      });
    }

    const status = await SetupConfigService.checkDatabaseConnection(database.name);

    res.json({
      success: status.connected,
      databaseId,
      name: database.name,
      connected: status.connected,
      tableCount: status.tableCount,
      size: status.size,
      version: status.version
    });
  } catch (error) {
    console.error('[Setup] Error testing database:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test database connection',
      error: error.message
    });
  }
});

/**
 * POST /lowcode/api/setup/databases/:databaseId/migrate
 * Run migrations for database
 */
router.post('/api/databases/:databaseId/migrate', async (req, res) => {
  try {
    const { databaseId } = req.params;
    const databases = await SetupConfigService.getAllDatabases();
    const database = databases.find(db => db.id === databaseId);

    if (!database) {
      return res.status(404).json({
        success: false,
        message: 'Database not found'
      });
    }

    const result = await SetupConfigService.runMigrations(database.name);

    res.json(result);
  } catch (error) {
    console.error('[Setup] Error running migrations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to run migrations',
      error: error.message
    });
  }
});

/**
 * POST /lowcode/api/setup/databases/:databaseId/seed
 * Seed database with sample data
 */
router.post('/api/databases/:databaseId/seed', async (req, res) => {
  try {
    const { databaseId } = req.params;

    res.json({
      success: false,
      message: 'Database seeding not implemented yet',
      databaseId
    });
  } catch (error) {
    console.error('[Setup] Error seeding database:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to seed database',
      error: error.message
    });
  }
});

/**
 * POST /lowcode/api/setup/databases/:databaseId/backup
 * Backup database
 */
router.post('/api/databases/:databaseId/backup', async (req, res) => {
  try {
    const { databaseId } = req.params;

    res.json({
      success: false,
      message: 'Database backup not implemented yet',
      databaseId
    });
  } catch (error) {
    console.error('[Setup] Error backing up database:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to backup database',
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════
 * REDIS API
 * ═══════════════════════════════════════════════════════════════════
 */

/**
 * GET /lowcode/api/setup/redis
 * Get Redis configuration and status
 */
router.get('/api/redis', async (req, res) => {
  try {
    const redis = await SetupConfigService.getRedisConfig();

    res.json({
      success: true,
      redis
    });
  } catch (error) {
    console.error('[Setup] Error getting Redis config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get Redis configuration',
      error: error.message
    });
  }
});

/**
 * POST /lowcode/api/setup/redis/test
 * Test Redis connection
 */
router.post('/api/redis/test', async (req, res) => {
  try {
    const { host, port, password } = req.body;

    const result = await SetupConfigService.testRedisConnection(
      host || 'localhost',
      port || 6379,
      password
    );

    res.json(result);
  } catch (error) {
    console.error('[Setup] Error testing Redis:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test Redis connection',
      error: error.message
    });
  }
});

/**
 * POST /lowcode/api/setup/redis/flush/:dbNumber
 * Flush Redis database
 */
router.post('/api/redis/flush/:dbNumber', async (req, res) => {
  try {
    const { dbNumber } = req.params;
    const db = parseInt(dbNumber);

    if (isNaN(db) || db < 0 || db > 15) {
      return res.status(400).json({
        success: false,
        message: 'Invalid database number (must be 0-15)'
      });
    }

    const result = await SetupConfigService.flushRedisDb(db);

    res.json(result);
  } catch (error) {
    console.error('[Setup] Error flushing Redis DB:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to flush Redis database',
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════
 * CONFIGURATION API
 * ═══════════════════════════════════════════════════════════════════
 */

/**
 * GET /lowcode/api/setup/config
 * Get current configuration
 */
router.get('/api/config', async (req, res) => {
  try {
    const config = {
      environment: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 5001,
      database: {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        name: process.env.DB_NAME || 'exprsn_lowcode',
        user: process.env.DB_USER || 'postgres'
      },
      redis: {
        enabled: process.env.REDIS_ENABLED !== 'false',
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379
      },
      security: {
        devAuthEnabled: process.env.LOW_CODE_DEV_AUTH === 'true',
        sessionSecret: process.env.SESSION_SECRET ? '***' : null,
        jwtSecret: process.env.JWT_SECRET ? '***' : null
      },
      forge: {
        enabled: process.env.FORGE_INTEGRATION_ENABLED !== 'false',
        serviceUrl: process.env.FORGE_SERVICE_URL || 'http://localhost:3016'
      },
      workflow: {
        enabled: process.env.WORKFLOW_INTEGRATION_ENABLED !== 'false',
        serviceUrl: process.env.WORKFLOW_SERVICE_URL || 'http://localhost:3017'
      }
    };

    res.json({
      success: true,
      config
    });
  } catch (error) {
    console.error('[Setup] Error getting config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get configuration',
      error: error.message
    });
  }
});

/**
 * PUT /lowcode/api/setup/config
 * Update configuration
 */
router.put('/api/config', async (req, res) => {
  try {
    const config = req.body;

    res.json({
      success: false,
      message: 'Configuration update not implemented yet',
      note: 'Configuration changes require restart'
    });
  } catch (error) {
    console.error('[Setup] Error updating config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update configuration',
      error: error.message
    });
  }
});

/**
 * GET /lowcode/api/setup/config/export
 * Export configuration as JSON
 */
router.get('/api/config/export', async (req, res) => {
  try {
    const [services, databases, redis] = await Promise.all([
      SetupConfigService.checkAllServices(),
      SetupConfigService.getAllDatabases(),
      SetupConfigService.getRedisConfig()
    ]);

    const exportData = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      services: services.map(s => ({
        id: s.id,
        name: s.name,
        port: s.port,
        category: s.category,
        database: s.database,
        redisDB: s.redisDB,
        autoStart: s.autoStart
      })),
      databases: databases.map(db => ({
        id: db.id,
        name: db.name,
        service: db.service,
        priority: db.priority
      })),
      redis: {
        host: redis.host,
        port: redis.port,
        enabled: redis.enabled,
        databases: redis.databases
      }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="exprsn-setup-config.json"');
    res.json(exportData);
  } catch (error) {
    console.error('[Setup] Error exporting config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export configuration',
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════
 * ENVIRONMENT CONFIGURATION API
 * ═══════════════════════════════════════════════════════════════════
 */

/**
 * GET /lowcode/api/setup/environment
 * Get all environment configuration variables
 */
router.get('/api/environment', async (req, res) => {
  try {
    const config = await SetupConfigService.getEnvironmentConfig();

    res.json({
      success: true,
      config
    });
  } catch (error) {
    console.error('[Setup] Error getting environment config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get environment configuration',
      error: error.message
    });
  }
});

/**
 * PUT /lowcode/api/setup/environment
 * Update environment configuration
 */
router.put('/api/environment', async (req, res) => {
  try {
    const updates = req.body;
    const result = await SetupConfigService.updateEnvironmentConfig(updates);

    res.json(result);
  } catch (error) {
    console.error('[Setup] Error updating environment config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update environment configuration',
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════
 * ADVANCED DATABASE API
 * ═══════════════════════════════════════════════════════════════════
 */

/**
 * GET /lowcode/api/setup/databases/:databaseId/statistics
 * Get detailed statistics for a database
 */
router.get('/api/databases/:databaseId/statistics', async (req, res) => {
  try {
    const { databaseId } = req.params;
    const databases = await SetupConfigService.getAllDatabases();
    const database = databases.find(db => db.id === databaseId);

    if (!database) {
      return res.status(404).json({
        success: false,
        message: 'Database not found'
      });
    }

    const stats = await SetupConfigService.getDatabaseStatistics(database.name);

    res.json(stats);
  } catch (error) {
    console.error('[Setup] Error getting database statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get database statistics',
      error: error.message
    });
  }
});

/**
 * POST /lowcode/api/setup/databases/:databaseId/backup
 * Create backup of database (implementation moved from placeholder)
 */
router.post('/api/databases/:databaseId/backup', async (req, res) => {
  try {
    const { databaseId } = req.params;
    const { backupPath } = req.body;

    const databases = await SetupConfigService.getAllDatabases();
    const database = databases.find(db => db.id === databaseId);

    if (!database) {
      return res.status(404).json({
        success: false,
        message: 'Database not found'
      });
    }

    const result = await SetupConfigService.backupDatabase(database.name, backupPath);

    res.json(result);
  } catch (error) {
    console.error('[Setup] Error backing up database:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to backup database',
      error: error.message
    });
  }
});

/**
 * POST /lowcode/api/setup/databases/:databaseId/restore
 * Restore database from backup
 */
router.post('/api/databases/:databaseId/restore', async (req, res) => {
  try {
    const { databaseId } = req.params;
    const { backupFile } = req.body;

    if (!backupFile) {
      return res.status(400).json({
        success: false,
        message: 'Backup file path is required'
      });
    }

    const databases = await SetupConfigService.getAllDatabases();
    const database = databases.find(db => db.id === databaseId);

    if (!database) {
      return res.status(404).json({
        success: false,
        message: 'Database not found'
      });
    }

    const result = await SetupConfigService.restoreDatabase(database.name, backupFile);

    res.json(result);
  } catch (error) {
    console.error('[Setup] Error restoring database:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to restore database',
      error: error.message
    });
  }
});

/**
 * GET /lowcode/api/setup/databases/:databaseId/migrations
 * Get migration status for database
 */
router.get('/api/databases/:databaseId/migrations', async (req, res) => {
  try {
    const { databaseId } = req.params;
    const databases = await SetupConfigService.getAllDatabases();
    const database = databases.find(db => db.id === databaseId);

    if (!database) {
      return res.status(404).json({
        success: false,
        message: 'Database not found'
      });
    }

    const result = await SetupConfigService.getMigrationStatus(database.name);

    res.json(result);
  } catch (error) {
    console.error('[Setup] Error getting migration status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get migration status',
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════
 * ADVANCED REDIS API
 * ═══════════════════════════════════════════════════════════════════
 */

/**
 * GET /lowcode/api/setup/redis/:dbNumber/info
 * Get detailed info for specific Redis database
 */
router.get('/api/redis/:dbNumber/info', async (req, res) => {
  try {
    const { dbNumber } = req.params;
    const db = parseInt(dbNumber);

    if (isNaN(db) || db < 0 || db > 15) {
      return res.status(400).json({
        success: false,
        message: 'Invalid database number (must be 0-15)'
      });
    }

    const result = await SetupConfigService.getRedisDbInfo(db);

    res.json(result);
  } catch (error) {
    console.error('[Setup] Error getting Redis DB info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get Redis database info',
      error: error.message
    });
  }
});

/**
 * GET /lowcode/api/setup/redis/:dbNumber/keys
 * Get keys matching pattern from Redis database
 */
router.get('/api/redis/:dbNumber/keys', async (req, res) => {
  try {
    const { dbNumber } = req.params;
    const { pattern = '*', limit = 100 } = req.query;
    const db = parseInt(dbNumber);

    if (isNaN(db) || db < 0 || db > 15) {
      return res.status(400).json({
        success: false,
        message: 'Invalid database number (must be 0-15)'
      });
    }

    const result = await SetupConfigService.getRedisKeysByPattern(
      pattern,
      db,
      parseInt(limit)
    );

    res.json(result);
  } catch (error) {
    console.error('[Setup] Error getting Redis keys:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get Redis keys',
      error: error.message
    });
  }
});

/**
 * DELETE /lowcode/api/setup/redis/:dbNumber/keys
 * Delete keys matching pattern from Redis database
 */
router.delete('/api/redis/:dbNumber/keys', async (req, res) => {
  try {
    const { dbNumber } = req.params;
    const { pattern } = req.body;
    const db = parseInt(dbNumber);

    if (isNaN(db) || db < 0 || db > 15) {
      return res.status(400).json({
        success: false,
        message: 'Invalid database number (must be 0-15)'
      });
    }

    if (!pattern) {
      return res.status(400).json({
        success: false,
        message: 'Pattern is required'
      });
    }

    const result = await SetupConfigService.deleteRedisKeysByPattern(pattern, db);

    res.json(result);
  } catch (error) {
    console.error('[Setup] Error deleting Redis keys:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete Redis keys',
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════
 * CA (CERTIFICATE AUTHORITY) CONFIGURATION API
 * ═══════════════════════════════════════════════════════════════════
 */

/**
 * GET /api/ca/configuration
 * Get CA configuration and status
 */
router.get('/api/ca/configuration', async (req, res) => {
  try {
    const config = await SetupConfigService.getCAConfiguration();
    res.json({
      success: true,
      configuration: config
    });
  } catch (error) {
    console.error('[Setup] Error getting CA configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get CA configuration',
      error: error.message
    });
  }
});

/**
 * PUT /api/ca/configuration
 * Update CA configuration
 */
router.put('/api/ca/configuration', async (req, res) => {
  try {
    const result = await SetupConfigService.updateCAConfiguration(req.body);
    res.json(result);
  } catch (error) {
    console.error('[Setup] Error updating CA configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update CA configuration',
      error: error.message
    });
  }
});

/**
 * POST /api/ca/test-connection
 * Test CA service connection
 */
router.post('/api/ca/test-connection', async (req, res) => {
  try {
    const result = await SetupConfigService.testCAConnection();
    res.json(result);
  } catch (error) {
    console.error('[Setup] Error testing CA connection:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test CA connection',
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════
 * AUTH (AUTHENTICATION & SSO) CONFIGURATION API
 * ═══════════════════════════════════════════════════════════════════
 */

/**
 * GET /api/auth/configuration
 * Get Auth configuration and status
 */
router.get('/api/auth/configuration', async (req, res) => {
  try {
    const config = await SetupConfigService.getAuthConfiguration();
    res.json({
      success: true,
      configuration: config
    });
  } catch (error) {
    console.error('[Setup] Error getting Auth configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get Auth configuration',
      error: error.message
    });
  }
});

/**
 * PUT /api/auth/configuration
 * Update Auth configuration
 */
router.put('/api/auth/configuration', async (req, res) => {
  try {
    const result = await SetupConfigService.updateAuthConfiguration(req.body);
    res.json(result);
  } catch (error) {
    console.error('[Setup] Error updating Auth configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update Auth configuration',
      error: error.message
    });
  }
});

/**
 * POST /api/auth/test-connection
 * Test Auth service connection
 */
router.post('/api/auth/test-connection', async (req, res) => {
  try {
    const result = await SetupConfigService.testAuthConnection();
    res.json(result);
  } catch (error) {
    console.error('[Setup] Error testing Auth connection:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test Auth connection',
      error: error.message
    });
  }
});

/**
 * POST /api/auth/generate-secrets
 * Generate new session/JWT secrets
 */
router.post('/api/auth/generate-secrets', async (req, res) => {
  try {
    const secrets = SetupConfigService.generateSecrets();
    res.json({
      success: true,
      secrets
    });
  } catch (error) {
    console.error('[Setup] Error generating secrets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate secrets',
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════
 * VAULT (SECRETS MANAGEMENT) CONFIGURATION ROUTES
 * ═══════════════════════════════════════════════════════════════════
 */

/**
 * GET /api/vault/configuration
 * Get comprehensive Vault configuration
 */
router.get('/api/vault/configuration', async (req, res) => {
  try {
    const config = await SetupConfigService.getVaultConfiguration();
    res.json({
      success: true,
      configuration: config
    });
  } catch (error) {
    console.error('[Setup] Error getting Vault configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get Vault configuration',
      error: error.message
    });
  }
});

/**
 * PUT /api/vault/configuration
 * Update Vault configuration
 */
router.put('/api/vault/configuration', async (req, res) => {
  try {
    const result = await SetupConfigService.updateVaultConfiguration(req.body);
    res.json(result);
  } catch (error) {
    console.error('[Setup] Error updating Vault configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update Vault configuration',
      error: error.message
    });
  }
});

/**
 * POST /api/vault/test-connection
 * Test Vault service connection
 */
router.post('/api/vault/test-connection', async (req, res) => {
  try {
    const result = await SetupConfigService.testVaultConnection();
    res.json(result);
  } catch (error) {
    console.error('[Setup] Error testing Vault connection:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test Vault connection',
      error: error.message
    });
  }
});

/**
 * GET /api/vault/secrets
 * List Vault secrets (metadata only)
 */
router.get('/api/vault/secrets', async (req, res) => {
  try {
    const result = await SetupConfigService.getVaultSecrets();
    res.json(result);
  } catch (error) {
    console.error('[Setup] Error listing Vault secrets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list secrets',
      error: error.message
    });
  }
});

/**
 * POST /api/vault/seal
 * Seal the Vault (emergency shutdown)
 */
router.post('/api/vault/seal', async (req, res) => {
  try {
    const result = await SetupConfigService.sealVault();
    res.json(result);
  } catch (error) {
    console.error('[Setup] Error sealing Vault:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to seal Vault',
      error: error.message
    });
  }
});

/**
 * POST /api/vault/unseal
 * Unseal the Vault
 */
router.post('/api/vault/unseal', async (req, res) => {
  try {
    const result = await SetupConfigService.unsealVault(req.body);
    res.json(result);
  } catch (error) {
    console.error('[Setup] Error unsealing Vault:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unseal Vault',
      error: error.message
    });
  }
});

/**
 * POST /api/vault/rotate-master-key
 * Rotate Vault master encryption key
 */
router.post('/api/vault/rotate-master-key', async (req, res) => {
  try {
    const result = await SetupConfigService.rotateVaultMasterKey();
    res.json(result);
  } catch (error) {
    console.error('[Setup] Error rotating Vault master key:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to rotate master key',
      error: error.message
    });
  }
});

// ============================================================================
// FILEVAULT (FILE MANAGEMENT) ROUTES
// ============================================================================

router.get('/api/filevault/configuration', async (req, res) => {
  try {
    const config = await SetupConfigService.getFileVaultConfiguration();
    res.json({ success: true, configuration: config });
  } catch (error) {
    console.error('[Setup] Error getting FileVault configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get FileVault configuration',
      error: error.message
    });
  }
});

router.put('/api/filevault/configuration', async (req, res) => {
  try {
    const result = await SetupConfigService.updateFileVaultConfiguration(req.body);
    res.json(result);
  } catch (error) {
    console.error('[Setup] Error updating FileVault configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update FileVault configuration',
      error: error.message
    });
  }
});

router.post('/api/filevault/test-connection', async (req, res) => {
  try {
    const result = await SetupConfigService.testFileVaultConnection();
    res.json(result);
  } catch (error) {
    console.error('[Setup] Error testing FileVault connection:', error);
    res.status(500).json({
      success: false,
      message: 'Connection test failed',
      error: error.message
    });
  }
});

// ============================================================================
// HERALD (NOTIFICATIONS) ROUTES
// ============================================================================

router.get('/api/herald/configuration', async (req, res) => {
  try {
    const config = await SetupConfigService.getHeraldConfiguration();
    res.json({ success: true, configuration: config });
  } catch (error) {
    console.error('[Setup] Error getting Herald configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get Herald configuration',
      error: error.message
    });
  }
});

router.put('/api/herald/configuration', async (req, res) => {
  try {
    const result = await SetupConfigService.updateHeraldConfiguration(req.body);
    res.json(result);
  } catch (error) {
    console.error('[Setup] Error updating Herald configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update Herald configuration',
      error: error.message
    });
  }
});

router.post('/api/herald/test-connection', async (req, res) => {
  try {
    const result = await SetupConfigService.testHeraldConnection();
    res.json(result);
  } catch (error) {
    console.error('[Setup] Error testing Herald connection:', error);
    res.status(500).json({
      success: false,
      message: 'Connection test failed',
      error: error.message
    });
  }
});

// ============================================================================
// WORKFLOW AUTOMATION ROUTES
// ============================================================================

router.get('/api/workflow/configuration', async (req, res) => {
  try {
    const config = await SetupConfigService.getWorkflowConfiguration();
    res.json({ success: true, configuration: config });
  } catch (error) {
    console.error('[Setup] Error getting Workflow configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get Workflow configuration',
      error: error.message
    });
  }
});

router.put('/api/workflow/configuration', async (req, res) => {
  try {
    const result = await SetupConfigService.updateWorkflowConfiguration(req.body);
    res.json(result);
  } catch (error) {
    console.error('[Setup] Error updating Workflow configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update Workflow configuration',
      error: error.message
    });
  }
});

router.post('/api/workflow/test-connection', async (req, res) => {
  try {
    const result = await SetupConfigService.testWorkflowConnection();
    res.json(result);
  } catch (error) {
    console.error('[Setup] Error testing Workflow connection:', error);
    res.status(500).json({
      success: false,
      message: 'Connection test failed',
      error: error.message
    });
  }
});

// ============================================================================
// SETUP (SERVICE DISCOVERY) ROUTES
// ============================================================================

router.get('/api/setup/configuration', async (req, res) => {
  try {
    const config = await SetupConfigService.getSetupConfiguration();
    res.json({ success: true, configuration: config });
  } catch (error) {
    console.error('[Setup] Error getting Setup configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get Setup configuration',
      error: error.message
    });
  }
});

router.put('/api/setup/configuration', async (req, res) => {
  try {
    const result = await SetupConfigService.updateSetupConfiguration(req.body);
    res.json(result);
  } catch (error) {
    console.error('[Setup] Error updating Setup configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update Setup configuration',
      error: error.message
    });
  }
});

router.post('/api/setup/test-connection', async (req, res) => {
  try {
    const result = await SetupConfigService.testSetupConnection();
    res.json(result);
  } catch (error) {
    console.error('[Setup] Error testing Setup connection:', error);
    res.status(500).json({
      success: false,
      message: 'Connection test failed',
      error: error.message
    });
  }
});

// ============================================================================
// BUSINESS HUB (EXPRSN-SVR) ROUTES
// ============================================================================

router.get('/api/business-hub/configuration', async (req, res) => {
  try {
    const config = await SetupConfigService.getBusinessHubConfiguration();
    res.json({ success: true, configuration: config });
  } catch (error) {
    console.error('[Setup] Error getting Business Hub configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get Business Hub configuration',
      error: error.message
    });
  }
});

router.put('/api/business-hub/configuration', async (req, res) => {
  try {
    const result = await SetupConfigService.updateBusinessHubConfiguration(req.body);
    res.json(result);
  } catch (error) {
    console.error('[Setup] Error updating Business Hub configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update Business Hub configuration',
      error: error.message
    });
  }
});

module.exports = router;
