/**
 * ScheduleExecution Model
 * Logs each execution of a scheduled report
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ScheduleExecution = sequelize.define('ScheduleExecution', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    scheduleId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'schedules',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    status: {
      type: DataTypes.ENUM('pending', 'running', 'success', 'failed', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending'
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Execution duration in milliseconds'
    },
    parameters: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Parameter values used for this execution'
    },
    resultSize: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Size of generated report in bytes'
    },
    resultUrl: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      comment: 'URL to generated report file'
    },
    deliveryStatus: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Status of each delivery method (email sent, webhook called, etc.)'
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Error message if execution failed'
    },
    errorStack: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    logs: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Execution logs and debug information'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'schedule_executions',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['schedule_id'] },
      { fields: ['status'] },
      { fields: ['started_at'] },
      { fields: ['created_at'] }
    ]
  });

  return ScheduleExecution;
};
