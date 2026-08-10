const { sequelize } = require('../../config/database');
const { ForgeMigration, ForgeSchema, ForgeSchemaChange } = require('../../models/forge');
const logger = require('../../utils/logger');

/**
 * Migration Service
 *
 * Handles migration execution, rollback, and generation
 */

/**
 * Generate migration from schema changes
 */
async function generateMigration({
  fromSchemaId,
  toSchemaId,
  migrationName,
  description,
  createdBy
}) {
  try {
    const toSchema = await ForgeSchema.findByPk(toSchemaId);
    if (!toSchema) {
      throw new Error(`Target schema not found: ${toSchemaId}`);
    }

    let fromSchema = null;
    let fromVersion = null;

    if (fromSchemaId) {
      fromSchema = await ForgeSchema.findByPk(fromSchemaId);
      if (!fromSchema) {
        throw new Error(`Source schema not found: ${fromSchemaId}`);
      }
      fromVersion = fromSchema.version;
    }

    // Generate SQL
    const { upSql, downSql } = await generateMigrationSQL(fromSchema, toSchema);

    // Create migration
    const migration = await ForgeMigration.create({
      migrationName: migrationName || `${toSchema.modelId}_${fromVersion || '0.0.0'}_to_${toSchema.version}`,
      description,
      fromSchemaId,
      toSchemaId,
      fromVersion,
      toVersion: toSchema.version,
      migrationSql: upSql,
      rollbackSql: downSql,
      status: 'pending'
    });

    logger.info('Migration generated', {
      migrationId: migration.id,
      migrationName: migration.migrationName,
      fromVersion,
      toVersion: toSchema.version
    });

    return migration;
  } catch (error) {
    logger.error('Failed to generate migration', {
      fromSchemaId,
      toSchemaId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Execute a migration
 */
async function executeMigration(migrationId, executedBy) {
  const transaction = await sequelize.transaction();
  const startTime = Date.now();

  try {
    const migration = await ForgeMigration.findByPk(migrationId, { transaction });

    if (!migration) {
      throw new Error(`Migration not found: ${migrationId}`);
    }

    if (migration.status !== 'pending') {
      throw new Error(`Cannot execute migration with status: ${migration.status}`);
    }

    // Mark as running
    migration.status = 'running';
    await migration.save({ transaction });

    logger.info('Executing migration', {
      migrationId,
      migrationName: migration.migrationName
    });

    // Execute migration SQL
    if (migration.migrationSql) {
      await sequelize.query(migration.migrationSql, {
        transaction,
        raw: true
      });
    }

    const executionTime = Date.now() - startTime;

    // Mark as completed
    migration.status = 'completed';
    migration.appliedAt = new Date();
    migration.appliedBy = executedBy;
    migration.executionTimeMs = executionTime;
    await migration.save({ transaction });

    // Update schema status if needed
    if (migration.toSchemaId) {
      const schema = await ForgeSchema.findByPk(migration.toSchemaId, { transaction });
      if (schema && schema.status === 'draft') {
        schema.status = 'active';
        await schema.save({ transaction });

        await ForgeSchemaChange.logChange({
          schemaId: schema.id,
          changeType: 'activated',
          changeDetails: {
            migrationId,
            autoActivated: true
          },
          afterSnapshot: schema.toJSON(),
          changedBy: executedBy,
          migrationId
        }, { transaction });
      }
    }

    await transaction.commit();

    logger.info('Migration executed successfully', {
      migrationId,
      migrationName: migration.migrationName,
      executionTime
    });

    return {
      success: true,
      migration,
      executionTime
    };
  } catch (error) {
    await transaction.rollback();

    // Mark migration as failed
    try {
      const migration = await ForgeMigration.findByPk(migrationId);
      if (migration) {
        migration.status = 'failed';
        migration.error = error.message;
        migration.errorStack = error.stack;
        await migration.save();
      }
    } catch (updateError) {
      logger.error('Failed to update migration status', {
        migrationId,
        error: updateError.message
      });
    }

    logger.error('Migration execution failed', {
      migrationId,
      error: error.message,
      stack: error.stack
    });

    throw error;
  }
}

/**
 * Rollback a migration
 */
async function rollbackMigration(migrationId, rolledBackBy) {
  const transaction = await sequelize.transaction();

  try {
    const migration = await ForgeMigration.findByPk(migrationId, { transaction });

    if (!migration) {
      throw new Error(`Migration not found: ${migrationId}`);
    }

    if (migration.status !== 'completed') {
      throw new Error(`Cannot rollback migration with status: ${migration.status}`);
    }

    if (!migration.rollbackSql) {
      throw new Error('Migration does not have rollback SQL');
    }

    logger.info('Rolling back migration', {
      migrationId,
      migrationName: migration.migrationName
    });

    // Execute rollback SQL
    await sequelize.query(migration.rollbackSql, {
      transaction,
      raw: true
    });

    // Mark as rolled back
    migration.status = 'rolled_back';
    migration.rolledBackAt = new Date();
    migration.rolledBackBy = rolledBackBy;
    await migration.save({ transaction });

    // Update schema status if needed
    if (migration.toSchemaId) {
      const schema = await ForgeSchema.findByPk(migration.toSchemaId, { transaction });
      if (schema && schema.status === 'active') {
        schema.status = 'draft';
        await schema.save({ transaction });

        await ForgeSchemaChange.logChange({
          schemaId: schema.id,
          changeType: 'updated',
          changeDetails: {
            migrationId,
            rolledBack: true,
            statusChange: 'active -> draft'
          },
          beforeSnapshot: { ...schema.toJSON(), status: 'active' },
          afterSnapshot: schema.toJSON(),
          changedBy: rolledBackBy,
          migrationId
        }, { transaction });
      }
    }

    await transaction.commit();

    logger.info('Migration rolled back successfully', {
      migrationId,
      migrationName: migration.migrationName
    });

    return {
      success: true,
      migration
    };
  } catch (error) {
    await transaction.rollback();

    logger.error('Migration rollback failed', {
      migrationId,
      error: error.message,
      stack: error.stack
    });

    throw error;
  }
}

/**
 * Execute all pending migrations
 */
async function executeAllPending(executedBy) {
  try {
    const pendingMigrations = await ForgeMigration.findAll({
      where: { status: 'pending' },
      order: [['executionOrder', 'ASC'], ['createdAt', 'ASC']]
    });

    if (pendingMigrations.length === 0) {
      return {
        success: true,
        executed: 0,
        message: 'No pending migrations'
      };
    }

    logger.info('Executing pending migrations', {
      count: pendingMigrations.length
    });

    const results = {
      success: true,
      executed: 0,
      failed: 0,
      migrations: []
    };

    for (const migration of pendingMigrations) {
      try {
        const result = await executeMigration(migration.id, executedBy);
        results.executed++;
        results.migrations.push({
          migrationId: migration.id,
          migrationName: migration.migrationName,
          success: true,
          executionTime: result.executionTime
        });
      } catch (error) {
        results.failed++;
        results.success = false;
        results.migrations.push({
          migrationId: migration.id,
          migrationName: migration.migrationName,
          success: false,
          error: error.message
        });

        // Stop on first failure
        logger.error('Stopping migration execution due to failure', {
          migrationId: migration.id,
          migrationName: migration.migrationName,
          error: error.message
        });
        break;
      }
    }

    return results;
  } catch (error) {
    logger.error('Failed to execute pending migrations', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Get migration by ID
 */
async function getMigrationById(id) {
  const migration = await ForgeMigration.findByPk(id, {
    include: [
      { model: ForgeSchema, as: 'fromSchema' },
      { model: ForgeSchema, as: 'toSchema' }
    ]
  });

  if (!migration) {
    throw new Error(`Migration not found: ${id}`);
  }

  return migration;
}

/**
 * List migrations
 */
async function listMigrations({
  status,
  schemaId,
  limit = 50,
  offset = 0
}) {
  const where = {};

  if (status) {
    where.status = status;
  }

  if (schemaId) {
    const { Op } = require('sequelize');
    where[Op.or] = [
      { fromSchemaId: schemaId },
      { toSchemaId: schemaId }
    ];
  }

  const { count, rows } = await ForgeMigration.findAndCountAll({
    where,
    limit,
    offset,
    order: [['createdAt', 'DESC']],
    include: [
      { model: ForgeSchema, as: 'fromSchema', attributes: ['id', 'modelId', 'version'] },
      { model: ForgeSchema, as: 'toSchema', attributes: ['id', 'modelId', 'version'] }
    ]
  });

  return {
    migrations: rows,
    total: count,
    limit,
    offset
  };
}

/**
 * Get migration statistics
 */
async function getStatistics() {
  try {
    const [results] = await sequelize.query(`
      SELECT
        status,
        COUNT(*) as count,
        AVG(execution_time_ms) as avg_execution_time,
        MAX(execution_time_ms) as max_execution_time,
        MIN(execution_time_ms) as min_execution_time
      FROM forge_migrations
      WHERE status != 'pending'
      GROUP BY status
    `);

    const stats = {
      total: 0,
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      rolled_back: 0,
      avgExecutionTime: 0,
      maxExecutionTime: 0,
      minExecutionTime: 0
    };

    results.forEach(row => {
      stats[row.status] = parseInt(row.count);
      stats.total += parseInt(row.count);

      if (row.status === 'completed' && row.avg_execution_time) {
        stats.avgExecutionTime = parseFloat(row.avg_execution_time);
        stats.maxExecutionTime = parseFloat(row.max_execution_time);
        stats.minExecutionTime = parseFloat(row.min_execution_time);
      }
    });

    // Get pending count separately
    const pendingCount = await ForgeMigration.count({ where: { status: 'pending' } });
    stats.pending = pendingCount;
    stats.total += pendingCount;

    return stats;
  } catch (error) {
    logger.error('Failed to get migration statistics', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Generate migration SQL by comparing schemas
 */
async function generateMigrationSQL(fromSchema, toSchema) {
  let upSql = '';
  let downSql = '';

  const tableName = toSchema.tableName;

  // If no from schema, this is a CREATE TABLE migration
  if (!fromSchema) {
    upSql = await generateCreateTableSQL(toSchema);
    downSql = `DROP TABLE IF EXISTS ${tableName};`;
    return { upSql, downSql };
  }

  // Compare schemas and generate ALTER statements
  const fromProps = fromSchema.schemaDefinition.properties || {};
  const toProps = toSchema.schemaDefinition.properties || {};

  // Find added columns
  for (const [fieldName, fieldDef] of Object.entries(toProps)) {
    if (!fromProps[fieldName]) {
      const pgType = mapJsonTypeToPgType(fieldDef);
      upSql += `ALTER TABLE ${tableName} ADD COLUMN ${fieldName} ${pgType};\n`;
      downSql = `ALTER TABLE ${tableName} DROP COLUMN ${fieldName};\n` + downSql;
    }
  }

  // Find removed columns
  for (const [fieldName, fieldDef] of Object.entries(fromProps)) {
    if (!toProps[fieldName]) {
      upSql += `ALTER TABLE ${tableName} DROP COLUMN ${fieldName};\n`;
      const pgType = mapJsonTypeToPgType(fieldDef);
      downSql = `ALTER TABLE ${tableName} ADD COLUMN ${fieldName} ${pgType};\n` + downSql;
    }
  }

  // Find modified columns (simplified - just logs a comment)
  for (const [fieldName, fieldDef] of Object.entries(toProps)) {
    if (fromProps[fieldName]) {
      const fromType = mapJsonTypeToPgType(fromProps[fieldName]);
      const toType = mapJsonTypeToPgType(fieldDef);

      if (fromType !== toType) {
        upSql += `-- ALTER TABLE ${tableName} ALTER COLUMN ${fieldName} TYPE ${toType};\n`;
        upSql += `-- WARNING: Column type change detected. Please review manually.\n`;
      }
    }
  }

  // Handle indexes
  const fromIndexes = fromSchema.schemaDefinition.indexes || [];
  const toIndexes = toSchema.schemaDefinition.indexes || [];

  // Add new indexes
  for (const index of toIndexes) {
    const exists = fromIndexes.find(fi =>
      fi.name === index.name ||
      JSON.stringify(fi.fields) === JSON.stringify(index.fields)
    );

    if (!exists) {
      const indexName = index.name || `idx_${tableName}_${index.fields.join('_')}`;
      const uniqueStr = index.unique ? 'UNIQUE ' : '';
      upSql += `CREATE ${uniqueStr}INDEX ${indexName} ON ${tableName} (${index.fields.join(', ')});\n`;
      downSql = `DROP INDEX IF EXISTS ${indexName};\n` + downSql;
    }
  }

  return { upSql, downSql };
}

/**
 * Generate CREATE TABLE SQL
 */
async function generateCreateTableSQL(schema) {
  const { tableName, schemaDefinition } = schema;

  let sql = `CREATE TABLE ${tableName} (\n`;

  const columns = [];
  const properties = schemaDefinition.properties || {};

  for (const [fieldName, fieldDef] of Object.entries(properties)) {
    let columnDef = `  ${fieldName} `;

    const pgType = mapJsonTypeToPgType(fieldDef);
    columnDef += pgType;

    const isRequired = schemaDefinition.required?.includes(fieldName);
    if (isRequired || fieldDef.database?.notNull) {
      columnDef += ' NOT NULL';
    }

    if (fieldDef.database?.unique) {
      columnDef += ' UNIQUE';
    }

    if (fieldDef.default !== undefined) {
      const defaultValue = formatDefaultValue(fieldDef.default, fieldDef.type);
      columnDef += ` DEFAULT ${defaultValue}`;
    }

    if (fieldDef.database?.primaryKey) {
      columnDef += ' PRIMARY KEY';
    }

    columns.push(columnDef);
  }

  sql += columns.join(',\n');
  sql += '\n);\n\n';

  // Add indexes
  if (schemaDefinition.indexes) {
    for (const index of schemaDefinition.indexes) {
      const indexName = index.name || `idx_${tableName}_${index.fields.join('_')}`;
      const uniqueStr = index.unique ? 'UNIQUE ' : '';
      sql += `CREATE ${uniqueStr}INDEX ${indexName} ON ${tableName} (${index.fields.join(', ')});\n`;
    }
  }

  return sql;
}

/**
 * Map JSON Schema type to PostgreSQL type (same as in schemaService)
 */
function mapJsonTypeToPgType(fieldDef) {
  const dbType = fieldDef.database?.type;
  if (dbType) return dbType;

  const type = fieldDef.type;
  const format = fieldDef.format;

  if (format === 'uuid') return 'UUID';
  if (format === 'email') return 'VARCHAR(255)';
  if (format === 'date') return 'DATE';
  if (format === 'date-time') return 'TIMESTAMPTZ';

  switch (type) {
    case 'string':
      return fieldDef.maxLength && fieldDef.maxLength <= 255
        ? `VARCHAR(${fieldDef.maxLength})`
        : 'TEXT';
    case 'integer':
      return 'INTEGER';
    case 'number':
      return fieldDef.precision && fieldDef.scale
        ? `DECIMAL(${fieldDef.precision}, ${fieldDef.scale})`
        : 'DECIMAL';
    case 'boolean':
      return 'BOOLEAN';
    case 'array':
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
  if (type === 'string') return `'${value.replace(/'/g, "''")}'`;
  if (type === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (type === 'number' || type === 'integer') return value;
  if (typeof value === 'object') return `'${JSON.stringify(value)}'::jsonb`;
  return `'${value}'`;
}

module.exports = {
  generateMigration,
  executeMigration,
  rollbackMigration,
  executeAllPending,
  getMigrationById,
  listMigrations,
  getStatistics,
  generateMigrationSQL
};
