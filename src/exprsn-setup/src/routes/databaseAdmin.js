/**
 * ═══════════════════════════════════════════════════════════════════════
 * Database Administration Routes
 * Comprehensive database management across all Exprsn services
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { Sequelize, DataTypes } = require('sequelize');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

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
  'exprsn-filevault': {
    name: 'File Storage',
    database: process.env.FILEVAULT_DB_NAME || 'exprsn_filevault',
    host: process.env.FILEVAULT_DB_HOST || 'localhost',
    port: parseInt(process.env.FILEVAULT_DB_PORT) || 5432,
    username: process.env.FILEVAULT_DB_USER || 'postgres',
    password: process.env.FILEVAULT_DB_PASSWORD || 'postgres',
    port_service: 3007
  },
  'exprsn-gallery': {
    name: 'Media Gallery',
    database: process.env.GALLERY_DB_NAME || 'exprsn_gallery',
    host: process.env.GALLERY_DB_HOST || 'localhost',
    port: parseInt(process.env.GALLERY_DB_PORT) || 5432,
    username: process.env.GALLERY_DB_USER || 'postgres',
    password: process.env.GALLERY_DB_PASSWORD || 'postgres',
    port_service: 3008
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
  },
  'exprsn-herald': {
    name: 'Notifications',
    database: process.env.HERALD_DB_NAME || 'exprsn_herald',
    host: process.env.HERALD_DB_HOST || 'localhost',
    port: parseInt(process.env.HERALD_DB_PORT) || 5432,
    username: process.env.HERALD_DB_USER || 'postgres',
    password: process.env.HERALD_DB_PASSWORD || 'postgres',
    port_service: 3014
  },
  'exprsn-vault': {
    name: 'Secrets Management',
    database: process.env.VAULT_DB_NAME || 'exprsn_vault',
    host: process.env.VAULT_DB_HOST || 'localhost',
    port: parseInt(process.env.VAULT_DB_PORT) || 5432,
    username: process.env.VAULT_DB_USER || 'postgres',
    password: process.env.VAULT_DB_PASSWORD || 'postgres',
    port_service: 3013
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
 * Get table schema
 * GET /api/database/:service/tables/:table/schema
 */
router.get('/:service/tables/:table/schema', async (req, res) => {
  try {
    const { service, table } = req.params;
    const sequelize = await getConnection(service);

    const [columns] = await sequelize.query(`
      SELECT
        column_name,
        data_type,
        character_maximum_length,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = :tableName
      ORDER BY ordinal_position
    `, {
      replacements: { tableName: table }
    });

    const [constraints] = await sequelize.query(`
      SELECT
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_schema = 'public'
      AND tc.table_name = :tableName
    `, {
      replacements: { tableName: table }
    });

    res.json({
      success: true,
      schema: {
        columns,
        constraints
      }
    });
  } catch (error) {
    logger.error('Failed to get table schema:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get table schema',
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
    req.app.get('io').emit('database:row-created', {
      service,
      table,
      timestamp: new Date().toISOString()
    });

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
    req.app.get('io').emit('database:row-updated', {
      service,
      table,
      id,
      timestamp: new Date().toISOString()
    });

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
    req.app.get('io').emit('database:row-deleted', {
      service,
      table,
      id,
      timestamp: new Date().toISOString()
    });

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
 * Export table data
 * POST /api/database/:service/tables/:table/export
 */
router.post('/:service/tables/:table/export', async (req, res) => {
  try {
    const { service, table } = req.params;
    const { format = 'json', where } = req.body;

    const sequelize = await getConnection(service);

    let query = `SELECT * FROM "${table}"`;
    const replacements = {};

    if (where) {
      query += ` WHERE ${where}`;
    }

    const [rows] = await sequelize.query(query, { replacements });

    if (format === 'csv') {
      // Convert to CSV
      const columns = Object.keys(rows[0] || {});
      const csv = [
        columns.join(','),
        ...rows.map(row => columns.map(col => JSON.stringify(row[col])).join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${table}.csv`);
      res.send(csv);
    } else if (format === 'sql') {
      // Generate SQL INSERT statements
      const columns = Object.keys(rows[0] || {});
      const sql = rows.map(row => {
        const values = columns.map(col => {
          const val = row[col];
          if (val === null) return 'NULL';
          if (typeof val === 'number') return val;
          return `'${String(val).replace(/'/g, "''")}'`;
        }).join(', ');
        return `INSERT INTO "${table}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${values});`;
      }).join('\n');

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename=${table}.sql`);
      res.send(sql);
    } else {
      // JSON format
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=${table}.json`);
      res.json(rows);
    }
  } catch (error) {
    logger.error('Failed to export table:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export table',
      message: error.message
    });
  }
});

/**
 * Import table data
 * POST /api/database/:service/tables/:table/import
 */
router.post('/:service/tables/:table/import', async (req, res) => {
  try {
    const { service, table } = req.params;
    const { data, mode = 'insert' } = req.body; // insert, update, upsert

    const sequelize = await getConnection(service);
    let successCount = 0;
    let errorCount = 0;

    for (const row of data) {
      try {
        const columns = Object.keys(row).map(k => `"${k}"`).join(', ');
        const placeholders = Object.keys(row).map((_, i) => `:val${i}`).join(', ');
        const replacements = {};
        Object.values(row).forEach((val, i) => {
          replacements[`val${i}`] = val;
        });

        if (mode === 'insert') {
          await sequelize.query(
            `INSERT INTO "${table}" (${columns}) VALUES (${placeholders})`,
            { replacements }
          );
        } else if (mode === 'upsert') {
          // Use ON CONFLICT DO UPDATE
          const sets = Object.keys(row).filter(k => k !== 'id').map((k, i) => `"${k}" = EXCLUDED."${k}"`).join(', ');
          await sequelize.query(
            `INSERT INTO "${table}" (${columns}) VALUES (${placeholders})
             ON CONFLICT (id) DO UPDATE SET ${sets}`,
            { replacements }
          );
        }

        successCount++;
      } catch (error) {
        logger.error('Failed to import row:', error);
        errorCount++;
      }
    }

    // Emit Socket.IO event
    req.app.get('io').emit('database:data-imported', {
      service,
      table,
      successCount,
      errorCount,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      successCount,
      errorCount,
      message: `Imported ${successCount} rows (${errorCount} errors)`
    });
  } catch (error) {
    logger.error('Failed to import data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import data',
      message: error.message
    });
  }
});

/**
 * Get migration status
 * GET /api/database/:service/migrations
 */
router.get('/:service/migrations', async (req, res) => {
  try {
    const { service } = req.params;

    // Get migration files
    const migrationsPath = path.join(__dirname, `../../../${service}/migrations`);
    let migrations = [];

    try {
      const files = await fs.readdir(migrationsPath);
      migrations = files
        .filter(f => f.endsWith('.js'))
        .map(f => ({
          name: f,
          path: path.join(migrationsPath, f),
          executed: false
        }));
    } catch (error) {
      logger.warn(`No migrations directory for ${service}`);
    }

    // Check which migrations have been executed
    try {
      const sequelize = await getConnection(service);
      const [executed] = await sequelize.query(
        `SELECT name FROM "SequelizeMeta" ORDER BY name`
      );
      const executedNames = new Set(executed.map(e => e.name));
      migrations.forEach(m => {
        m.executed = executedNames.has(m.name);
      });
    } catch (error) {
      logger.warn('Could not check executed migrations');
    }

    res.json({
      success: true,
      migrations
    });
  } catch (error) {
    logger.error('Failed to get migrations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get migrations',
      message: error.message
    });
  }
});

/**
 * Execute migrations
 * POST /api/database/:service/migrations/up
 */
router.post('/:service/migrations/up', async (req, res) => {
  try {
    const { service } = req.params;
    const { migration } = req.body; // optional specific migration

    // This would integrate with Sequelize CLI or custom migration runner
    // For now, return placeholder

    res.json({
      success: true,
      message: 'Migration execution would happen here',
      note: 'Use sequelize-cli db:migrate in production'
    });
  } catch (error) {
    logger.error('Failed to run migrations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run migrations',
      message: error.message
    });
  }
});

/**
 * Rollback migrations
 * POST /api/database/:service/migrations/down
 */
router.post('/:service/migrations/down', async (req, res) => {
  try {
    const { service } = req.params;
    const { steps = 1 } = req.body;

    // This would integrate with Sequelize CLI

    res.json({
      success: true,
      message: 'Migration rollback would happen here',
      note: 'Use sequelize-cli db:migrate:undo in production'
    });
  } catch (error) {
    logger.error('Failed to rollback migrations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to rollback migrations',
      message: error.message
    });
  }
});

/**
 * Get Forge custom schemas
 * GET /api/database/forge/schemas
 */
router.get('/forge/schemas', async (req, res) => {
  try {
    const sequelize = await getConnection('exprsn-forge');

    const [schemas] = await sequelize.query(`
      SELECT * FROM forge_custom_schemas
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      schemas
    });
  } catch (error) {
    logger.error('Failed to get Forge schemas:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get Forge schemas',
      message: error.message
    });
  }
});

/**
 * Export Forge schema
 * POST /api/database/forge/schemas/:id/export
 */
router.post('/forge/schemas/:id/export', async (req, res) => {
  try {
    const { id } = req.params;
    const sequelize = await getConnection('exprsn-forge');

    const [schemas] = await sequelize.query(
      `SELECT * FROM forge_custom_schemas WHERE id = :id`,
      { replacements: { id } }
    );

    if (schemas.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Schema not found'
      });
    }

    const schema = schemas[0];
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=forge-schema-${id}.json`);
    res.json(schema);
  } catch (error) {
    logger.error('Failed to export Forge schema:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export Forge schema',
      message: error.message
    });
  }
});

/**
 * Import Forge schema
 * POST /api/database/forge/schemas/import
 */
router.post('/forge/schemas/import', async (req, res) => {
  try {
    const { schema } = req.body;
    const sequelize = await getConnection('exprsn-forge');

    const columns = Object.keys(schema).filter(k => k !== 'id').map(k => `"${k}"`).join(', ');
    const placeholders = Object.keys(schema).filter(k => k !== 'id').map((_, i) => `:val${i}`).join(', ');
    const replacements = {};
    Object.entries(schema).filter(([k]) => k !== 'id').forEach(([k, v], i) => {
      replacements[`val${i}`] = typeof v === 'object' ? JSON.stringify(v) : v;
    });

    await sequelize.query(
      `INSERT INTO forge_custom_schemas (${columns}) VALUES (${placeholders})`,
      { replacements }
    );

    res.json({
      success: true,
      message: 'Schema imported successfully'
    });
  } catch (error) {
    logger.error('Failed to import Forge schema:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import Forge schema',
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

/**
 * Execute raw SQL query
 * POST /api/database/:service/query
 */
router.post('/:service/query', async (req, res) => {
  try {
    const { service } = req.params;
    const { query, type = 'SELECT' } = req.body;

    const sequelize = await getConnection(service);

    const [results, metadata] = await sequelize.query(query);

    res.json({
      success: true,
      results,
      metadata,
      rowCount: Array.isArray(results) ? results.length : 0
    });
  } catch (error) {
    logger.error('Failed to execute query:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute query',
      message: error.message
    });
  }
});

module.exports = router;
