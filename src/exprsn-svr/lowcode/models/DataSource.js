/**
 * DataSource Model
 *
 * Represents a data source connection (PostgreSQL, Forge, REST, SOAP, files, etc.).
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DataSource = sequelize.define('DataSource', {
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
    sourceType: {
      type: DataTypes.ENUM(
        'postgresql',
        'forge',
        'rest',
        'soap',
        'webhook',
        'json',
        'xml',
        'csv',
        'tsv',
        'redis',
        'plugin',
        'schema',
        'webservice'
      ),
      allowNull: false,
      field: 'source_type',
    },
    connectionConfig: {
      type: DataTypes.JSONB,
      allowNull: false,
      field: 'connection_config',
    },
    schemaConfig: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'schema_config',
    },
    operations: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {
        read: true,
        create: false,
        update: false,
        delete: false,
      },
    },
    delegable: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
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
    },
    timeout: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 30000,
    },
    retryConfig: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {
        enabled: false,
        maxRetries: 3,
        backoffMs: 1000,
      },
      field: 'retry_config',
    },
    authConfig: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'auth_config',
    },
    headers: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'error'),
      allowNull: false,
      defaultValue: 'active',
    },
    lastTestedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_tested_at',
    },
    lastTestResult: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'last_test_result',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    pluginId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'plugin_id',
      comment: 'Reference to plugin that provides this datasource',
    },
    pluginConfig: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'plugin_config',
      comment: 'Plugin-specific configuration',
    },
    icon: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: 'fa-database',
      comment: 'Font Awesome icon class',
    },
    color: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: '#667eea',
      comment: 'Color for UI visualization',
    },
  }, {
    tableName: 'data_sources',
    timestamps: true,
    underscored: true,
    paranoid: true,
    indexes: [
      { fields: ['application_id'] },
      { fields: ['source_type'] },
      { fields: ['status'] },
      {
        unique: true,
        fields: ['application_id', 'name'],
        where: { deleted_at: null },
      },
    ],
  });

  DataSource.associate = (models) => {
    DataSource.belongsTo(models.Application, {
      foreignKey: 'applicationId',
      as: 'application',
    });

    DataSource.hasMany(models.FormConnection, {
      foreignKey: 'dataSourceId',
      as: 'formConnections',
      onDelete: 'CASCADE',
    });

    DataSource.hasMany(models.Query, {
      foreignKey: 'dataSourceId',
      as: 'queries',
      onDelete: 'SET NULL',
    });
  };

  // Instance methods
  DataSource.prototype.testConnection = async function() {
    // This would be implemented in the ConnectionService
    this.lastTestedAt = new Date();
    this.lastTestResult = {
      success: true,
      message: 'Connection test not yet implemented',
    };
    this.status = 'active';
    return await this.save();
  };

  DataSource.prototype.markError = async function(error) {
    this.status = 'error';
    this.lastTestResult = {
      success: false,
      error: error.message,
      timestamp: new Date(),
    };
    return await this.save();
  };

  return DataSource;
};
