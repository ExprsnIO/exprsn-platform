/**
 * ═══════════════════════════════════════════════════════════════════════
 * Database Administration Routes
 * Comprehensive database management across all Exprsn services
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

// Service database configurations
const SERVICE_CONFIGS = {
  'exprsn-ca': {
    name: 'Certificate Authority',
    database: process.env.CA_DB_NAME || 'exprsn_ca',
    host: process.env.CA_DB_HOST || 'localhost',
    port: parseInt(process.env.CA_DB_PORT) || 5432,
    username: process.env.CA_DB_USER || 'postgres',
    password: process.env.CA_DB_PASSWORD || 'postgres',
    port_service: 3000
  },
  'exprsn-auth': {
    name: 'Authentication',
    database: process.env.AUTH_DB_NAME || 'exprsn_auth',
    host: process.env.AUTH_DB_HOST || 'localhost',
    port: parseInt(process.env.AUTH_DB_PORT) || 5432,
    username: process.env.AUTH_DB_USER || 'postgres',
    password: process.env.AUTH_DB_PASSWORD || 'postgres',
    port_service: 3001
  },
  'exprsn-timeline': {
    name: 'Timeline',
    database: process.env.TIMELINE_DB_NAME || 'exprsn_timeline',
    host: process.env.TIMELINE_DB_HOST || 'localhost',
    port: parseInt(process.env.TIMELINE_DB_PORT) || 5432,
    username: process.env.TIMELINE_DB_USER || 'postgres',
    password: process.env.TIMELINE_DB_PASSWORD || 'postgres',
    port_service: 3004
  },
  'exprsn-spark': {
    name: 'Messaging',
    database: process.env.SPARK_DB_NAME || 'exprsn_spark',
    host: process.env.SPARK_DB_HOST || 'localhost',
    port: parseInt(process.env.SPARK_DB_PORT) || 5432,
    username: process.env.SPARK_DB_USER || 'postgres',
    password: process.env.SPARK_DB_PASSWORD || 'postgres',
    port_service: 3002
  },
  'exprsn-nexus': {
    name: 'Groups & Events',
    database: process.env.NEXUS_DB_NAME || 'exprsn_nexus',
    host: process.env.NEXUS_DB_HOST || 'localhost',
    port: parseInt(process.env.NEXUS_DB_PORT) || 5432,
    username: process.env.NEXUS_DB_USER || 'postgres',
    password: process.env.NEXUS_DB_PASSWORD || 'postgres',
    port_service: 3011
  },
  'exprsn-workflow': {
    name: 'Workflow Automation',
    database: process.env.WORKFLOW_DB_NAME || 'exprsn_workflow',
    host: process.env.WORKFLOW_DB_HOST || 'localhost',
    port: parseInt(process.env.WORKFLOW_DB_PORT) || 5432,
    username: process.env.WORKFLOW_DB_USER || 'postgres',
    password: process.env.WORKFLOW_DB_PASSWORD || 'postgres',
    port_service: 3017
  },
  'exprsn-forge': {
    name: 'Business Platform',
    database: process.env.FORGE_DB_NAME || 'exprsn_forge',
    host: process.env.FORGE_DB_HOST || 'localhost',
    port: parseInt(process.env.FORGE_DB_PORT) || 5432,
    username: process.env.FORGE_DB_USER || 'postgres',
    password: process.env.FORGE_DB_PASSWORD || 'postgres',
    port_service: 3016
  }
};

// Active database connections cache
const dbConnections = new Map();

/**
 * Get or create Sequelize connection for a service
 */
async function getConnection(serviceKey) {
  if (dbConnections.has(serviceKey)) {
    return dbConnections.get(serviceKey);
  }

  const config = SERVICE_CONFIGS[serviceKey];
  if (!config) {
    throw new Error(`Unknown service: ${serviceKey}`);
  }

  const sequelize = new Sequelize(config.database, config.username, config.password, {
    host: config.host,
    port: config.port,
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  });

  await sequelize.authenticate();
  dbConnections.set(serviceKey, sequelize);
  return sequelize;
}

/**
 * Get all database connections
 * GET /api/database/connections
 */
router.get('/connections', async (req, res) => {
  try {
    const connections = [];

    for (const [key, config] of Object.entries(SERVICE_CONFIGS)) {
      let status = 'disconnected';
      let tables = [];

      try {
        const sequelize = await getConnection(key);
        const [results] = await sequelize.query(`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          ORDER BY table_name
        `);
        tables = results.map(r => r.table_name);
        status = 'connected';
      } catch (error) {
        logger.error(`Failed to connect to ${key}:`, error.message);
      }

      connections.push({
        key,
        name: config.name,
        database: config.database,
        host: config.host,
        port: config.port,
        username: config.username,
        port_service: config.port_service,
        status,
        tables,
        tableCount: tables.length
      });
    }

    res.json({
      success: true,
      connections
    });
  } catch (error) {
    logger.error('Failed to get database connections:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get database connections',
      message: error.message
    });
  }
});

/**
 * Test database connection
 * POST /api/database/:service/test
 */
router.post('/:service/test', async (req, res) => {
  try {
    const { service } = req.params;
    const sequelize = await getConnection(service);
    await sequelize.authenticate();

    res.json({
      success: true,
      message: 'Connection successful'
    });
  } catch (error) {
    logger.error('Connection test failed:', error);
    res.status(500).json({
      success: false,
      error: 'Connection test failed',
      message: error.message
    });
  }
});

/**
 * Get table list for a service
 * GET /api/database/:service/tables
 */
router.get('/:service/tables', async (req, res) => {
  try {
    const { service } = req.params;
    const sequelize = await getConnection(service);

    const [tables] = await sequelize.query(`
      SELECT
        table_name,
        (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    // Get row counts
    for (const table of tables) {
      try {
        const [result] = await sequelize.query(`SELECT COUNT(*) as count FROM "${table.table_name}"`);
        table.row_count = parseInt(result[0].count);
      } catch (error) {
        table.row_count = 0;
      }
    }

    res.json({
      success: true,
      tables
    });
  } catch (error) {
    logger.error('Failed to get tables:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tables',
      message: error.message
    });
  }
});

/**
 * Get table data with pagination
 * GET /api/database/:service/tables/:table/data
 */
router.get('/:service/tables/:table/data', async (req, res) => {
  try {
    const { service, table } = req.params;
    const { page = 1, limit = 50, sortBy, sortOrder = 'ASC', search } = req.query;
    const offset = (page - 1) * limit;

    const sequelize = await getConnection(service);

    // Get total count
    const [countResult] = await sequelize.query(`SELECT COUNT(*) as count FROM "${table}"`);
    const total = parseInt(countResult[0].count);

    // Build query
    let query = `SELECT * FROM "${table}"`;
    const replacements = {};

    // Add search if provided
    if (search) {
      query += ` WHERE CAST(row_to_json("${table}")::text AS text) ILIKE :search`;
      replacements.search = `%${search}%`;
    }

    // Add sorting
    if (sortBy) {
      query += ` ORDER BY "${sortBy}" ${sortOrder}`;
    }

    // Add pagination
    query += ` LIMIT :limit OFFSET :offset`;
    replacements.limit = parseInt(limit);
    replacements.offset = offset;

    const [rows] = await sequelize.query(query, { replacements });

    res.json({
      success: true,
      data: {
        rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Failed to get table data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get table data',
      message: error.message
    });
  }
});

/**
 * Create new row
 * POST /api/database/:service/tables/:table/rows
 */
router.post('/:service/tables/:table/rows', async (req, res) => {
  try {
    const { service, table } = req.params;
    const { data } = req.body;

    const sequelize = await getConnection(service);

    const columns = Object.keys(data).map(k => `"${k}"`).join(', ');
    const placeholders = Object.keys(data).map((_, i) => `:val${i}`).join(', ');
    const replacements = {};
    Object.values(data).forEach((val, i) => {
      replacements[`val${i}`] = val;
    });

    await sequelize.query(
      `INSERT INTO "${table}" (${columns}) VALUES (${placeholders})`,
      { replacements }
    );

    // Emit Socket.IO event
    if (global.adminIO) {
      global.adminIO.emit('database:row-created', {
        service,
        table,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Row created successfully'
    });
  } catch (error) {
    logger.error('Failed to create row:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create row',
      message: error.message
    });
  }
});

/**
 * Update row
 * PUT /api/database/:service/tables/:table/rows/:id
 */
router.put('/:service/tables/:table/rows/:id', async (req, res) => {
  try {
    const { service, table, id } = req.params;
    const { data, idColumn = 'id' } = req.body;

    const sequelize = await getConnection(service);

    const sets = Object.keys(data).map((k, i) => `"${k}" = :val${i}`).join(', ');
    const replacements = { id };
    Object.values(data).forEach((val, i) => {
      replacements[`val${i}`] = val;
    });

    await sequelize.query(
      `UPDATE "${table}" SET ${sets} WHERE "${idColumn}" = :id`,
      { replacements }
    );

    // Emit Socket.IO event
    if (global.adminIO) {
      global.adminIO.emit('database:row-updated', {
        service,
        table,
        id,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Row updated successfully'
    });
  } catch (error) {
    logger.error('Failed to update row:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update row',
      message: error.message
    });
  }
});

/**
 * Delete row
 * DELETE /api/database/:service/tables/:table/rows/:id
 */
router.delete('/:service/tables/:table/rows/:id', async (req, res) => {
  try {
    const { service, table, id } = req.params;
    const { idColumn = 'id' } = req.query;

    const sequelize = await getConnection(service);

    await sequelize.query(
      `DELETE FROM "${table}" WHERE "${idColumn}" = :id`,
      { replacements: { id } }
    );

    // Emit Socket.IO event
    if (global.adminIO) {
      global.adminIO.emit('database:row-deleted', {
        service,
        table,
        id,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Row deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete row:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete row',
      message: error.message
    });
  }
});

/**
 * Get database statistics
 * GET /api/database/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = {
      totalDatabases: Object.keys(SERVICE_CONFIGS).length,
      connected: 0,
      totalTables: 0,
      totalRows: 0
    };

    for (const [key, config] of Object.entries(SERVICE_CONFIGS)) {
      try {
        const sequelize = await getConnection(key);
        const [tables] = await sequelize.query(`
          SELECT COUNT(*) as count
          FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        `);

        stats.connected++;
        stats.totalTables += parseInt(tables[0].count);

        // Get approximate row count
        const [tableNames] = await sequelize.query(`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        `);

        for (const { table_name } of tableNames) {
          try {
            const [rows] = await sequelize.query(`SELECT COUNT(*) as count FROM "${table_name}"`);
            stats.totalRows += parseInt(rows[0].count);
          } catch (error) {
            // Skip if table query fails
          }
        }
      } catch (error) {
        logger.error(`Failed to get stats for ${key}:`, error.message);
      }
    }

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error('Failed to get database statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get database statistics',
      message: error.message
    });
  }
});

module.exports = router;
