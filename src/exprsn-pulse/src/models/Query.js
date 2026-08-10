/**
 * Query Model
 * Stores saved queries that can be executed against data sources
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Query = sequelize.define('Query', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    dataSourceId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'data_sources',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 255]
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    queryType: {
      type: DataTypes.ENUM('sql', 'rest', 'jsonlex', 'custom'),
      allowNull: false,
      defaultValue: 'sql'
    },
    queryDefinition: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment: 'Query definition (SQL string, REST endpoint config, JSONLex expression, etc.)'
    },
    parameters: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Array of parameter definitions with names, types, default values'
    },
    refreshInterval: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Auto-refresh interval in seconds (null = manual refresh only)'
    },
    cacheEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    cacheTTL: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 300,
      field: 'cache_ttl',  // Explicit field name to avoid Sequelize underscore bug
      comment: 'Cache time-to-live in seconds'
    },
    isPublic: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false
    },
    updatedBy: {
      type: DataTypes.UUID,
      allowNull: true
    },
    lastExecutedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    executionCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    avgExecutionTime: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Average execution time in milliseconds'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'queries',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['data_source_id'] },
      { fields: ['query_type'] },
      { fields: ['created_by'] },
      { fields: ['is_public'] },
      { fields: ['last_executed_at'] }
    ]
  });

  return Query;
};
