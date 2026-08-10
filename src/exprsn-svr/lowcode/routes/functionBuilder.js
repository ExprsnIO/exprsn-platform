/**
 * Function Builder API Routes
 */

const express = require('express');
const router = express.Router();
const db = require('../models');
const FormulaEngine = require('../services/FormulaEngine');

/**
 * GET /api/function-builder/categories
 * Get all function categories
 */
router.get('/function-builder/categories', async (req, res) => {
  try {
    const categories = await db.sequelize.query(`
      SELECT 
        fc.id,
        fc.name,
        fc.display_name,
        fc.description,
        fc.icon,
        fc.order,
        COUNT(fl.id) as function_count
      FROM function_categories fc
      LEFT JOIN function_library fl ON fl.category_id = fc.id AND fl.is_enabled = true
      GROUP BY fc.id
      ORDER BY fc.order
    `, { type: db.sequelize.QueryTypes.SELECT });

    res.json({ success: true, categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/function-builder/functions
 * Get all functions with optional category filter
 */
router.get('/function-builder/functions', async (req, res) => {
  try {
    const { category, search } = req.query;
    
    let whereClause = 'WHERE fl.is_enabled = true';
    const params = [];
    
    if (category) {
      whereClause += ' AND fc.name = $1';
      params.push(category);
    }
    
    if (search) {
      const searchIndex = params.length + 1;
      whereClause += ` AND (fl.name ILIKE $${searchIndex} OR fl.description ILIKE $${searchIndex} OR $${searchIndex} = ANY(fl.tags))`;
      params.push(`%${search}%`);
    }

    const functions = await db.sequelize.query(`
      SELECT 
        fl.id,
        fl.name,
        fl.display_name,
        fl.description,
        fl.syntax,
        fl.parameters,
        fl.return_type,
        fl.examples,
        fl.tags,
        fc.name as category,
        fc.display_name as category_display_name,
        fc.icon as category_icon
      FROM function_library fl
      JOIN function_categories fc ON fl.category_id = fc.id
      ${whereClause}
      ORDER BY fc.order, fl.name
    `, {
      bind: params,
      type: db.sequelize.QueryTypes.SELECT
    });

    res.json({ success: true, functions, count: functions.length });
  } catch (error) {
    console.error('Error fetching functions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/function-builder/functions/:id
 * Get function details
 */
router.get('/function-builder/functions/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [func] = await db.sequelize.query(`
      SELECT 
        fl.*,
        fc.name as category,
        fc.display_name as category_display_name
      FROM function_library fl
      JOIN function_categories fc ON fl.category_id = fc.id
      WHERE fl.id = $1
    `, {
      bind: [id],
      type: db.sequelize.QueryTypes.SELECT
    });

    if (!func) {
      return res.status(404).json({ success: false, error: 'Function not found' });
    }

    res.json({ success: true, function: func });
  } catch (error) {
    console.error('Error fetching function:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/function-builder/execute
 * Execute a formula
 */
router.post('/function-builder/execute', async (req, res) => {
  try {
    const { formula, context = {}, queryId } = req.body;

    if (!formula) {
      return res.status(400).json({ success: false, error: 'Formula is required' });
    }

    const startTime = Date.now();
    const result = await FormulaEngine.execute(formula, context);
    const executionTime = Date.now() - startTime;

    // Log execution
    if (queryId) {
      await db.sequelize.query(`
        INSERT INTO query_executions (query_id, status, execution_time_ms, result, error_message)
        VALUES ($1, $2, $3, $4, $5)
      `, {
        bind: [
          queryId,
          result.success ? 'success' : 'error',
          executionTime,
          result.success ? JSON.stringify(result.result) : null,
          result.error || null
        ],
        type: db.sequelize.QueryTypes.INSERT
      });

      // Update query execution count
      await db.sequelize.query(`
        UPDATE saved_queries
        SET execution_count = execution_count + 1,
            last_executed_at = NOW()
        WHERE id = $1
      `, { bind: [queryId], type: db.sequelize.QueryTypes.UPDATE });
    }

    res.json({
      success: result.success,
      result: result.result,
      error: result.error,
      executionTime
    });
  } catch (error) {
    console.error('Error executing formula:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/function-builder/database/tables
 * Get database tables and columns
 */
router.get('/function-builder/database/tables', async (req, res) => {
  try {
    const tables = await db.sequelize.query(`
      SELECT 
        table_name,
        jsonb_agg(
          jsonb_build_object(
            'column_name', column_name,
            'data_type', data_type,
            'is_nullable', is_nullable,
            'column_default', column_default
          ) ORDER BY ordinal_position
        ) as columns
      FROM information_schema.columns
      WHERE table_schema = 'public'
      GROUP BY table_name
      ORDER BY table_name
    `, { type: db.sequelize.QueryTypes.SELECT });

    res.json({ success: true, tables });
  } catch (error) {
    console.error('Error fetching tables:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/function-builder/saved-queries
 * Get all saved queries
 */
router.get('/function-builder/saved-queries', async (req, res) => {
  try {
    const { search, queryType } = req.query;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (search) {
      whereClause += ' AND (sq.name ILIKE $1 OR sq.description ILIKE $1)';
      params.push(`%${search}%`);
    }

    if (queryType) {
      const typeIndex = params.length + 1;
      whereClause += ` AND sq.query_type = $${typeIndex}`;
      params.push(queryType);
    }

    const queries = await db.sequelize.query(`
      SELECT
        sq.*,
        COUNT(qe.id) as total_executions,
        AVG(qe.execution_time_ms) as avg_execution_time
      FROM saved_queries sq
      LEFT JOIN query_executions qe ON sq.id = qe.query_id
      ${whereClause}
      GROUP BY sq.id
      ORDER BY sq.updated_at DESC
    `, {
      bind: params,
      type: db.sequelize.QueryTypes.SELECT
    });

    res.json({ success: true, queries });
  } catch (error) {
    console.error('Error fetching saved queries:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/function-builder/saved-queries
 * Save a new query
 */
router.post('/function-builder/saved-queries', async (req, res) => {
  try {
    const { name, description, formula, queryType = 'formula', tags = [] } = req.body;

    if (!name || !formula) {
      return res.status(400).json({ success: false, error: 'Name and formula are required' });
    }

    const [query] = await db.sequelize.query(`
      INSERT INTO saved_queries (name, description, formula, query_type, tags, created_by, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, {
      bind: [
        name,
        description || null,
        formula,
        queryType,
        tags,
        '00000000-0000-0000-0000-000000000001', // Default user
        '00000000-0000-0000-0000-000000000001'
      ],
      type: db.sequelize.QueryTypes.INSERT
    });

    res.json({ success: true, query });
  } catch (error) {
    console.error('Error saving query:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/function-builder/saved-queries/:id
 * Get a specific saved query
 */
router.get('/function-builder/saved-queries/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [query] = await db.sequelize.query(`
      SELECT
        sq.*,
        COUNT(qe.id) as total_executions,
        AVG(qe.execution_time_ms) as avg_execution_time
      FROM saved_queries sq
      LEFT JOIN query_executions qe ON sq.id = qe.query_id
      WHERE sq.id = $1
      GROUP BY sq.id
    `, {
      bind: [id],
      type: db.sequelize.QueryTypes.SELECT
    });

    if (!query) {
      return res.status(404).json({ success: false, error: 'Query not found' });
    }

    res.json({ success: true, query });
  } catch (error) {
    console.error('Error fetching query:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/function-builder/saved-queries/:id
 * Update a saved query
 */
router.put('/function-builder/saved-queries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, formula, tags } = req.body;

    await db.sequelize.query(`
      UPDATE saved_queries
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          formula = COALESCE($3, formula),
          tags = COALESCE($4, tags),
          updated_by = $5,
          updated_at = NOW()
      WHERE id = $6
    `, {
      bind: [
        name || null,
        description || null,
        formula || null,
        tags || null,
        '00000000-0000-0000-0000-000000000001',
        id
      ],
      type: db.sequelize.QueryTypes.UPDATE
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating query:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/function-builder/saved-queries/:id
 * Delete a saved query
 */
router.delete('/function-builder/saved-queries/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Actually delete the query (not soft delete since we don't have deleted_at column)
    await db.sequelize.query(`
      DELETE FROM saved_queries
      WHERE id = $1
    `, {
      bind: [id],
      type: db.sequelize.QueryTypes.DELETE
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting query:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/function-builder/executions/:queryId
 * Get execution history for a query
 */
router.get('/function-builder/executions/:queryId', async (req, res) => {
  try {
    const { queryId } = req.params;
    const { limit = 50 } = req.query;

    const executions = await db.sequelize.query(`
      SELECT *
      FROM query_executions
      WHERE query_id = $1
      ORDER BY executed_at DESC
      LIMIT $2
    `, {
      bind: [queryId, parseInt(limit)],
      type: db.sequelize.QueryTypes.SELECT
    });

    res.json({ success: true, executions });
  } catch (error) {
    console.error('Error fetching executions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/function-builder/validate
 * Validate formula syntax without executing
 */
router.post('/function-builder/validate', async (req, res) => {
  try {
    const { formula } = req.body;

    if (!formula) {
      return res.status(400).json({ success: false, error: 'Formula is required' });
    }

    const validation = FormulaEngine.validate(formula);

    res.json({
      success: true,
      valid: validation.valid,
      error: validation.error
    });
  } catch (error) {
    console.error('Error validating formula:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
