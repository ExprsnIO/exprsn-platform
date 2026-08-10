/**
 * Database Schema Routes
 * API endpoints for creating and managing database schema items
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const {
  createTable,
  createIndex,
  createView,
  createFunction,
  createTrigger,
  createEnum,
  dropTable,
  getTableSchema,
  listTables,
  getPostgresTypes
} = require('../services/schemaGenerator');

/**
 * Helper function to get DB config from request
 * @param {Object} req - Express request
 * @returns {Object} Database configuration
 */
function getDbConfig(req) {
  return {
    host: req.body.dbHost || process.env.DB_HOST || 'localhost',
    port: req.body.dbPort || process.env.DB_PORT || 5432,
    user: req.body.dbUser || process.env.DB_USER || 'postgres',
    password: req.body.dbPassword || process.env.DB_PASSWORD
  };
}

/**
 * GET /api/schema/types
 * Get available PostgreSQL data types
 */
router.get('/types', (req, res) => {
  try {
    const types = getPostgresTypes();

    res.json({
      success: true,
      types
    });
  } catch (error) {
    logger.error('Error getting PostgreSQL types:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get PostgreSQL types',
      message: error.message
    });
  }
});

/**
 * POST /api/schema/table
 * Create a new table
 *
 * Request body:
 * {
 *   database: string (required)
 *   tableName: string (required)
 *   columns: Array (required) - Column definitions
 *   constraints: Array (optional) - Table constraints
 *   ifNotExists: boolean (optional, default: true)
 *   dbHost, dbPort, dbUser, dbPassword: optional DB config
 * }
 */
router.post('/table', async (req, res) => {
  try {
    const { database, tableName, columns, constraints, ifNotExists = true } = req.body;

    if (!database || !tableName || !columns || columns.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Database, table name, and columns are required'
      });
    }

    const dbConfig = getDbConfig(req);

    const result = await createTable(database, {
      tableName,
      columns,
      constraints,
      ifNotExists
    }, dbConfig);

    logger.info(`Table ${tableName} created in ${database} via API`);

    res.status(201).json(result);
  } catch (error) {
    logger.error('Error creating table:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create table',
      message: error.message
    });
  }
});

/**
 * POST /api/schema/index
 * Create a new index
 *
 * Request body:
 * {
 *   database: string (required)
 *   indexName: string (required)
 *   tableName: string (required)
 *   columns: Array (required)
 *   unique: boolean (optional)
 *   method: string (optional) - btree, hash, gist, gin
 *   where: string (optional) - WHERE clause
 *   ifNotExists: boolean (optional, default: true)
 * }
 */
router.post('/index', async (req, res) => {
  try {
    const {
      database,
      indexName,
      tableName,
      columns,
      unique = false,
      method = 'btree',
      where,
      ifNotExists = true
    } = req.body;

    if (!database || !indexName || !tableName || !columns || columns.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Database, index name, table name, and columns are required'
      });
    }

    const dbConfig = getDbConfig(req);

    const result = await createIndex(database, {
      indexName,
      tableName,
      columns,
      unique,
      method,
      where,
      ifNotExists
    }, dbConfig);

    logger.info(`Index ${indexName} created in ${database} via API`);

    res.status(201).json(result);
  } catch (error) {
    logger.error('Error creating index:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create index',
      message: error.message
    });
  }
});

/**
 * POST /api/schema/view
 * Create a new view
 *
 * Request body:
 * {
 *   database: string (required)
 *   viewName: string (required)
 *   query: string (required) - SELECT query
 *   orReplace: boolean (optional, default: true)
 * }
 */
router.post('/view', async (req, res) => {
  try {
    const { database, viewName, query, orReplace = true } = req.body;

    if (!database || !viewName || !query) {
      return res.status(400).json({
        success: false,
        error: 'Database, view name, and query are required'
      });
    }

    const dbConfig = getDbConfig(req);

    const result = await createView(database, {
      viewName,
      query,
      orReplace
    }, dbConfig);

    logger.info(`View ${viewName} created in ${database} via API`);

    res.status(201).json(result);
  } catch (error) {
    logger.error('Error creating view:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create view',
      message: error.message
    });
  }
});

/**
 * POST /api/schema/function
 * Create a new function
 *
 * Request body:
 * {
 *   database: string (required)
 *   functionName: string (required)
 *   parameters: Array (optional)
 *   returnType: string (required)
 *   body: string (required) - Function body
 *   language: string (optional, default: 'plpgsql')
 *   orReplace: boolean (optional, default: true)
 * }
 */
router.post('/function', async (req, res) => {
  try {
    const {
      database,
      functionName,
      parameters = [],
      returnType,
      body,
      language = 'plpgsql',
      orReplace = true
    } = req.body;

    if (!database || !functionName || !returnType || !body) {
      return res.status(400).json({
        success: false,
        error: 'Database, function name, return type, and body are required'
      });
    }

    const dbConfig = getDbConfig(req);

    const result = await createFunction(database, {
      functionName,
      parameters,
      returnType,
      body,
      language,
      orReplace
    }, dbConfig);

    logger.info(`Function ${functionName} created in ${database} via API`);

    res.status(201).json(result);
  } catch (error) {
    logger.error('Error creating function:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create function',
      message: error.message
    });
  }
});

/**
 * POST /api/schema/trigger
 * Create a new trigger
 *
 * Request body:
 * {
 *   database: string (required)
 *   triggerName: string (required)
 *   tableName: string (required)
 *   timing: string (required) - BEFORE, AFTER, INSTEAD OF
 *   events: Array (required) - INSERT, UPDATE, DELETE
 *   functionName: string (required)
 *   forEach: string (optional, default: 'ROW')
 *   when: string (optional) - Condition
 *   orReplace: boolean (optional, default: false)
 * }
 */
router.post('/trigger', async (req, res) => {
  try {
    const {
      database,
      triggerName,
      tableName,
      timing,
      events,
      functionName,
      forEach = 'ROW',
      when,
      orReplace = false
    } = req.body;

    if (!database || !triggerName || !tableName || !timing || !events || !functionName) {
      return res.status(400).json({
        success: false,
        error: 'Database, trigger name, table name, timing, events, and function name are required'
      });
    }

    const dbConfig = getDbConfig(req);

    const result = await createTrigger(database, {
      triggerName,
      tableName,
      timing,
      events,
      functionName,
      forEach,
      when,
      orReplace
    }, dbConfig);

    logger.info(`Trigger ${triggerName} created in ${database} via API`);

    res.status(201).json(result);
  } catch (error) {
    logger.error('Error creating trigger:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create trigger',
      message: error.message
    });
  }
});

/**
 * POST /api/schema/enum
 * Create a new enum type
 *
 * Request body:
 * {
 *   database: string (required)
 *   enumName: string (required)
 *   values: Array (required) - Enum values
 *   ifNotExists: boolean (optional, default: true)
 * }
 */
router.post('/enum', async (req, res) => {
  try {
    const { database, enumName, values, ifNotExists = true } = req.body;

    if (!database || !enumName || !values || values.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Database, enum name, and values are required'
      });
    }

    const dbConfig = getDbConfig(req);

    const result = await createEnum(database, {
      enumName,
      values,
      ifNotExists
    }, dbConfig);

    logger.info(`Enum ${enumName} created in ${database} via API`);

    res.status(201).json(result);
  } catch (error) {
    logger.error('Error creating enum:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create enum',
      message: error.message
    });
  }
});

/**
 * DELETE /api/schema/table/:database/:tableName
 * Drop a table
 */
router.delete('/table/:database/:tableName', async (req, res) => {
  try {
    const { database, tableName } = req.params;
    const { cascade = false } = req.query;

    if (!database || !tableName) {
      return res.status(400).json({
        success: false,
        error: 'Database and table name are required'
      });
    }

    // Require confirmation
    if (req.query.confirm !== 'true') {
      return res.status(400).json({
        success: false,
        error: 'Table deletion must be confirmed with ?confirm=true'
      });
    }

    const dbConfig = getDbConfig(req);

    const result = await dropTable(database, tableName, dbConfig, cascade === 'true');

    logger.info(`Table ${tableName} dropped from ${database} via API`);

    res.json(result);
  } catch (error) {
    logger.error(`Error dropping table ${req.params.tableName}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to drop table',
      message: error.message
    });
  }
});

/**
 * GET /api/schema/table/:database/:tableName
 * Get table schema information
 */
router.get('/table/:database/:tableName', async (req, res) => {
  try {
    const { database, tableName } = req.params;

    if (!database || !tableName) {
      return res.status(400).json({
        success: false,
        error: 'Database and table name are required'
      });
    }

    const dbConfig = getDbConfig(req);

    const schema = await getTableSchema(database, tableName, dbConfig);

    res.json(schema);
  } catch (error) {
    logger.error(`Error getting table schema for ${req.params.tableName}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get table schema',
      message: error.message
    });
  }
});

/**
 * GET /api/schema/tables/:database
 * List all tables in a database
 */
router.get('/tables/:database', async (req, res) => {
  try {
    const { database } = req.params;

    if (!database) {
      return res.status(400).json({
        success: false,
        error: 'Database is required'
      });
    }

    const dbConfig = getDbConfig(req);

    const tables = await listTables(database, dbConfig);

    res.json({
      success: true,
      database,
      count: tables.length,
      tables
    });
  } catch (error) {
    logger.error(`Error listing tables in ${req.params.database}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to list tables',
      message: error.message
    });
  }
});

module.exports = router;
