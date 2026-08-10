/**
 * DataImport Model
 *
 * Represents a data import job - tracks imports, transformations, and results.
 * Similar to Power Query refresh/load operations.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DataImport = sequelize.define('DataImport', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    dataSourceId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'data_source_id',
      references: {
        model: 'data_sources',
        key: 'id'
      }
    },
    status: {
      type: DataTypes.ENUM('pending', 'running', 'success', 'error', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending'
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'started_at'
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at'
    },
    sourceData: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'source_data',
      comment: 'Sample of raw source data'
    },
    transformedData: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'transformed_data',
      comment: 'Sample of transformed data'
    },
    rowsImported: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'rows_imported'
    },
    rowsTransformed: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'rows_transformed'
    },
    rowsWithErrors: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'rows_with_errors'
    },
    errors: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Array of error details'
    },
    transformationLog: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'transformation_log',
      comment: 'Log of transformation steps applied'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Import metadata (file size, duration, etc.)'
    },
    triggeredBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'triggered_by',
      comment: 'User who triggered this import'
    }
  }, {
    tableName: 'data_imports',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['data_source_id'] },
      { fields: ['status'] },
      { fields: ['started_at'] },
      { fields: ['triggered_by'] }
    ]
  });

  DataImport.associate = (models) => {
    DataImport.belongsTo(models.DataSource, {
      foreignKey: 'dataSourceId',
      as: 'dataSource'
    });
  };

  // Instance methods
  DataImport.prototype.markRunning = async function() {
    this.status = 'running';
    this.startedAt = new Date();
    return await this.save();
  };

  DataImport.prototype.markSuccess = async function(stats) {
    this.status = 'success';
    this.completedAt = new Date();
    this.rowsImported = stats.rowsImported || 0;
    this.rowsTransformed = stats.rowsTransformed || 0;
    this.rowsWithErrors = stats.rowsWithErrors || 0;
    return await this.save();
  };

  DataImport.prototype.markError = async function(error) {
    this.status = 'error';
    this.completedAt = new Date();
    this.errors = this.errors || [];
    this.errors.push({
      message: error.message,
      stack: error.stack,
      timestamp: new Date()
    });
    return await this.save();
  };

  return DataImport;
};
