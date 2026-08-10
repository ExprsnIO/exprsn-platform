/**
 * ═══════════════════════════════════════════════════════════════════════
 * PostgreSQL Infrastructure Routes
 * API endpoints for PostgreSQL database management
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const postgresqlManager = require('../../services/infrastructure/postgresqlManager');
const logger = require('../../utils/logger');

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CONNECTION & HEALTH
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/infrastructure/postgresql/test - Test PostgreSQL connection
router.get('/test', async (req, res) => {
  try {
    const result = await postgresqlManager.testConnection();

    res.json(result);
  } catch (error) {
    logger.error('PostgreSQL connection test failed:', error);
    res.status(500).json({
      success: false,
      error: 'Connection test failed',
      message: error.message
    });
  }
});

// GET /api/infrastructure/postgresql/stats - Get server statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await postgresqlManager.getServerStats();

    res.json(stats);
  } catch (error) {
    logger.error('Failed to get PostgreSQL stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get server statistics',
      message: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * DATABASE MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/infrastructure/postgresql/databases - List all databases
router.get('/databases', async (req, res) => {
  try {
    const result = await postgresqlManager.listDatabases();

    res.json(result);
  } catch (error) {
    logger.error('Failed to list databases:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list databases',
      message: error.message
    });
  }
});

// GET /api/infrastructure/postgresql/databases/:name - Get database details
router.get('/databases/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const details = await postgresqlManager.getDatabaseDetails(name);

    res.json(details);
  } catch (error) {
    logger.error(`Failed to get database details for ${req.params.name}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get database details',
      message: error.message
    });
  }
});

// POST /api/infrastructure/postgresql/databases - Create database
router.post('/databases', async (req, res) => {
  try {
    const { name, encoding, locale, template } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Database name is required'
      });
    }

    const result = await postgresqlManager.createDatabase(name, {
      encoding,
      locale,
      template
    });

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('postgresql:database-created', {
        database: name,
        timestamp: new Date().toISOString()
      });
    }

    res.status(result.success ? 201 : 400).json(result);
  } catch (error) {
    logger.error('Failed to create database:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create database',
      message: error.message
    });
  }
});

// DELETE /api/infrastructure/postgresql/databases/:name - Drop database
router.delete('/databases/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { skipTerminateConnections } = req.query;

    const result = await postgresqlManager.dropDatabase(name, {
      skipTerminateConnections: skipTerminateConnections === 'true'
    });

    // Emit Socket.IO event
    if (req.app.get('io') && result.success) {
      req.app.get('io').emit('postgresql:database-dropped', {
        database: name,
        timestamp: new Date().toISOString()
      });
    }

    res.json(result);
  } catch (error) {
    logger.error(`Failed to drop database ${req.params.name}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to drop database',
      message: error.message
    });
  }
});

// POST /api/infrastructure/postgresql/databases/create-all - Create all service databases
router.post('/databases/create-all', async (req, res) => {
  try {
    logger.info('Creating all service databases...');

    const result = await postgresqlManager.createAllServiceDatabases();

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('postgresql:databases-created-all', {
        created: result.created.length,
        skipped: result.skipped.length,
        failed: result.failed.length,
        timestamp: new Date().toISOString()
      });
    }

    res.status(result.success ? 200 : 207).json(result);
  } catch (error) {
    logger.error('Failed to create all service databases:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create all service databases',
      message: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * MIGRATION MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/infrastructure/postgresql/migrations/:serviceId - Get migration status
router.get('/migrations/:serviceId', async (req, res) => {
  try {
    const { serviceId } = req.params;

    const status = await postgresqlManager.getMigrationStatus(serviceId);

    res.json(status);
  } catch (error) {
    logger.error(`Failed to get migration status for ${req.params.serviceId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get migration status',
      message: error.message
    });
  }
});

// POST /api/infrastructure/postgresql/migrations/:serviceId/run - Run migrations
router.post('/migrations/:serviceId/run', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { env } = req.body;

    logger.info(`Running migrations for service: ${serviceId}`);

    const result = await postgresqlManager.runMigrations(serviceId, { env });

    // Emit Socket.IO event
    if (req.app.get('io') && result.success) {
      req.app.get('io').emit('postgresql:migrations-run', {
        service: serviceId,
        timestamp: new Date().toISOString()
      });
    }

    res.json(result);
  } catch (error) {
    logger.error(`Failed to run migrations for ${req.params.serviceId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to run migrations',
      message: error.message
    });
  }
});

// POST /api/infrastructure/postgresql/migrations/:serviceId/rollback - Rollback migrations
router.post('/migrations/:serviceId/rollback', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { env, steps } = req.body;

    logger.info(`Rolling back migrations for service: ${serviceId}`);

    const result = await postgresqlManager.rollbackMigrations(serviceId, { env, steps });

    // Emit Socket.IO event
    if (req.app.get('io') && result.success) {
      req.app.get('io').emit('postgresql:migrations-rollback', {
        service: serviceId,
        steps: steps || 1,
        timestamp: new Date().toISOString()
      });
    }

    res.json(result);
  } catch (error) {
    logger.error(`Failed to rollback migrations for ${req.params.serviceId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to rollback migrations',
      message: error.message
    });
  }
});

// POST /api/infrastructure/postgresql/migrations/run-all - Run migrations for all services
router.post('/migrations/run-all', async (req, res) => {
  try {
    const { env } = req.body;

    logger.info('Running migrations for all services...');

    const result = await postgresqlManager.runAllMigrations({ env });

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('postgresql:migrations-run-all', {
        succeeded: result.succeeded.length,
        failed: result.failed.length,
        timestamp: new Date().toISOString()
      });
    }

    res.status(result.success ? 200 : 207).json(result);
  } catch (error) {
    logger.error('Failed to run migrations for all services:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run migrations for all services',
      message: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CONNECTION MONITORING
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/infrastructure/postgresql/connections - Get active connections
router.get('/connections', async (req, res) => {
  try {
    const connections = await postgresqlManager.getActiveConnections();

    res.json(connections);
  } catch (error) {
    logger.error('Failed to get active connections:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get active connections',
      message: error.message
    });
  }
});

// POST /api/infrastructure/postgresql/connections/:database/terminate - Terminate connections
router.post('/connections/:database/terminate', async (req, res) => {
  try {
    const { database } = req.params;

    logger.info(`Terminating connections to database: ${database}`);

    const result = await postgresqlManager.terminateConnections(database);

    // Emit Socket.IO event
    if (req.app.get('io') && result.success) {
      req.app.get('io').emit('postgresql:connections-terminated', {
        database,
        terminated: result.terminated,
        timestamp: new Date().toISOString()
      });
    }

    res.json(result);
  } catch (error) {
    logger.error(`Failed to terminate connections for ${req.params.database}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to terminate connections',
      message: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * REALTIME UPDATES
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/infrastructure/postgresql/subscribe - Subscribe to PostgreSQL events
router.get('/subscribe', (req, res) => {
  // This endpoint is for documentation purposes
  // Actual subscription happens via Socket.IO client
  res.json({
    success: true,
    message: 'Use Socket.IO to subscribe to PostgreSQL events',
    events: [
      'postgresql:database-created',
      'postgresql:database-dropped',
      'postgresql:databases-created-all',
      'postgresql:migrations-run',
      'postgresql:migrations-rollback',
      'postgresql:migrations-run-all',
      'postgresql:connections-terminated',
      'postgresql:stats-updated'
    ]
  });
});

module.exports = router;
