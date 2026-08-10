const path = require('path');
const fs = require('fs').promises;

/**
 * ═══════════════════════════════════════════════════════════
 * CRUD Generator Service
 * Generates database-driven CRUD API routes for entities
 * ═══════════════════════════════════════════════════════════
 */

class CRUDGenerator {
  /**
   * Generate CRUD routes for an entity
   * @param {Object} entity - Entity definition
   * @returns {Object} Generated route code and metadata
   */
  static async generateCRUDRoutes(entity) {
    const { name, tableName, fields } = entity;

    const routes = {
      listAll: this.generateListAllRoute(entity),
      create: this.generateCreateRoute(entity),
      getOne: this.generateGetOneRoute(entity),
      update: this.generateUpdateRoute(entity),
      delete: this.generateDeleteRoute(entity)
    };

    const routeCode = this.assembleRouteCode(entity, routes);

    return {
      entityName: name,
      tableName,
      routes,
      routeCode,
      endpoints: this.getEndpointsList(entity)
    };
  }

  /**
   * Generate LIST ALL route
   */
  static generateListAllRoute(entity) {
    const { tableName, fields } = entity;

    return `
/**
 * GET /api/entities/${entity.name}
 * List all ${entity.name} records with pagination and filtering
 */
router.get('/${entity.name}', async (req, res) => {
  try {
    const { page = 1, limit = 50, sort = 'created_at', order = 'DESC', ...filters } = req.query;

    // Build WHERE clause from filters
    const whereClause = [];
    const queryParams = [];
    let paramIndex = 1;

${this.generateFilterLogic(fields)}

    // Build SQL query
    let sql = \`SELECT * FROM ${tableName}\`;
    if (whereClause.length > 0) {
      sql += \` WHERE \${whereClause.join(' AND ')}\`;
    }
    sql += \` ORDER BY \${sort} \${order}\`;
    sql += \` LIMIT $\${paramIndex++} OFFSET $\${paramIndex}\`;

    queryParams.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    // Execute query
    const { rows } = await db.query(sql, queryParams);

    // Get total count
    let countSql = \`SELECT COUNT(*) FROM ${tableName}\`;
    if (whereClause.length > 0) {
      countSql += \` WHERE \${whereClause.join(' AND ')}\`;
    }
    const { rows: [{ count }] } = await db.query(countSql, queryParams.slice(0, -2));

    res.json({
      success: true,
      data: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(count),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Error listing ${entity.name}:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});
`;
  }

  /**
   * Generate CREATE route
   */
  static generateCreateRoute(entity) {
    const { tableName, fields } = entity;
    const insertableFields = fields.filter(f =>
      !f.config?.autoIncrement &&
      !f.config?.calculated &&
      f.name !== 'id' &&
      f.name !== 'created_at' &&
      f.name !== 'updated_at'
    );

    return `
/**
 * POST /api/entities/${entity.name}
 * Create new ${entity.name} record
 */
router.post('/${entity.name}', async (req, res) => {
  try {
    const data = req.body;

    // Validate required fields
${this.generateValidationLogic(fields)}

    // Build INSERT statement
    const fields = [];
    const values = [];
    const params = [];
    let paramIndex = 1;

    ${insertableFields.map(f => `
    if (data.${f.name} !== undefined) {
      fields.push('${f.name}');
      values.push(\`$\${paramIndex++}\`);
      params.push(data.${f.name});
    }`).join('')}

    const sql = \`INSERT INTO ${tableName} (\${fields.join(', ')}) VALUES (\${values.join(', ')}) RETURNING *\`;
    const { rows: [newRecord] } = await db.query(sql, params);

    res.status(201).json({
      success: true,
      data: newRecord
    });
  } catch (error) {
    console.error('Error creating ${entity.name}:', error);

    // Handle unique constraint violations
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        error: 'UNIQUE_VIOLATION',
        message: 'A record with this value already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});
`;
  }

  /**
   * Generate GET ONE route
   */
  static generateGetOneRoute(entity) {
    const { tableName } = entity;
    const primaryKey = entity.fields.find(f => f.primaryKey || f.validation?.primaryKey)?.name || 'id';

    return `
/**
 * GET /api/entities/${entity.name}/:id
 * Get single ${entity.name} record by ID
 */
router.get('/${entity.name}/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const sql = \`SELECT * FROM ${tableName} WHERE ${primaryKey} = $1\`;
    const { rows } = await db.query(sql, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '${entity.name} not found'
      });
    }

    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('Error getting ${entity.name}:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});
`;
  }

  /**
   * Generate UPDATE route
   */
  static generateUpdateRoute(entity) {
    const { tableName, fields } = entity;
    const primaryKey = fields.find(f => f.primaryKey || f.validation?.primaryKey)?.name || 'id';
    const updatableFields = fields.filter(f =>
      !f.config?.autoIncrement &&
      !f.config?.calculated &&
      !f.primaryKey &&
      f.name !== 'id' &&
      f.name !== 'created_at'
    );

    return `
/**
 * PUT /api/entities/${entity.name}/:id
 * Update ${entity.name} record
 */
router.put('/${entity.name}/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    // Build UPDATE statement dynamically based on provided fields
    const updates = [];
    const params = [];
    let paramIndex = 1;

    ${updatableFields.map(f => `
    if (data.${f.name} !== undefined) {
      updates.push(\`${f.name} = $\${paramIndex++}\`);
      params.push(data.${f.name});
    }`).join('')}

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'NO_UPDATES',
        message: 'No fields to update'
      });
    }

    // Add updated_at timestamp if field exists
    ${fields.some(f => f.name === 'updated_at') ? `
    updates.push(\`updated_at = $\${paramIndex++}\`);
    params.push(new Date());
    ` : ''}

    params.push(id);
    const sql = \`UPDATE ${tableName} SET \${updates.join(', ')} WHERE ${primaryKey} = $\${paramIndex} RETURNING *\`;
    const { rows } = await db.query(sql, params);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '${entity.name} not found'
      });
    }

    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('Error updating ${entity.name}:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});
`;
  }

  /**
   * Generate DELETE route
   */
  static generateDeleteRoute(entity) {
    const { tableName, fields } = entity;
    const primaryKey = fields.find(f => f.primaryKey || f.validation?.primaryKey)?.name || 'id';
    const hasSoftDelete = fields.some(f => f.name === 'deleted_at');

    return `
/**
 * DELETE /api/entities/${entity.name}/:id
 * Delete ${entity.name} record${hasSoftDelete ? ' (soft delete)' : ''}
 */
router.delete('/${entity.name}/:id', async (req, res) => {
  try {
    const { id } = req.params;

    ${hasSoftDelete ? `
    // Soft delete - set deleted_at timestamp
    const sql = \`UPDATE ${tableName} SET deleted_at = $1 WHERE ${primaryKey} = $2 AND deleted_at IS NULL RETURNING *\`;
    const { rows } = await db.query(sql, [new Date(), id]);
    ` : `
    // Hard delete
    const sql = \`DELETE FROM ${tableName} WHERE ${primaryKey} = $1 RETURNING *\`;
    const { rows } = await db.query(sql, [id]);
    `}

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '${entity.name} not found or already deleted'
      });
    }

    res.json({
      success: true,
      data: rows[0],
      message: '${entity.name} deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting ${entity.name}:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});
`;
  }

  /**
   * Assemble complete route code
   */
  static assembleRouteCode(entity, routes) {
    return `/**
 * Auto-generated CRUD routes for ${entity.name}
 * Generated: ${new Date().toISOString()}
 * Entity Version: ${entity.metadata?.version || '1.0.0'}
 */

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'exprsn_svr',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || ''
});

const db = {
  query: (text, params) => pool.query(text, params)
};

${routes.listAll}
${routes.create}
${routes.getOne}
${routes.update}
${routes.delete}

module.exports = router;
`;
  }

  /**
   * Generate filter logic for query parameters
   */
  static generateFilterLogic(fields) {
    return fields.filter(f => !f.config?.calculated).map(field => `    if (filters.${field.name}) {
      whereClause.push(\`${field.name} = $\${paramIndex++}\`);
      queryParams.push(filters.${field.name});
    }`).join('\n');
  }

  /**
   * Generate validation logic
   */
  static generateValidationLogic(fields) {
    const requiredFields = fields.filter(f => f.required || f.validation?.required);

    if (requiredFields.length === 0) {
      return '    // No required fields';
    }

    return requiredFields.map(field => `    if (!data.${field.name}) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '${field.label || field.name} is required'
      });
    }`).join('\n');
  }

  /**
   * Get list of endpoints
   */
  static getEndpointsList(entity) {
    return [
      { method: 'GET', path: `/api/entities/${entity.name}`, description: 'List all' },
      { method: 'POST', path: `/api/entities/${entity.name}`, description: 'Create new' },
      { method: 'GET', path: `/api/entities/${entity.name}/:id`, description: 'Get one by ID' },
      { method: 'PUT', path: `/api/entities/${entity.name}/:id`, description: 'Update by ID' },
      { method: 'DELETE', path: `/api/entities/${entity.name}/:id`, description: 'Delete by ID' }
    ];
  }

  /**
   * Write route file to disk
   */
  static async writeRouteFile(entity, routeCode) {
    const routesDir = path.join(__dirname, '../../routes/entities');
    await fs.mkdir(routesDir, { recursive: true });

    const filePath = path.join(routesDir, `${entity.name}.js`);
    await fs.writeFile(filePath, routeCode, 'utf8');

    return filePath;
  }

  /**
   * Generate sample API call
   */
  static generateSampleCall(entity) {
    return `curl -X GET http://localhost:5000/api/entities/${entity.name} \\
  -H "Content-Type: application/json"`;
  }
}

module.exports = CRUDGenerator;
