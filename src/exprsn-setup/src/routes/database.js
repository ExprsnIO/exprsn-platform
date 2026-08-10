/**
 * Database Routes
 * API endpoints for database management
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const {
  createDatabase,
  executeSQLScript,
  uploadSQLFile,
  initializeServiceDatabase,
  createAllServiceDatabases,
  initializeAllServiceDatabases,
  getServiceSchema,
  getDatabaseInfo,
  SERVICE_DATABASES
} = require('../services/database');

// Configure multer for file uploads
const upload = multer({
  dest: path.join(__dirname, '../../uploads'),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/sql' ||
        file.originalname.endsWith('.sql') ||
        file.mimetype === 'text/plain') {
      cb(null, true);
    } else {
      cb(new Error('Only SQL files are allowed'));
    }
  }
});

// Get database config from request body or environment
function getDbConfig(req) {
  return {
    host: req.body.dbHost || process.env.DB_HOST || 'localhost',
    port: req.body.dbPort || process.env.DB_PORT || 5432,
    user: req.body.dbUser || process.env.DB_USER || 'postgres',
    password: req.body.dbPassword || process.env.DB_PASSWORD || ''
  };
}

/**
 * POST /api/database/upload-sql
 * Upload SQL file
 */
router.post('/upload-sql', upload.single('sqlFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No SQL file provided'
      });
    }

    const { database } = req.body;
    if (!database) {
      return res.status(400).json({
        success: false,
        error: 'Database name is required'
      });
    }

    const config = getDbConfig(req);
    const result = await uploadSQLFile(database, req.file.path, config);

    // Clean up uploaded file
    await fs.unlink(req.file.path);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Error uploading SQL file:', error);

    // Clean up uploaded file on error
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        logger.error('Error cleaning up uploaded file:', unlinkError);
      }
    }

    res.status(500).json({
      success: false,
      error: 'Failed to upload SQL file',
      message: error.message
    });
  }
});

/**
 * POST /api/database/execute
 * Execute SQL script on database
 */
router.post('/execute', async (req, res) => {
  try {
    const { database, sql } = req.body;

    if (!database || !sql) {
      return res.status(400).json({
        success: false,
        error: 'Database name and SQL script are required'
      });
    }

    const config = getDbConfig(req);
    const result = await executeSQLScript(database, sql, config);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Error executing SQL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute SQL',
      message: error.message
    });
  }
});

/**
 * POST /api/database/create
 * Create a single database
 */
router.post('/create', async (req, res) => {
  try {
    const { database } = req.body;

    if (!database) {
      return res.status(400).json({
        success: false,
        error: 'Database name is required'
      });
    }

    const config = getDbConfig(req);
    const result = await createDatabase(database, config);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Error creating database:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create database',
      message: error.message
    });
  }
});

/**
 * POST /api/database/create-service-dbs
 * Create databases for all services
 */
router.post('/create-service-dbs', async (req, res) => {
  try {
    const config = getDbConfig(req);
    const results = await createAllServiceDatabases(config);

    const successCount = results.filter(r => r.success).length;

    res.json({
      success: true,
      total: results.length,
      successful: successCount,
      failed: results.length - successCount,
      results
    });
  } catch (error) {
    logger.error('Error creating service databases:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create service databases',
      message: error.message
    });
  }
});

/**
 * POST /api/database/initialize-service
 * Initialize database for a specific service
 */
router.post('/initialize-service', async (req, res) => {
  try {
    const { service } = req.body;

    if (!service) {
      return res.status(400).json({
        success: false,
        error: 'Service name is required'
      });
    }

    const config = getDbConfig(req);
    const result = await initializeServiceDatabase(service, config);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error(`Error initializing database for ${req.body.service}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize service database',
      message: error.message
    });
  }
});

/**
 * POST /api/database/initialize-all
 * Initialize databases for all services
 */
router.post('/initialize-all', async (req, res) => {
  try {
    const config = getDbConfig(req);
    const results = await initializeAllServiceDatabases(config);

    const successCount = results.filter(r => r.success).length;

    res.json({
      success: true,
      total: results.length,
      successful: successCount,
      failed: results.length - successCount,
      results
    });
  } catch (error) {
    logger.error('Error initializing service databases:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize service databases',
      message: error.message
    });
  }
});

/**
 * GET /api/database/schema/:service
 * Get schema SQL for a service
 */
router.get('/schema/:service', async (req, res) => {
  try {
    const { service } = req.params;
    const schema = await getServiceSchema(service);

    res.type('text/plain').send(schema);
  } catch (error) {
    logger.error(`Error getting schema for ${req.params.service}:`, error);
    res.status(404).json({
      success: false,
      error: 'Schema not found',
      message: error.message
    });
  }
});

/**
 * GET /api/database/info/:service
 * Get database information for a service
 */
router.get('/info/:service', async (req, res) => {
  try {
    const { service } = req.params;
    const config = getDbConfig(req);
    const info = await getDatabaseInfo(service, config);

    res.json({
      success: true,
      info
    });
  } catch (error) {
    logger.error(`Error getting database info for ${req.params.service}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get database info',
      message: error.message
    });
  }
});

/**
 * GET /api/database/list
 * List all service databases
 */
router.get('/list', (req, res) => {
  try {
    res.json({
      success: true,
      databases: SERVICE_DATABASES
    });
  } catch (error) {
    logger.error('Error listing databases:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list databases',
      message: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * Database Manager Routes (Enhanced Administration)
 * ═══════════════════════════════════════════════════════════════════════
 */
const databaseManager = require('../services/databaseManager');

/**
 * POST /api/database/test-connection
 * Test PostgreSQL connection
 */
router.post('/test-connection', async (req, res) => {
  try {
    const config = getDbConfig(req);
    const result = await databaseManager.testConnection(
      config.host,
      config.port,
      config.user,
      config.password
    );

    res.json(result);
  } catch (error) {
    logger.error('Error testing database connection:', error);
    res.status(500).json({
      success: false,
      error: 'Connection test failed',
      message: error.message
    });
  }
});

/**
 * GET /api/database/status/:service
 * Get comprehensive database status for a service
 */
router.get('/status/:service', async (req, res) => {
  try {
    const { service } = req.params;
    const config = getDbConfig(req);
    const info = await databaseManager.getServiceDatabaseInfo(service, config);

    res.json(info);
  } catch (error) {
    logger.error(`Error getting database status for ${req.params.service}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get database status',
      message: error.message
    });
  }
});

/**
 * GET /api/database/status-all
 * Get status for all service databases
 */
router.get('/status-all', async (req, res) => {
  try {
    const config = getDbConfig(req);
    const results = await databaseManager.getAllServiceDatabasesInfo(config);

    const existingCount = results.filter(r => r.exists).length;

    res.json({
      success: true,
      total: results.length,
      existing: existingCount,
      missing: results.length - existingCount,
      databases: results
    });
  } catch (error) {
    logger.error('Error getting all database statuses:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get database statuses',
      message: error.message
    });
  }
});

/**
 * POST /api/database/query
 * Run a SQL query on a database
 */
router.post('/query', async (req, res) => {
  try {
    const { database, query } = req.body;

    if (!database || !query) {
      return res.status(400).json({
        success: false,
        error: 'Database name and query are required'
      });
    }

    const config = getDbConfig(req);
    const result = await databaseManager.runQuery(
      database,
      query,
      config.host,
      config.port,
      config.user,
      config.password
    );

    res.json(result);
  } catch (error) {
    logger.error('Error running database query:', error);
    res.status(500).json({
      success: false,
      error: 'Query execution failed',
      message: error.message
    });
  }
});

/**
 * POST /api/database/backup
 * Backup a database
 */
router.post('/backup', async (req, res) => {
  try {
    const { database, outputPath } = req.body;

    if (!database || !outputPath) {
      return res.status(400).json({
        success: false,
        error: 'Database name and output path are required'
      });
    }

    const config = getDbConfig(req);
    const result = await databaseManager.backupDatabase(
      database,
      outputPath,
      config.host,
      config.port,
      config.user,
      config.password
    );

    res.json(result);
  } catch (error) {
    logger.error('Error backing up database:', error);
    res.status(500).json({
      success: false,
      error: 'Backup failed',
      message: error.message
    });
  }
});

/**
 * POST /api/database/restore
 * Restore a database from backup
 */
router.post('/restore', async (req, res) => {
  try {
    const { database, backupPath } = req.body;

    if (!database || !backupPath) {
      return res.status(400).json({
        success: false,
        error: 'Database name and backup path are required'
      });
    }

    const config = getDbConfig(req);
    const result = await databaseManager.restoreDatabase(
      database,
      backupPath,
      config.host,
      config.port,
      config.user,
      config.password
    );

    res.json(result);
  } catch (error) {
    logger.error('Error restoring database:', error);
    res.status(500).json({
      success: false,
      error: 'Restore failed',
      message: error.message
    });
  }
});

module.exports = router;
