/**
 * DataSource Model
 * Represents connections to various data sources (Exprsn services, databases, APIs)
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DataSource = sequelize.define('DataSource', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
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
    type: {
      type: DataTypes.ENUM(
        'exprsn-service',    // Exprsn microservices
        'postgresql',        // Direct PostgreSQL connection
        'rest-api',          // External REST API
        'custom-query'       // Custom SQL/JSON query
      ),
      allowNull: false,
      defaultValue: 'exprsn-service'
    },
    config: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      comment: 'Connection configuration (service URL, credentials, etc.)'
    },
    serviceName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'For exprsn-service type: ca, auth, timeline, etc.'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'User ID who created this data source'
    },
    updatedBy: {
      type: DataTypes.UUID,
      allowNull: true
    },
    lastTestedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    testStatus: {
      type: DataTypes.ENUM('success', 'failed', 'pending'),
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Additional metadata (available tables, endpoints, etc.)'
    }
  }, {
    tableName: 'data_sources',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['type'] },
      { fields: ['service_name'] },
      { fields: ['is_active'] },
      { fields: ['created_by'] }
    ]
  });

  return DataSource;
};
