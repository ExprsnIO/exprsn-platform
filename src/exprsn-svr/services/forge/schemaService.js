const { Op } = require('sequelize');
const { sequelize } = require('../../config/database');
const { ForgeSchema, ForgeSchemaChange, ForgeMigration, ForgeSchemaDependency } = require('../../models/forge');
const logger = require('../../utils/logger');
const Joi = require('joi');

/**
 * Schema Service
 *
 * Handles CRUD operations, validation, and DDL generation for schemas
 */

/**
 * JSON Schema validation using Joi
 */
const schemaDefinitionSchema = Joi.object({
  type: Joi.string().valid('object').required(),
  properties: Joi.object().required(),
  required: Joi.array().items(Joi.string()).optional(),
  indexes: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    fields: Joi.array().items(Joi.string()).required(),
    unique: Joi.boolean().optional(),
    type: Joi.string().valid('btree', 'hash', 'gin', 'gist', 'spgist', 'brin').optional()
  })).optional(),
  workflows: Joi.array().items(Joi.object({
    event: Joi.string().valid('beforeCreate', 'afterCreate', 'beforeUpdate', 'afterUpdate', 'beforeDelete', 'afterDelete').required(),
    workflowId: Joi.string().required(),
    condition: Joi.string().optional(),
    async: Joi.boolean().optional()
  })).optional(),
  permissions: Joi.object().optional()
}).unknown(true);

/**
 * Create a new schema
 */
async function createSchema({
  modelId,
  version,
  name,
  description,
  tableName,
  schemaDefinition,
  status = 'draft',
  isSystem = false,
  metadata = {},
  createdBy
}) {
  try {
    // Validate schema definition
    const validationResult = await validateSchemaDefinition(schemaDefinition);
    if (!validationResult.valid) {
      throw new Error(`Schema validation failed: ${validationResult.errors.join(', ')}`);
    }

    // Check for duplicate model_id + version
    const existing = await ForgeSchema.findOne({
      where: { modelId, version }
    });

    if (existing) {
      throw new Error(`Schema ${modelId} v${version} already exists`);
    }

    // Create schema
    const schema = await ForgeSchema.create({
      modelId,
      version,
      name,
      description,
      tableName,
      schemaDefinition,
      status,
      isSystem,
      metadata,
      createdBy
    });

    // Log the change
    await ForgeSchemaChange.logChange({
      schemaId: schema.id,
      changeType: 'created',
      changeDetails: {
        modelId,
        version,
        name
      },
      afterSnapshot: schema.toJSON(),
      changedBy: createdBy
    });

    logger.info('Schema created', {
      schemaId: schema.id,
      modelId,
      version,
      createdBy
    });

    return schema;
  } catch (error) {
    logger.error('Failed to create schema', {
      modelId,
      version,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get schema by ID
 */
async function getSchemaById(id, includeRelations = false) {
  const include = [];

  if (includeRelations) {
    include.push(
      {
        model: ForgeSchemaDependency,
        as: 'dependencies',
        include: [{ model: ForgeSchema, as: 'dependsOnSchema' }]
      },
      {
        model: ForgeMigration,
        as: 'migrations',
        limit: 10,
        order: [['createdAt', 'DESC']]
      },
      {
        model: ForgeSchemaChange,
        as: 'changes',
        limit: 10,
        order: [['changedAt', 'DESC']]
      }
    );
  }

  const schema = await ForgeSchema.findByPk(id, { include });

  if (!schema) {
    throw new Error(`Schema not found: ${id}`);
  }

  return schema;
}

/**
 * List schemas with filtering and pagination
 */
async function listSchemas({
  status,
  modelId,
  isSystem,
  search,
  limit = 50,
  offset = 0,
  orderBy = 'createdAt',
  orderDirection = 'DESC'
}) {
  const where = {};

  if (status) {
    where.status = status;
  }

  if (modelId) {
    where.modelId = modelId;
  }

  if (isSystem !== undefined) {
    where.isSystem = isSystem;
  }

  if (search) {
    where[Op.or] = [
      { modelId: { [Op.iLike]: `%${search}%` } },
      { name: { [Op.iLike]: `%${search}%` } },
      { description: { [Op.iLike]: `%${search}%` } },
      { tableName: { [Op.iLike]: `%${search}%` } }
    ];
  }

  const { count, rows } = await ForgeSchema.findAndCountAll({
    where,
    limit,
    offset,
    order: [[orderBy, orderDirection]]
  });

  return {
    schemas: rows,
    total: count,
    limit,
    offset,
    hasMore: (offset + limit) < count
  };
}

/**
 * Update a schema
 */
async function updateSchema(id, updates, updatedBy) {
  try {
    const schema = await getSchemaById(id);

    // Capture before snapshot
    const beforeSnapshot = schema.toJSON();

    // Validate updates if schemaDefinition is being changed
    if (updates.schemaDefinition) {
      const validationResult = await validateSchemaDefinition(updates.schemaDefinition);
      if (!validationResult.valid) {
        throw new Error(`Schema validation failed: ${validationResult.errors.join(', ')}`);
      }
    }

    // Apply updates
    Object.assign(schema, updates);
    await schema.save();

    // Log the change
    await ForgeSchemaChange.logChange({
      schemaId: schema.id,
      changeType: 'updated',
      changeDetails: {
        fields: Object.keys(updates)
      },
      beforeSnapshot,
      afterSnapshot: schema.toJSON(),
      changedBy: updatedBy
    });

    logger.info('Schema updated', {
      schemaId: schema.id,
      modelId: schema.modelId,
      updatedBy
    });

    return schema;
  } catch (error) {
    logger.error('Failed to update schema', {
      schemaId: id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Delete a schema
 */
async function deleteSchema(id, deletedBy) {
  try {
    const schema = await getSchemaById(id);

    // Check if system schema
    if (schema.isSystem) {
      throw new Error('Cannot delete system schemas');
    }

    // Check if schema has active dependents
    const dependents = await ForgeSchemaDependency.findAll({
      where: { dependsOnSchemaId: id },
      include: [{ model: ForgeSchema, as: 'schema', where: { status: 'active' } }]
    });

    if (dependents.length > 0) {
      throw new Error(`Cannot delete schema: ${dependents.length} active schemas depend on it`);
    }

    const beforeSnapshot = schema.toJSON();

    // Delete schema
    await schema.destroy();

    // Log the change
    await ForgeSchemaChange.logChange({
      schemaId: id,
      changeType: 'deleted',
      changeDetails: {
        modelId: schema.modelId,
        version: schema.version
      },
      beforeSnapshot,
      changedBy: deletedBy
    });

    logger.info('Schema deleted', {
      schemaId: id,
      modelId: schema.modelId,
      deletedBy
    });

    return { success: true };
  } catch (error) {
    logger.error('Failed to delete schema', {
      schemaId: id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Activate a schema
 */
async function activateSchema(id, activatedBy) {
  try {
    const schema = await getSchemaById(id);

    if (schema.status === 'active') {
      throw new Error('Schema is already active');
    }

    const beforeSnapshot = schema.toJSON();

    await schema.activate();

    await ForgeSchemaChange.logChange({
      schemaId: schema.id,
      changeType: 'activated',
      changeDetails: {
        previousStatus: beforeSnapshot.status
      },
      beforeSnapshot,
      afterSnapshot: schema.toJSON(),
      changedBy: activatedBy
    });

    logger.info('Schema activated', {
      schemaId: schema.id,
      modelId: schema.modelId,
      activatedBy
    });

    return schema;
  } catch (error) {
    logger.error('Failed to activate schema', {
      schemaId: id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Deprecate a schema
 */
async function deprecateSchema(id, deprecatedBy) {
  try {
    const schema = await getSchemaById(id);

    if (schema.status === 'deprecated') {
      throw new Error('Schema is already deprecated');
    }

    const beforeSnapshot = schema.toJSON();

    await schema.deprecate();

    await ForgeSchemaChange.logChange({
      schemaId: schema.id,
      changeType: 'deprecated',
      changeDetails: {
        previousStatus: beforeSnapshot.status
      },
      beforeSnapshot,
      afterSnapshot: schema.toJSON(),
      changedBy: deprecatedBy
    });

    logger.info('Schema deprecated', {
      schemaId: schema.id,
      modelId: schema.modelId,
      deprecatedBy
    });

    return schema;
  } catch (error) {
    logger.error('Failed to deprecate schema', {
      schemaId: id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Validate schema definition
 */
async function validateSchemaDefinition(schemaDefinition) {
  try {
    // Validate against Joi schema
    const { error } = schemaDefinitionSchema.validate(schemaDefinition, {
      abortEarly: false
    });

    if (error) {
      return {
        valid: false,
        errors: error.details.map(d => d.message)
      };
    }

    // Additional validations
    const errors = [];

    // Check required properties exist in properties
    if (schemaDefinition.required) {
      for (const req of schemaDefinition.required) {
        if (!schemaDefinition.properties[req]) {
          errors.push(`Required field "${req}" not found in properties`);
        }
      }
    }

    // Check unique index fields exist
    if (schemaDefinition.indexes) {
      for (const index of schemaDefinition.indexes) {
        for (const field of index.fields) {
          if (!schemaDefinition.properties[field]) {
            errors.push(`Index field "${field}" not found in properties`);
          }
        }
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return { valid: true, errors: [] };
  } catch (error) {
    return {
      valid: false,
      errors: [error.message]
    };
  }
}

/**
 * Generate DDL for a schema
 */
async function generateDDL(id) {
  try {
    const schema = await getSchemaById(id);
    const { tableName, schemaDefinition } = schema;

    let ddl = `-- DDL for ${schema.modelId} v${schema.version}\n`;
    ddl += `-- Table: ${tableName}\n\n`;

    // CREATE TABLE
    ddl += `CREATE TABLE IF NOT EXISTS ${tableName} (\n`;

    const columns = [];
    const properties = schemaDefinition.properties || {};

    for (const [fieldName, fieldDef] of Object.entries(properties)) {
      let columnDef = `  ${fieldName} `;

      // Map JSON Schema types to PostgreSQL types
      const pgType = mapJsonTypeToPgType(fieldDef);
      columnDef += pgType;

      // NOT NULL
      const isRequired = schemaDefinition.required?.includes(fieldName);
      if (isRequired || fieldDef.database?.notNull) {
        columnDef += ' NOT NULL';
      }

      // UNIQUE
      if (fieldDef.database?.unique) {
        columnDef += ' UNIQUE';
      }

      // DEFAULT
      if (fieldDef.default !== undefined) {
        const defaultValue = formatDefaultValue(fieldDef.default, fieldDef.type);
        columnDef += ` DEFAULT ${defaultValue}`;
      }

      // PRIMARY KEY
      if (fieldDef.database?.primaryKey) {
        columnDef += ' PRIMARY KEY';
      }

      columns.push(columnDef);
    }

    ddl += columns.join(',\n');
    ddl += '\n);\n\n';

    // CREATE INDEXES
    if (schemaDefinition.indexes) {
      for (const index of schemaDefinition.indexes) {
        const indexName = index.name || `idx_${tableName}_${index.fields.join('_')}`;
        const uniqueStr = index.unique ? 'UNIQUE ' : '';
        const method = index.type ? ` USING ${index.type.toUpperCase()}` : '';

        ddl += `CREATE ${uniqueStr}INDEX IF NOT EXISTS ${indexName}\n`;
        ddl += `  ON ${tableName}${method} (${index.fields.join(', ')});\n\n`;
      }
    }

    // COMMENTS
    if (schema.description) {
      ddl += `COMMENT ON TABLE ${tableName} IS '${escapeSqlString(schema.description)}';\n\n`;
    }

    for (const [fieldName, fieldDef] of Object.entries(properties)) {
      if (fieldDef.description) {
        ddl += `COMMENT ON COLUMN ${tableName}.${fieldName} IS '${escapeSqlString(fieldDef.description)}';\n`;
      }
    }

    return { ddl, schema };
  } catch (error) {
    logger.error('Failed to generate DDL', {
      schemaId: id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Map JSON Schema type to PostgreSQL type
 */
function mapJsonTypeToPgType(fieldDef) {
  const dbType = fieldDef.database?.type;
  if (dbType) {
    return dbType;
  }

  // Auto-map from JSON Schema type
  const type = fieldDef.type;
  const format = fieldDef.format;

  if (format === 'uuid') return 'UUID';
  if (format === 'email') return 'VARCHAR(255)';
  if (format === 'date') return 'DATE';
  if (format === 'date-time') return 'TIMESTAMPTZ';

  switch (type) {
    case 'string':
      if (fieldDef.maxLength && fieldDef.maxLength <= 255) {
        return `VARCHAR(${fieldDef.maxLength})`;
      }
      return 'TEXT';
    case 'integer':
      return 'INTEGER';
    case 'number':
      if (fieldDef.precision && fieldDef.scale) {
        return `DECIMAL(${fieldDef.precision}, ${fieldDef.scale})`;
      }
      return 'DECIMAL';
    case 'boolean':
      return 'BOOLEAN';
    case 'array':
      return 'JSONB';
    case 'object':
      return 'JSONB';
    default:
      return 'TEXT';
  }
}

/**
 * Format default value for SQL
 */
function formatDefaultValue(value, type) {
  if (value === null) return 'NULL';
  if (type === 'string') return `'${escapeSqlString(value)}'`;
  if (type === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (type === 'number' || type === 'integer') return value;
  if (typeof value === 'object') return `'${JSON.stringify(value)}'::jsonb`;
  return `'${value}'`;
}

/**
 * Escape SQL string
 */
function escapeSqlString(str) {
  return String(str).replace(/'/g, "''");
}

/**
 * Get schema statistics
 */
async function getStatistics() {
  try {
    const [statusStats] = await sequelize.query(`
      SELECT
        status,
        COUNT(*) as count
      FROM forge_schemas
      GROUP BY status
    `);

    const stats = {
      total: 0,
      draft: 0,
      active: 0,
      deprecated: 0,
      archived: 0,
      system: 0,
      user: 0
    };

    statusStats.forEach(row => {
      stats[row.status] = parseInt(row.count);
      stats.total += parseInt(row.count);
    });

    // System vs user
    const [typeStats] = await sequelize.query(`
      SELECT
        is_system,
        COUNT(*) as count
      FROM forge_schemas
      GROUP BY is_system
    `);

    typeStats.forEach(row => {
      if (row.is_system) {
        stats.system = parseInt(row.count);
      } else {
        stats.user = parseInt(row.count);
      }
    });

    // Dependency count
    const [depStats] = await sequelize.query(`
      SELECT COUNT(DISTINCT schema_id) as count
      FROM forge_schema_dependencies
    `);

    stats.schemasWithDependencies = depStats[0] ? parseInt(depStats[0].count) : 0;

    // Migration stats
    const [migStats] = await sequelize.query(`
      SELECT
        status,
        COUNT(*) as count
      FROM forge_migrations
      GROUP BY status
    `);

    stats.migrations = {
      total: 0,
      pending: 0,
      completed: 0,
      failed: 0
    };

    migStats.forEach(row => {
      stats.migrations[row.status] = parseInt(row.count);
      stats.migrations.total += parseInt(row.count);
    });

    return stats;
  } catch (error) {
    logger.error('Failed to get schema statistics', {
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  createSchema,
  getSchemaById,
  listSchemas,
  updateSchema,
  deleteSchema,
  activateSchema,
  deprecateSchema,
  validateSchemaDefinition,
  generateDDL,
  getStatistics
};
