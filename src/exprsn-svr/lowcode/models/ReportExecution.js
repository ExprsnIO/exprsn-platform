/**
 * ReportExecution Model - Report Execution History and Results
 * Tracks report execution history with cached results
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ReportExecution = sequelize.define('ReportExecution', {
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

    scheduleId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'report_schedules',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      comment: 'NULL if manually executed, populated if scheduled'
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

    executedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'User who triggered the execution (NULL for scheduled)'
    },

    // Execution Details
    executionType: {
      type: DataTypes.ENUM('manual', 'scheduled', 'api'),
      defaultValue: 'manual',
      allowNull: false
    },

    status: {
      type: DataTypes.ENUM('pending', 'running', 'completed', 'failed', 'cancelled'),
      defaultValue: 'pending',
      allowNull: false
    },

    // Timing
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },

    completedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },

    executionTime: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Execution time in milliseconds'
    },

    // Query & Parameters
    executedQuery: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'The actual SQL query that was executed'
    },

    queryParameters: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      comment: 'Parameter values used for this execution'
    },

    // Results
    resultCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Number of rows returned'
    },

    resultData: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Cached result data (limited by size)'
    },

    resultMetadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Metadata about results (column types, aggregations, etc.)'
    },

    // Export Information
    exportFormat: {
      type: DataTypes.ENUM('pdf', 'excel', 'csv', 'json', 'html'),
      allowNull: true
    },

    exportPath: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'File path or URL to exported file'
    },

    exportSize: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Size of exported file in bytes'
    },

    // Error Handling
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    errorStack: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    // Resource Usage
    memoryUsage: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Peak memory usage in MB'
    },

    cpuTime: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'CPU time in milliseconds'
    },

    // Cache Control
    isCached: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
      comment: 'Whether this result is being used as cache'
    },

    cacheExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When cached result expires'
    },

    // Delivery Status (for scheduled reports)
    deliveryStatus: {
      type: DataTypes.ENUM('pending', 'delivered', 'failed', 'not_applicable'),
      defaultValue: 'not_applicable',
      allowNull: false
    },

    deliveryError: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'report_executions',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['report_id']
      },
      {
        fields: ['schedule_id']
      },
      {
        fields: ['application_id']
      },
      {
        fields: ['executed_by']
      },
      {
        fields: ['status']
      },
      {
        fields: ['execution_type']
      },
      {
        fields: ['started_at']
      },
      {
        fields: ['completed_at']
      },
      {
        fields: ['is_cached', 'cache_expires_at']
      },
      {
        using: 'gin',
        fields: ['result_data']
      }
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

    ReportExecution.belongsTo(models.Application, {
      foreignKey: 'applicationId',
      as: 'application'
    });
  };

  // Instance methods
  ReportExecution.prototype.start = async function() {
    this.status = 'running';
    this.startedAt = new Date();
    return await this.save();
  };

  ReportExecution.prototype.complete = async function(resultData, resultMetadata) {
    this.status = 'completed';
    this.completedAt = new Date();
    this.executionTime = this.completedAt - this.startedAt;
    this.resultData = resultData;
    this.resultMetadata = resultMetadata;
    this.resultCount = Array.isArray(resultData) ? resultData.length : 0;
    return await this.save();
  };

  ReportExecution.prototype.fail = async function(errorMessage, errorStack = null) {
    this.status = 'failed';
    this.completedAt = new Date();
    this.executionTime = this.completedAt - this.startedAt;
    this.errorMessage = errorMessage;
    this.errorStack = errorStack;
    return await this.save();
  };

  ReportExecution.prototype.cancel = async function() {
    this.status = 'cancelled';
    this.completedAt = new Date();
    if (this.startedAt) {
      this.executionTime = this.completedAt - this.startedAt;
    }
    return await this.save();
  };

  ReportExecution.prototype.markDelivered = async function() {
    this.deliveryStatus = 'delivered';
    this.deliveredAt = new Date();
    return await this.save();
  };

  ReportExecution.prototype.markDeliveryFailed = async function(error) {
    this.deliveryStatus = 'failed';
    this.deliveryError = error;
    return await this.save();
  };

  return ReportExecution;
};
