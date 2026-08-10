/**
 * ═══════════════════════════════════════════════════════════
 * Visual Schema Designer Routes (Simple SQL version)
 * Drag-and-drop database schema builder API
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: 'exprsn_svr',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 5432
});

/**
 * GET /api/forge/schema-designer
 * List all schemas
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id, name, slug, description, database_name as "databaseName",
        schema_name as "schemaName", version, status, metadata,
        created_at as "createdAt", updated_at as "updatedAt"
      FROM schema_definitions
      ORDER BY updated_at DESC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error listing schemas:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list schemas',
      message: error.message
    });
  }
});

/**
 * GET /api/forge/schema-designer/:id
 * Get schema with tables and relationships
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get schema
    const schemaResult = await pool.query(`
      SELECT
        id, name, slug, description, database_name as "databaseName",
        schema_name as "schemaName", version, status, metadata,
        created_at as "createdAt", updated_at as "updatedAt"
      FROM schema_definitions
      WHERE id = $1
    `, [id]);

    if (schemaResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Schema not found'
      });
    }

    const schema = schemaResult.rows[0];

    // Get tables
    const tablesResult = await pool.query(`
      SELECT *
      FROM schema_tables
      WHERE schema_id = $1
      ORDER BY name
    `, [id]);

    // Get columns for all tables
    const columnsResult = await pool.query(`
      SELECT *
      FROM schema_columns
      WHERE table_id = ANY(
        SELECT id FROM schema_tables WHERE schema_id = $1
      )
      ORDER BY "position"
    `, [id]);

    // Get relationships
    const relationshipsResult = await pool.query(`
      SELECT *
      FROM schema_relationships
      WHERE schema_id = $1
    `, [id]);

    // Organize data
    const tables = tablesResult.rows.map(table => ({
      ...table,
      columns: columnsResult.rows.filter(col => col.table_id === table.id)
    }));

    schema.tables = tables;
    schema.relationships = relationshipsResult.rows;

    res.json({
      success: true,
      data: schema
    });
  } catch (error) {
    console.error('Error fetching schema:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch schema',
      message: error.message
    });
  }
});

/**
 * POST /api/forge/schema-designer
 * Create new schema
 */
router.post('/', async (req, res) => {
  try {
    const { name, slug, description, databaseName, schemaName } = req.body;

    const result = await pool.query(`
      INSERT INTO schema_definitions (
        id, name, slug, description, database_name, schema_name, status,
        created_at, updated_at
      )
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'draft', NOW(), NOW())
      RETURNING *
    `, [name, slug, description, databaseName, schemaName || 'public']);

    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating schema:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create schema',
      message: error.message
    });
  }
});

/**
 * PUT /api/forge/schema-designer/:id
 * Update schema
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, description, databaseName, schemaName, status } = req.body;

    const result = await pool.query(`
      UPDATE schema_definitions
      SET
        name = COALESCE($1, name),
        slug = COALESCE($2, slug),
        description = COALESCE($3, description),
        database_name = COALESCE($4, database_name),
        schema_name = COALESCE($5, schema_name),
        status = COALESCE($6, status),
        updated_at = NOW()
      WHERE id = $7
      RETURNING *
    `, [name, slug, description, databaseName, schemaName, status, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Schema not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating schema:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update schema',
      message: error.message
    });
  }
});

module.exports = router;
