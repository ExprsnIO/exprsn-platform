/**
 * Query Model
 *
 * Represents a visual or SQL query definition that can be executed against data sources.
 * Supports visual query builder state, raw SQL, and JSONLex transformations.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Query = sequelize.define('Query', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    applicationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'application_id',
      references: {
        model: 'applications',
        key: 'id',
      },
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
        is: /^[a-zA-Z][a-zA-Z0-9_]*$/,
      },
    },
    displayName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'display_name',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    dataSourceId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'data_source_id',
      references: {
        model: 'data_sources',
        key: 'id',
      },
    },
    queryType: {
      type: DataTypes.ENUM('visual', 'sql', 'function', 'rest'),
      allowNull: false,
      defaultValue: 'visual',
      field: 'query_type',
    },
    queryDefinition: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'query_definition',
      comment: 'Visual query builder state (tables, joins, filters, etc.)',
    },
    rawSql: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'raw_sql',
      comment: 'Raw SQL for sql type queries',
    },
    parameters: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Query parameters with types and default values',
    },
    resultTransform: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'result_transform',
      comment: 'JSONLex expression to transform query results',
    },
    cacheEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'cache_enabled',
    },
    cacheTtl: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'cache_ttl',
      comment: 'Cache time-to-live in seconds',
    },
    timeout: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 30000,
      comment: 'Query timeout in milliseconds',
    },
    status: {
      type: DataTypes.ENUM('draft', 'active', 'inactive', 'deprecated'),
      allowNull: false,
      defaultValue: 'draft',
    },
    icon: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Icon identifier for UI display',
    },
    color: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'Color code for UI display',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Additional metadata (tags, category, permissions, etc.)',
    },
    lastExecutedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_executed_at',
    },
    executionCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'execution_count',
    },
  }, {
    tableName: 'queries',
    underscored: true,
    timestamps: true,
    paranoid: true, // Soft deletes
    indexes: [
      {
        fields: ['application_id'],
        name: 'idx_queries_application_id',
      },
      {
        fields: ['data_source_id'],
        name: 'idx_queries_data_source_id',
      },
      {
        fields: ['status'],
        name: 'idx_queries_status',
      },
      {
        fields: ['query_type'],
        name: 'idx_queries_query_type',
      },
      {
        fields: ['name', 'application_id'],
        unique: true,
        name: 'idx_queries_name_app_unique',
      },
    ],
  });

  // Associations
  Query.associate = (models) => {
    // Query belongs to Application
    Query.belongsTo(models.Application, {
      foreignKey: 'applicationId',
      as: 'application',
      onDelete: 'CASCADE',
    });

    // Query optionally belongs to DataSource
    Query.belongsTo(models.DataSource, {
      foreignKey: 'dataSourceId',
      as: 'dataSource',
      onDelete: 'SET NULL',
    });
  };

  // Instance methods
  Query.prototype.incrementExecutionCount = async function() {
    this.executionCount += 1;
    this.lastExecutedAt = new Date();
    await this.save();
  };

  return Query;
};
