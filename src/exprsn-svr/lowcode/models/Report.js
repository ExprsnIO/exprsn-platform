/**
 * Report Model - Data Query and Report Definition
 * Stores report configurations including SQL queries, filters, aggregations
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Report = sequelize.define('Report', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    // Basic Information
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

    // Foreign Keys
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

    modifiedBy: {
      type: DataTypes.UUID,
      allowNull: true
    },

    // Report Type
    reportType: {
      type: DataTypes.ENUM('table', 'chart', 'pivot', 'kpi', 'custom'),
      defaultValue: 'table',
      allowNull: false,
      comment: 'Type of report output'
    },

    // Status
    status: {
      type: DataTypes.ENUM('draft', 'published', 'archived'),
      defaultValue: 'draft',
      allowNull: false
    },

    // Data Source
    dataSourceId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'data_sources',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      comment: 'Optional reference to data source (can use application default)'
    },

    // Query Configuration
    queryConfig: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      comment: 'Query builder configuration: entities, fields, joins, filters, aggregations'
    },

    // Raw SQL (optional, for advanced users)
    rawSql: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Optional raw SQL for advanced reports (overrides queryConfig)'
    },

    // Parameters
    parameters: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      comment: 'Report parameters for dynamic filtering (e.g., date ranges, user inputs)'
    },

    // Visualization Config
    visualizationConfig: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      comment: 'Chart/table display settings (chart type, colors, legends, etc.)'
    },

    // Scheduling & Execution
    cacheEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
      comment: 'Whether to cache report results'
    },

    cacheTTL: {
      type: DataTypes.INTEGER,
      defaultValue: 300,
      allowNull: false,
      comment: 'Cache time-to-live in seconds'
    },

    executionTimeout: {
      type: DataTypes.INTEGER,
      defaultValue: 30,
      allowNull: false,
      comment: 'Query execution timeout in seconds'
    },

    // Performance Metrics
    avgExecutionTime: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Average execution time in milliseconds'
    },

    lastExecutedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },

    executionCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    },

    // Metadata
    version: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      allowNull: false
    },

    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: [],
      comment: 'Tags for categorization and search'
    },

    category: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Report category (e.g., Sales, Finance, Operations)'
    }
  }, {
    tableName: 'reports',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['application_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['created_by']
      },
      {
        fields: ['report_type']
      },
      {
        fields: ['category']
      },
      {
        fields: ['created_at']
      },
      {
        fields: ['last_executed_at']
      },
      {
        using: 'gin',
        fields: ['query_config']
      },
      {
        using: 'gin',
        fields: ['tags']
      }
    ]
  });

  Report.associate = (models) => {
    Report.belongsTo(models.Application, {
      foreignKey: 'applicationId',
      as: 'application'
    });

    Report.belongsTo(models.DataSource, {
      foreignKey: 'dataSourceId',
      as: 'dataSource'
    });

    Report.hasMany(models.ReportSchedule, {
      foreignKey: 'reportId',
      as: 'schedules',
      onDelete: 'CASCADE'
    });

    Report.hasMany(models.ReportExecution, {
      foreignKey: 'reportId',
      as: 'executions',
      onDelete: 'CASCADE'
    });
  };

  // Instance methods
  Report.prototype.updateExecutionStats = async function(executionTime) {
    this.executionCount += 1;
    this.lastExecutedAt = new Date();

    // Calculate rolling average
    if (this.avgExecutionTime === null) {
      this.avgExecutionTime = executionTime;
    } else {
      this.avgExecutionTime = Math.round(
        (this.avgExecutionTime * (this.executionCount - 1) + executionTime) / this.executionCount
      );
    }

    return await this.save();
  };

  Report.prototype.publish = async function() {
    this.status = 'published';
    return await this.save();
  };

  Report.prototype.archive = async function() {
    this.status = 'archived';
    return await this.save();
  };

  return Report;
};
