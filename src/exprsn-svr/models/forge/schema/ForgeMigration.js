const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

/**
 * ForgeMigration Model
 *
 * Stores generated migration scripts for schema changes
 * Tracks migration execution status and errors
 */
const ForgeMigration = sequelize.define('ForgeMigration', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  migrationName: {
    type: DataTypes.STRING(200),
    allowNull: false,
    unique: true,
    field: 'migration_name',
    comment: 'Unique name for the migration (e.g., add_status_to_customers_v1.1.0)'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Human-readable description of what this migration does'
  },
  fromSchemaId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'from_schema_id',
    references: {
      model: 'forge_schemas',
      key: 'id'
    },
    comment: 'Source schema (null for initial creation)'
  },
  toSchemaId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'to_schema_id',
    references: {
      model: 'forge_schemas',
      key: 'id'
    },
    comment: 'Target schema'
  },
  fromVersion: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'from_version',
    comment: 'Source schema version'
  },
  toVersion: {
    type: DataTypes.STRING(20),
    allowNull: false,
    field: 'to_version',
    comment: 'Target schema version'
  },
  migrationSql: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'migration_sql',
    comment: 'SQL statements to apply the migration'
  },
  rollbackSql: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'rollback_sql',
    comment: 'SQL statements to rollback the migration'
  },
  status: {
    type: DataTypes.ENUM('pending', 'running', 'completed', 'failed', 'rolled_back'),
    allowNull: false,
    defaultValue: 'pending',
    comment: 'Current status of the migration'
  },
  executionOrder: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'execution_order',
    comment: 'Order for executing migrations in batches (topologically sorted)'
  },
  appliedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'applied_at',
    comment: 'When the migration was successfully applied'
  },
  appliedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'applied_by',
    comment: 'User who applied the migration'
  },
  executionTimeMs: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'execution_time_ms',
    comment: 'Time taken to execute the migration in milliseconds'
  },
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'error_message',
    comment: 'Error message if migration failed'
  },
  errorStack: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'error_stack',
    comment: 'Full error stack trace if migration failed'
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'created_at'
  }
}, {
  tableName: 'forge_migrations',
  timestamps: false, // Only createdAt, no updatedAt
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['migration_name']
    },
    {
      fields: ['status']
    },
    {
      fields: ['to_schema_id']
    },
    {
      fields: ['from_schema_id']
    },
    {
      fields: ['applied_at']
    },
    {
      fields: ['execution_order']
    },
    {
      fields: ['from_version', 'to_version']
    }
  ],
  hooks: {
    beforeUpdate: (migration) => {
      // Prevent modification of completed migrations
      if (migration.status === 'completed' && migration.changed('migrationSql')) {
        throw new Error('Cannot modify a completed migration');
      }
    }
  }
});

/**
 * Instance Methods
 */

/**
 * Execute this migration
 */
ForgeMigration.prototype.execute = async function(userId = null) {
  if (this.status === 'completed') {
    throw new Error('Migration has already been completed');
  }

  if (this.status === 'running') {
    throw new Error('Migration is already running');
  }

  const startTime = Date.now();

  try {
    // Update status to running
    this.status = 'running';
    await this.save();

    // Execute the migration SQL
    await sequelize.query(this.migrationSql, {
      type: sequelize.QueryTypes.RAW
    });

    // Update status to completed
    this.status = 'completed';
    this.appliedAt = new Date();
    this.appliedBy = userId;
    this.executionTimeMs = Date.now() - startTime;
    await this.save();

    return { success: true, executionTime: this.executionTimeMs };
  } catch (error) {
    // Update status to failed
    this.status = 'failed';
    this.errorMessage = error.message;
    this.errorStack = error.stack;
    this.executionTimeMs = Date.now() - startTime;
    await this.save();

    throw error;
  }
};

/**
 * Rollback this migration
 */
ForgeMigration.prototype.rollback = async function(userId = null) {
  if (this.status !== 'completed') {
    throw new Error('Can only rollback completed migrations');
  }

  if (!this.rollbackSql) {
    throw new Error('No rollback SQL available for this migration');
  }

  const startTime = Date.now();

  try {
    // Execute the rollback SQL
    await sequelize.query(this.rollbackSql, {
      type: sequelize.QueryTypes.RAW
    });

    // Update status to rolled_back
    this.status = 'rolled_back';
    this.appliedBy = userId;
    this.executionTimeMs = Date.now() - startTime;
    await this.save();

    return { success: true, executionTime: this.executionTimeMs };
  } catch (error) {
    this.errorMessage = error.message;
    this.errorStack = error.stack;
    await this.save();

    throw error;
  }
};

/**
 * Mark as pending (reset status)
 */
ForgeMigration.prototype.resetStatus = async function() {
  if (this.status === 'completed') {
    throw new Error('Cannot reset a completed migration');
  }

  this.status = 'pending';
  this.errorMessage = null;
  this.errorStack = null;
  this.appliedAt = null;
  this.executionTimeMs = null;
  await this.save();
};

/**
 * Check if migration can be executed
 */
ForgeMigration.prototype.canExecute = function() {
  return this.status === 'pending' || this.status === 'failed';
};

/**
 * Check if migration can be rolled back
 */
ForgeMigration.prototype.canRollback = function() {
  return this.status === 'completed' && this.rollbackSql;
};

/**
 * Get the from schema
 */
ForgeMigration.prototype.getFromSchema = async function() {
  if (!this.fromSchemaId) {
    return null;
  }

  const ForgeSchema = require('./ForgeSchema');
  return await ForgeSchema.findByPk(this.fromSchemaId);
};

/**
 * Get the to schema
 */
ForgeMigration.prototype.getToSchema = async function() {
  const ForgeSchema = require('./ForgeSchema');
  return await ForgeSchema.findByPk(this.toSchemaId);
};

/**
 * Class Methods
 */

/**
 * Get pending migrations
 */
ForgeMigration.getPendingMigrations = async function() {
  return await this.findAll({
    where: { status: 'pending' },
    order: [['executionOrder', 'ASC'], ['createdAt', 'ASC']]
  });
};

/**
 * Get completed migrations
 */
ForgeMigration.getCompletedMigrations = async function() {
  return await this.findAll({
    where: { status: 'completed' },
    order: [['appliedAt', 'DESC']]
  });
};

/**
 * Get failed migrations
 */
ForgeMigration.getFailedMigrations = async function() {
  return await this.findAll({
    where: { status: 'failed' },
    order: [['createdAt', 'DESC']]
  });
};

/**
 * Get migrations for a schema
 */
ForgeMigration.getMigrationsForSchema = async function(schemaId) {
  return await this.findAll({
    where: {
      [sequelize.Op.or]: [
        { fromSchemaId: schemaId },
        { toSchemaId: schemaId }
      ]
    },
    order: [['createdAt', 'DESC']]
  });
};

/**
 * Execute all pending migrations in order
 */
ForgeMigration.executeAllPending = async function(userId = null) {
  const pending = await this.getPendingMigrations();

  if (pending.length === 0) {
    return { success: true, executed: 0, failed: 0, results: [] };
  }

  const results = [];
  let executed = 0;
  let failed = 0;

  for (const migration of pending) {
    try {
      const result = await migration.execute(userId);
      results.push({
        migrationName: migration.migrationName,
        success: true,
        executionTime: result.executionTime
      });
      executed++;
    } catch (error) {
      results.push({
        migrationName: migration.migrationName,
        success: false,
        error: error.message
      });
      failed++;

      // Stop on first failure
      break;
    }
  }

  return {
    success: failed === 0,
    executed,
    failed,
    total: pending.length,
    results
  };
};

/**
 * Get migration statistics
 */
ForgeMigration.getStatistics = async function() {
  const [statusCounts] = await sequelize.query(`
    SELECT
      status,
      COUNT(*) as count
    FROM forge_migrations
    GROUP BY status
  `);

  const [avgExecutionTime] = await sequelize.query(`
    SELECT
      AVG(execution_time_ms) as avg_time,
      MAX(execution_time_ms) as max_time,
      MIN(execution_time_ms) as min_time
    FROM forge_migrations
    WHERE status = 'completed' AND execution_time_ms IS NOT NULL
  `);

  return {
    statusCounts: statusCounts.reduce((acc, row) => {
      acc[row.status] = parseInt(row.count);
      return acc;
    }, {}),
    executionTime: avgExecutionTime[0] || {
      avg_time: null,
      max_time: null,
      min_time: null
    }
  };
};

module.exports = ForgeMigration;
