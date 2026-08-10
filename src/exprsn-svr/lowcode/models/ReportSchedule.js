/**
 * ReportSchedule Model - Automated Report Scheduling
 * Stores scheduled report configurations for automated delivery
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ReportSchedule = sequelize.define('ReportSchedule', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    // Foreign Keys
    reportId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'reports',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },

    applicationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'applications',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },

    createdBy: {
      type: DataTypes.UUID,
      allowNull: true
    },

    // Schedule Configuration
    displayName: {
      type: DataTypes.STRING,
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

    // Status
    enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false
    },

    // Cron Expression (for flexible scheduling)
    cronExpression: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Cron expression for schedule (e.g., "0 9 * * MON-FRI" for weekdays at 9am)'
    },

    // Human-readable schedule
    scheduleDescription: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Human-readable description (e.g., "Every weekday at 9:00 AM")'
    },

    // Timezone
    timezone: {
      type: DataTypes.STRING(50),
      defaultValue: 'UTC',
      allowNull: false,
      comment: 'Timezone for schedule execution (e.g., "America/New_York")'
    },

    // Delivery Configuration
    deliveryMethod: {
      type: DataTypes.ENUM('email', 'webhook', 'storage', 'dashboard'),
      defaultValue: 'email',
      allowNull: false,
      comment: 'How to deliver the report'
    },

    deliveryConfig: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      comment: 'Delivery-specific configuration (email addresses, webhook URLs, storage paths, etc.)'
    },

    // Export Format
    exportFormat: {
      type: DataTypes.ENUM('pdf', 'excel', 'csv', 'json', 'html'),
      defaultValue: 'pdf',
      allowNull: false,
      comment: 'Format for exported report'
    },

    // Report Parameters (for dynamic execution)
    parameterValues: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      comment: 'Default parameter values for scheduled execution'
    },

    // Execution Tracking
    lastExecutedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },

    nextExecutionAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Calculated next execution time'
    },

    executionCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    },

    lastExecutionStatus: {
      type: DataTypes.ENUM('success', 'failed', 'pending'),
      allowNull: true
    },

    lastExecutionError: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    // Retention Policy
    retentionDays: {
      type: DataTypes.INTEGER,
      defaultValue: 30,
      allowNull: false,
      comment: 'How many days to keep execution history'
    },

    // Notification Settings
    notifyOnSuccess: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },

    notifyOnFailure: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false
    },

    notificationRecipients: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: [],
      comment: 'Email addresses for notifications'
    }
  }, {
    tableName: 'report_schedules',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['report_id']
      },
      {
        fields: ['application_id']
      },
      {
        fields: ['enabled']
      },
      {
        fields: ['next_execution_at']
      },
      {
        fields: ['created_by']
      },
      {
        fields: ['created_at']
      },
      {
        using: 'gin',
        fields: ['delivery_config']
      }
    ]
  });

  ReportSchedule.associate = (models) => {
    ReportSchedule.belongsTo(models.Report, {
      foreignKey: 'reportId',
      as: 'report'
    });

    ReportSchedule.belongsTo(models.Application, {
      foreignKey: 'applicationId',
      as: 'application'
    });

    ReportSchedule.hasMany(models.ReportExecution, {
      foreignKey: 'scheduleId',
      as: 'executions',
      onDelete: 'CASCADE'
    });
  };

  // Instance methods
  ReportSchedule.prototype.updateExecutionStatus = async function(status, error = null) {
    this.lastExecutedAt = new Date();
    this.lastExecutionStatus = status;
    this.lastExecutionError = error;
    this.executionCount += 1;
    return await this.save();
  };

  ReportSchedule.prototype.disable = async function() {
    this.enabled = false;
    return await this.save();
  };

  ReportSchedule.prototype.enable = async function() {
    this.enabled = true;
    return await this.save();
  };

  return ReportSchedule;
};
