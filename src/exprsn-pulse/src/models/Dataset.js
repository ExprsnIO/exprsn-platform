/**
 * Dataset Model
 * Stores cached results from query executions
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Dataset = sequelize.define('Dataset', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    queryId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'queries',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    data: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment: 'Cached query results as JSON array'
    },
    schema: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment: 'Data schema with column names, types, and metadata'
    },
    rowCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    columnCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    size: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Dataset size in bytes'
    },
    executionTime: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Query execution time in milliseconds'
    },
    parameters: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Parameter values used for this execution'
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Dataset expiration timestamp (for cache invalidation)'
    },
    isSnapshot: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'True if this is a saved snapshot (never expires)'
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'datasets',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['query_id'] },
      { fields: ['expires_at'] },
      { fields: ['is_snapshot'] },
      { fields: ['created_by'] },
      { fields: ['created_at'] }
    ]
  });

  return Dataset;
};
