/**
 * AI Data Transformation Model
 *
 * Data cleansing, normalization, enrichment, validation jobs.
 * Tracks transformation operations on entity data.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AIDataTransformation = sequelize.define('AIDataTransformation', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    executionLogId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'execution_log_id',
      references: {
        model: 'ai_execution_logs',
        key: 'id',
      },
    },
    configurationId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'configuration_id',
    },
    entityId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'entity_id',
    },
    transformationType: {
      type: DataTypes.ENUM(
        'data_cleansing',
        'data_enrichment',
        'data_normalization',
        'duplicate_detection',
        'missing_data_completion',
        'validation',
        'batch_update',
        'data_migration'
      ),
      allowNull: false,
      field: 'transformation_type',
    },
    sourceQuery: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'source_query',
      comment: 'Query to select records to transform',
    },
    transformationRules: {
      type: DataTypes.JSONB,
      allowNull: false,
      field: 'transformation_rules',
      comment: 'AI-generated transformation logic',
    },
    previewResults: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'preview_results',
      comment: 'Sample of transformed data for review',
    },
    recordsAffected: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'records_affected',
    },
    executionPlan: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'execution_plan',
      comment: 'Human-readable explanation',
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'running', 'completed', 'failed', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending',
    },
    progress: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '0-100',
      validate: {
        min: 0,
        max: 100,
      },
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'started_at',
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
    },
    errorDetails: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'error_details',
    },
    approvedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'approved_by',
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'approved_at',
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'created_by',
    },
  }, {
    tableName: 'ai_data_transformations',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['entity_id'] },
      { fields: ['status'] },
      { fields: ['transformation_type'] },
      { fields: ['created_by'] },
    ],
    scopes: {
      pending: {
        where: { status: 'pending' },
      },
      running: {
        where: { status: 'running' },
      },
      completed: {
        where: { status: 'completed' },
      },
    },
  });

  AIDataTransformation.associate = (models) => {
    // Belongs to execution log
    AIDataTransformation.belongsTo(models.AIExecutionLog, {
      foreignKey: 'executionLogId',
      as: 'executionLog',
    });
  };

  // Instance methods
  AIDataTransformation.prototype.approve = async function(userId) {
    this.status = 'approved';
    this.approvedBy = userId;
    this.approvedAt = new Date();
    await this.save();
  };

  AIDataTransformation.prototype.start = async function() {
    this.status = 'running';
    this.startedAt = new Date();
    this.progress = 0;
    await this.save();
  };

  AIDataTransformation.prototype.updateProgress = async function(progress) {
    this.progress = Math.min(100, Math.max(0, progress));
    await this.save();
  };

  AIDataTransformation.prototype.complete = async function(recordsAffected) {
    this.status = 'completed';
    this.progress = 100;
    this.completedAt = new Date();
    this.recordsAffected = recordsAffected;
    await this.save();
  };

  AIDataTransformation.prototype.fail = async function(errorDetails) {
    this.status = 'failed';
    this.completedAt = new Date();
    this.errorDetails = errorDetails;
    await this.save();
  };

  AIDataTransformation.prototype.cancel = async function() {
    this.status = 'cancelled';
    this.completedAt = new Date();
    await this.save();
  };

  AIDataTransformation.prototype.getDuration = function() {
    if (!this.startedAt || !this.completedAt) {
      return null;
    }
    return this.completedAt - this.startedAt;
  };

  return AIDataTransformation;
};
