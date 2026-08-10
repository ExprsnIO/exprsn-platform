const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const WorkflowLog = sequelize.define('WorkflowLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  execution_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'workflow_executions',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  workflow_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'workflows',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  step_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Step ID if log is related to a specific step'
  },
  level: {
    type: DataTypes.ENUM('debug', 'info', 'warn', 'error'),
    defaultValue: 'info',
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  data: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Additional structured data'
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Duration in milliseconds (for step execution logs)'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  }
}, {
  tableName: 'workflow_logs',
  timestamps: false,
  underscored: true,
  indexes: [
    {
      fields: ['execution_id']
    },
    {
      fields: ['workflow_id']
    },
    {
      fields: ['step_id']
    },
    {
      fields: ['level']
    },
    {
      fields: ['timestamp']
    }
  ]
});

module.exports = WorkflowLog;
