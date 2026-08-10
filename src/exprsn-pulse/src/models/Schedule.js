/**
 * Schedule Model
 * Defines scheduled report executions
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Schedule = sequelize.define('Schedule', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
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
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    cronExpression: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Cron expression for scheduling (e.g., "0 9 * * 1" for Monday 9am)'
    },
    timezone: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'UTC'
    },
    parameters: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Default parameter values for scheduled executions'
    },
    format: {
      type: DataTypes.ENUM('pdf', 'excel', 'csv', 'html', 'json'),
      allowNull: false,
      defaultValue: 'pdf'
    },
    recipients: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      comment: 'Array of email addresses or user IDs'
    },
    deliveryMethod: {
      type: DataTypes.ENUM('email', 'webhook', 's3', 'both'),
      allowNull: false,
      defaultValue: 'email'
    },
    webhookUrl: {
      type: DataTypes.STRING(1000),
      allowNull: true
    },
    s3Bucket: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    s3Path: {
      type: DataTypes.STRING(1000),
      allowNull: true
    },
    emailSubject: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Custom email subject (supports template variables)'
    },
    emailBody: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Custom email body (supports template variables)'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Schedule starts from this date'
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Schedule ends after this date'
    },
    lastExecutedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    nextExecutionAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    executionCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    failureCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false
    },
    updatedBy: {
      type: DataTypes.UUID,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'schedules',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['report_id'] },
      { fields: ['is_active'] },
      { fields: ['next_execution_at'] },
      { fields: ['created_by'] }
    ]
  });

  return Schedule;
};
