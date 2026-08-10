/**
 * Report Execution Model
 * Tracks report execution history and results
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ReportExecution = sequelize.define('ReportExecution', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    reportId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'report_id',
      references: {
        model: 'reports',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },

    scheduleId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'schedule_id',
      references: {
        model: 'report_schedules',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    },

    // Who triggered this execution
    executedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'executed_by',
      comment: 'User ID who triggered the report, NULL for scheduled reports'
    },

    // Execution details
    startedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'started_at'
    },

    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at'
    },

    durationMs: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'duration_ms'
    },

    // Execution status
    status: {
      type: DataTypes.ENUM('running', 'completed', 'failed', 'cancelled', 'timeout'),
      defaultValue: 'running'
    },

    // Result details
    rowCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'row_count',
      comment: 'Number of rows in result set'
    },

    resultSize: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'result_size',
      comment: 'Size of result in bytes'
    },

    // Export file information
    exportFormat: {
      type: DataTypes.ENUM('pdf', 'excel', 'csv', 'json'),
      allowNull: true,
      field: 'export_format'
    },

    exportPath: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'export_path',
      comment: 'Path to exported file in storage'
    },

    exportUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'export_url',
      comment: 'Public URL to download exported file'
    },

    exportExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'export_expires_at',
      comment: 'When the export file expires and will be deleted'
    },

    // Parameters used for this execution
    parameters: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Actual parameters used (date ranges, filters, etc.)'
    },

    // Error information
    error: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Error message if execution failed'
    },

    errorStack: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'error_stack',
      comment: 'Error stack trace for debugging'
    },

    // Cache information
    cacheKey: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'cache_key',
      comment: 'Redis cache key for this execution result'
    },

    cacheHit: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'cache_hit',
      comment: 'Whether this execution was served from cache'
    },

    // Delivery information
    deliveryMethod: {
      type: DataTypes.ENUM('email', 'download', 'storage', 'webhook'),
      allowNull: true,
      field: 'delivery_method'
    },

    deliveryStatus: {
      type: DataTypes.ENUM('pending', 'sent', 'failed'),
      allowNull: true,
      field: 'delivery_status'
    },

    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'delivered_at'
    },

    deliveryError: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'delivery_error'
    },

    // Metadata
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Additional execution metadata'
    }

  }, {
    tableName: 'report_executions',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['report_id'] },
      { fields: ['schedule_id'] },
      { fields: ['executed_by'] },
      { fields: ['status'] },
      { fields: ['started_at'] },
      { fields: ['cache_key'] },
      { fields: ['export_expires_at'] }
    ]
  });

  ReportExecution.associate = (models) => {
    ReportExecution.belongsTo(models.Report, {
      foreignKey: 'reportId',
      as: 'report'
    });

    ReportExecution.belongsTo(models.ReportSchedule, {
      foreignKey: 'scheduleId',
      as: 'schedule'
    });
  };

  return ReportExecution;
};
