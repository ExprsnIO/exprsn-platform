/**
 * Report Model
 * Defines custom reports that can be generated, scheduled, and shared
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Report = sequelize.define('Report', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    reportType: {
      type: DataTypes.ENUM(
        'crm_contacts',
        'crm_leads',
        'crm_opportunities',
        'crm_activities',
        'crm_campaigns',
        'crm_tickets',
        'erp_financial',
        'erp_inventory',
        'erp_sales',
        'erp_hr',
        'erp_assets',
        'groupware_tasks',
        'groupware_time_tracking',
        'groupware_projects',
        'custom'
      ),
      allowNull: false
    },

    category: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'custom'
    },

    // Who owns this report
    ownerId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'owner_id'
    },

    // Visibility settings
    visibility: {
      type: DataTypes.ENUM('private', 'team', 'organization', 'public'),
      defaultValue: 'private'
    },

    // Report configuration
    config: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      comment: 'Report configuration including filters, grouping, sorting, etc.'
    },

    // Chart/visualization configuration
    visualization: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Chart type, colors, axes configuration'
    },

    // SQL query for custom reports (dangerous - needs sanitization)
    customQuery: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'custom_query',
      comment: 'Custom SQL query for advanced reports (admin only)'
    },

    // Report status
    status: {
      type: DataTypes.ENUM('draft', 'active', 'archived'),
      defaultValue: 'draft'
    },

    // Execution settings
    timeoutSeconds: {
      type: DataTypes.INTEGER,
      defaultValue: 60,
      field: 'timeout_seconds',
      validate: {
        min: 1,
        max: 600 // Max 10 minutes
      }
    },

    // Caching settings
    cacheDurationMinutes: {
      type: DataTypes.INTEGER,
      defaultValue: 15,
      field: 'cache_duration_minutes',
      validate: {
        min: 0,
        max: 1440 // Max 24 hours
      }
    },

    // Statistics
    executionCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'execution_count'
    },

    lastExecutedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_executed_at'
    },

    lastExecutionDurationMs: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'last_execution_duration_ms'
    },

    avgExecutionDurationMs: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'avg_execution_duration_ms'
    },

    // Sharing and permissions
    sharedWith: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      defaultValue: [],
      field: 'shared_with',
      comment: 'User IDs who have access to this report'
    },

    // Metadata
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: []
    },

    isFavorite: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_favorite'
    },

    isTemplate: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_template'
    },

    // Parent template if created from template
    templateId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'template_id'
    }

  }, {
    tableName: 'reports',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['owner_id'] },
      { fields: ['report_type'] },
      { fields: ['category'] },
      { fields: ['status'] },
      { fields: ['visibility'] },
      { fields: ['is_template'] },
      { fields: ['created_at'] }
    ]
  });

  Report.associate = (models) => {
    // Report schedules
    Report.hasMany(models.ReportSchedule, {
      foreignKey: 'reportId',
      as: 'schedules'
    });

    // Report executions/history
    Report.hasMany(models.ReportExecution, {
      foreignKey: 'reportId',
      as: 'executions'
    });
  };

  return Report;
};
