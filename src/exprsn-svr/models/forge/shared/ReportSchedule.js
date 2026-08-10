/**
 * Report Schedule Model
 * Defines automated report execution schedules
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ReportSchedule = sequelize.define('ReportSchedule', {
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

    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },

    // Schedule configuration
    frequency: {
      type: DataTypes.ENUM('once', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'),
      allowNull: false
    },

    // Cron expression for custom schedules
    cronExpression: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'cron_expression',
      comment: 'Cron expression for custom frequency (e.g., "0 9 * * 1-5" for weekdays at 9am)'
    },

    // When to run
    runAt: {
      type: DataTypes.TIME,
      allowNull: true,
      field: 'run_at',
      comment: 'Time of day to run (HH:MM:SS)'
    },

    // Day of week for weekly schedules (0-6, Sunday = 0)
    dayOfWeek: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'day_of_week',
      validate: {
        min: 0,
        max: 6
      }
    },

    // Day of month for monthly schedules (1-31)
    dayOfMonth: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'day_of_month',
      validate: {
        min: 1,
        max: 31
      }
    },

    // Timezone for schedule
    timezone: {
      type: DataTypes.STRING(100),
      defaultValue: 'UTC'
    },

    // Schedule active period
    startDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'start_date'
    },

    endDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'end_date'
    },

    // Status
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active'
    },

    // Export settings
    exportFormat: {
      type: DataTypes.ENUM('pdf', 'excel', 'csv', 'json'),
      defaultValue: 'pdf',
      field: 'export_format'
    },

    // Delivery settings
    deliveryMethod: {
      type: DataTypes.ENUM('email', 'download', 'storage', 'webhook'),
      defaultValue: 'email',
      field: 'delivery_method'
    },

    // Email recipients (for email delivery)
    recipients: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: []
    },

    // Storage path (for storage delivery)
    storagePath: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'storage_path'
    },

    // Webhook URL (for webhook delivery)
    webhookUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'webhook_url'
    },

    // Report parameters (can override report defaults)
    parameters: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Parameters to pass to report (date ranges, filters, etc.)'
    },

    // Execution tracking
    lastRunAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_run_at'
    },

    nextRunAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'next_run_at'
    },

    executionCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'execution_count'
    },

    failureCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'failure_count'
    },

    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'last_error'
    },

    // Created by
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'created_by'
    }

  }, {
    tableName: 'report_schedules',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['report_id'] },
      { fields: ['is_active'] },
      { fields: ['next_run_at'] },
      { fields: ['frequency'] },
      { fields: ['created_by'] }
    ]
  });

  ReportSchedule.associate = (models) => {
    ReportSchedule.belongsTo(models.Report, {
      foreignKey: 'reportId',
      as: 'report'
    });

    ReportSchedule.hasMany(models.ReportExecution, {
      foreignKey: 'scheduleId',
      as: 'executions'
    });
  };

  return ReportSchedule;
};
