/**
 * ═══════════════════════════════════════════════════════════
 * DataSources API Routes
 * Complete CRUD operations for managing data source connections
 * Supports: PostgreSQL, Redis, Forge, REST, SOAP, Schemas, Plugins
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { Sequelize } = require('sequelize');
const Joi = require('joi');
const db = require('../models');

// ═══════════════════════════════════════════════════════════
// CRUD Operations for DataSources
// ═══════════════════════════════════════════════════════════

/**
 * Validation schema for datasource creation
 */
const createDataSourceSchema = Joi.object({
  name: Joi.string().pattern(/^[a-zA-Z][a-zA-Z0-9_]*$/).max(255).required(),
  displayName: Joi.string().max(255).required(),
  description: Joi.string().allow('', null),
  sourceType: Joi.string().valid(
    'postgresql', 'forge', 'rest', 'soap', 'webhook',
    'json', 'xml', 'csv', 'tsv', 'redis', 'plugin', 'schema', 'webservice'
  ).required(),
  connectionConfig: Joi.object().required(),
  schemaConfig: Joi.object().optional().allow(null),
  operations: Joi.object({
    read: Joi.boolean(),
    create: Joi.boolean(),
    update: Joi.boolean(),
    delete: Joi.boolean(),
  }).optional(),
  delegable: Joi.boolean().optional(),
  cacheEnabled: Joi.boolean().optional(),
  cacheTtl: Joi.number().integer().min(0).optional().allow(null),
  timeout: Joi.number().integer().min(1000).max(300000).optional(),
  retryConfig: Joi.object({
    enabled: Joi.boolean(),
    maxRetries: Joi.number().integer().min(0).max(10),
    backoffMs: Joi.number().integer().min(100),
  }).optional(),
  authConfig: Joi.object().optional().allow(null),
  headers: Joi.object().optional().allow(null),
  pluginId: Joi.string().uuid().optional().allow(null),
  pluginConfig: Joi.object().optional().allow(null),
  icon: Joi.string().max(100).optional(),
  color: Joi.string().max(20).optional(),
  metadata: Joi.object().optional(),
});

/**
 * GET /datasources
 * List all datasources for an application
 */
router.get('/', async (req, res) => {
  try {
    const { applicationId, sourceType, status } = req.query;

    const where = {};
    if (applicationId) where.applicationId = applicationId;
    if (sourceType) where.sourceType = sourceType;
    if (status) where.status = status;

    const dataSources = await db.DataSource.findAll({
      where,
      include: [
        {
          model: db.Application,
          as: 'application',
          attributes: ['id', 'name', 'displayName'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    res.json({
      success: true,
      data: {
        dataSources,
        count: dataSources.length,
      },
    });
  } catch (error) {
    console.error('Failed to fetch datasources:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /datasources/:id
 * Get a specific datasource by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const dataSource = await db.DataSource.findByPk(id, {
      include: [
        {
          model: db.Application,
          as: 'application',
          attributes: ['id', 'name', 'displayName'],
        },
      ],
    });

    if (!dataSource) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'DataSource not found',
      });
    }

    res.json({
      success: true,
      data: dataSource,
    });
  } catch (error) {
    console.error('Failed to fetch datasource:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /datasources
 * Create a new datasource
 */
router.post('/', async (req, res) => {
  try {
    const { applicationId, ...dataSourceData } = req.body;

    // Validate request
    const { error, value } = createDataSourceSchema.validate(dataSourceData);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message,
      });
    }

    if (!applicationId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'applicationId is required',
      });
    }

    // Check if application exists
    const application = await db.Application.findByPk(applicationId);
    if (!application) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Application not found',
      });
    }

    // Create datasource
    const dataSource = await db.DataSource.create({
      applicationId,
      ...value,
    });

    res.status(201).json({
      success: true,
      data: dataSource,
      message: 'DataSource created successfully',
    });
  } catch (error) {
    console.error('Failed to create datasource:', error);

    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        success: false,
        error: 'DUPLICATE_NAME',
        message: 'A datasource with this name already exists in this application',
      });
    }

    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: error.message,
    });
  }
});

/**
 * PUT /datasources/:id
 * Update a datasource
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Remove applicationId from updates (cannot change)
    delete updateData.applicationId;

    const dataSource = await db.DataSource.findByPk(id);
    if (!dataSource) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'DataSource not found',
      });
    }

    // Update datasource
    await dataSource.update(updateData);

    res.json({
      success: true,
      data: dataSource,
      message: 'DataSource updated successfully',
    });
  } catch (error) {
    console.error('Failed to update datasource:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: error.message,
    });
  }
});

/**
 * DELETE /datasources/:id
 * Delete a datasource (soft delete)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const dataSource = await db.DataSource.findByPk(id);
    if (!dataSource) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'DataSource not found',
      });
    }

    // Soft delete
    await dataSource.destroy();

    res.json({
      success: true,
      message: 'DataSource deleted successfully',
    });
  } catch (error) {
    console.error('Failed to delete datasource:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /datasources/:id/test
 * Test datasource connection
 */
router.post('/:id/test', async (req, res) => {
  try {
    const { id } = req.params;

    const dataSource = await db.DataSource.findByPk(id);
    if (!dataSource) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'DataSource not found',
      });
    }

    // Test connection based on source type
    let testResult;
    try {
      testResult = await testConnection(dataSource);

      dataSource.lastTestedAt = new Date();
      dataSource.lastTestResult = testResult;
      dataSource.status = testResult.success ? 'active' : 'error';
      await dataSource.save();

      res.json({
        success: true,
        data: testResult,
        message: testResult.success ? 'Connection successful' : 'Connection failed',
      });
    } catch (testError) {
      dataSource.lastTestedAt = new Date();
      dataSource.lastTestResult = {
        success: false,
        error: testError.message,
      };
      dataSource.status = 'error';
      await dataSource.save();

      res.status(500).json({
        success: false,
        error: 'CONNECTION_TEST_FAILED',
        message: testError.message,
      });
    }
  } catch (error) {
    console.error('Failed to test datasource:', error);
    res.status(500).json({
      success: false,
      error: 'TEST_FAILED',
      message: error.message,
    });
  }
});

/**
 * Helper function to test datasource connection
 */
async function testConnection(dataSource) {
  const { sourceType, connectionConfig } = dataSource;

  switch (sourceType) {
    case 'postgresql':
      return await testPostgreSQLConnection(connectionConfig);
    case 'redis':
      return await testRedisConnection(connectionConfig);
    case 'rest':
      return await testRESTConnection(connectionConfig);
    case 'forge':
      return await testForgeConnection(connectionConfig);
    default:
      return {
        success: true,
        message: `Connection test not implemented for ${sourceType}`,
        warning: 'Connection not verified',
      };
  }
}

async function testPostgreSQLConnection(config) {
  const { Sequelize } = require('sequelize');
  const testSequelize = new Sequelize({
    host: config.host,
    port: config.port,
    database: config.database,
    username: config.username,
    password: config.password,
    dialect: 'postgres',
    logging: false,
  });

  try {
    await testSequelize.authenticate();
    await testSequelize.close();
    return { success: true, message: 'PostgreSQL connection successful' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function testRedisConnection(config) {
  const Redis = require('ioredis');
  const redis = new Redis({
    host: config.host || 'localhost',
    port: config.port || 6379,
    password: config.password,
    db: config.database || 0,
    connectTimeout: 5000,
  });

  try {
    await redis.ping();
    await redis.quit();
    return { success: true, message: 'Redis connection successful' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function testRESTConnection(config) {
  const axios = require('axios');
  try {
    const response = await axios({
      method: config.testMethod || 'GET',
      url: config.baseUrl + (config.testEndpoint || ''),
      headers: config.headers || {},
      timeout: 10000,
    });

    return {
      success: true,
      message: 'REST API connection successful',
      statusCode: response.status,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      statusCode: error.response?.status,
    };
  }
}

async function testForgeConnection(config) {
  // Test connection to local Forge CRM/ERP
  const axios = require('axios');
  try {
    const baseUrl = config.baseUrl || 'http://localhost:5001';
    const module = config.module || 'crm'; // crm, erp, groupware
    const response = await axios.get(`${baseUrl}/forge/${module}/api/health`, {
      timeout: 5000,
    });

    return {
      success: true,
      message: `Forge ${module.toUpperCase()} connection successful`,
      version: response.data.version,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// ═══════════════════════════════════════════════════════════
// Introspection & Discovery Routes
// ═══════════════════════════════════════════════════════════

/**
 * Get list of all PostgreSQL tables and views
 */
router.get('/database/tables', async (req, res) => {
  try {
    const sequelize = require('../../models').sequelize;

    const [results] = await sequelize.query(`
      SELECT
        table_schema,
        table_name,
        table_type
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name
    `);

    const tables = results.map(row => ({
      schema: row.table_schema,
      name: row.table_name,
      type: row.table_type,
      fullName: `${row.table_schema}.${row.table_name}`
    }));

    res.json({
      success: true,
      tables: tables
    });
  } catch (error) {
    console.error('Failed to fetch database tables:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: error.message
    });
  }
});

/**
 * Get columns/fields for a specific PostgreSQL table
 */
router.get('/database/tables/:schema/:table/columns', async (req, res) => {
  try {
    const { schema, table } = req.params;
    const sequelize = require('../../models').sequelize;

    const [results] = await sequelize.query(`
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length,
        numeric_precision,
        numeric_scale,
        udt_name
      FROM information_schema.columns
      WHERE table_schema = :schema
        AND table_name = :table
      ORDER BY ordinal_position
    `, {
      replacements: { schema, table }
    });

    const columns = results.map(row => ({
      name: row.column_name,
      type: row.data_type,
      udt: row.udt_name,
      nullable: row.is_nullable === 'YES',
      default: row.column_default,
      maxLength: row.character_maximum_length,
      precision: row.numeric_precision,
      scale: row.numeric_scale,
      displayType: formatDataType(row)
    }));

    res.json({
      success: true,
      table: `${schema}.${table}`,
      columns: columns
    });
  } catch (error) {
    console.error('Failed to fetch table columns:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: error.message
    });
  }
});

/**
 * Get list of available Exprsn services for REST API integration
 */
router.get('/services', async (req, res) => {
  try {
    const services = [
      {
        name: 'exprsn-auth',
        baseUrl: 'http://localhost:3001',
        endpoints: [
          { path: '/api/users', method: 'GET', description: 'List users' },
          { path: '/api/users/:id', method: 'GET', description: 'Get user by ID' },
          { path: '/api/sessions', method: 'GET', description: 'List sessions' }
        ]
      },
      {
        name: 'exprsn-timeline',
        baseUrl: 'http://localhost:3004',
        endpoints: [
          { path: '/api/posts', method: 'GET', description: 'List posts' },
          { path: '/api/posts/:id', method: 'GET', description: 'Get post by ID' },
          { path: '/api/feed', method: 'GET', description: 'Get user feed' }
        ]
      },
      {
        name: 'exprsn-forge',
        baseUrl: 'http://localhost:5001',
        endpoints: [
          { path: '/forge/crm/api/contacts', method: 'GET', description: 'List contacts' },
          { path: '/forge/crm/api/accounts', method: 'GET', description: 'List accounts' },
          { path: '/forge/crm/api/opportunities', method: 'GET', description: 'List opportunities' }
        ]
      },
      {
        name: 'exprsn-payments',
        baseUrl: 'http://localhost:3018',
        endpoints: [
          { path: '/api/transactions', method: 'GET', description: 'List transactions' },
          { path: '/api/invoices', method: 'GET', description: 'List invoices' }
        ]
      },
      {
        name: 'exprsn-workflow',
        baseUrl: 'http://localhost:3017',
        endpoints: [
          { path: '/api/workflows', method: 'GET', description: 'List workflows' },
          { path: '/api/executions', method: 'GET', description: 'List executions' }
        ]
      }
    ];

    res.json({
      success: true,
      services: services
    });
  } catch (error) {
    console.error('Failed to fetch services:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /datasources/test-connection
 * Test connection to a datasource without saving
 */
router.post('/test-connection', async (req, res) => {
  try {
    const { sourceType, connectionConfig } = req.body;

    if (!sourceType || !connectionConfig) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Source type and connection config are required'
      });
    }

    let testResult = {
      success: false,
      message: '',
      details: null,
      error: null
    };

    switch (sourceType) {
      case 'postgresql':
        testResult = await testPostgreSQLConnection(connectionConfig);
        break;

      case 'redis':
        testResult = await testRedisConnection(connectionConfig);
        break;

      case 'mysql':
        testResult = await testMySQLConnection(connectionConfig);
        break;

      case 'mongodb':
        testResult = await testMongoDBConnection(connectionConfig);
        break;

      case 'rest':
      case 'graphql':
      case 'soap':
        testResult = await testHTTPConnection(sourceType, connectionConfig);
        break;

      case 'forge':
        testResult = await testForgeConnection(connectionConfig);
        break;

      case 'json':
      case 'xml':
      case 'csv':
        testResult = await testStaticFileConnection(sourceType, connectionConfig);
        break;

      default:
        testResult = {
          success: false,
          message: `Connection testing not yet implemented for ${sourceType}`,
          error: 'NOT_IMPLEMENTED'
        };
    }

    res.json(testResult);
  } catch (error) {
    console.error('Connection test failed:', error);
    res.json({
      success: false,
      message: 'Connection test failed',
      error: error.message
    });
  }
});

/**
 * Helper function to format data type for display
 */
function formatDataType(column) {
  let type = column.data_type.toUpperCase();

  if (column.character_maximum_length) {
    type += `(${column.character_maximum_length})`;
  } else if (column.numeric_precision && column.numeric_scale) {
    type += `(${column.numeric_precision},${column.numeric_scale})`;
  } else if (column.numeric_precision) {
    type += `(${column.numeric_precision})`;
  }

  return type;
}

module.exports = router;
