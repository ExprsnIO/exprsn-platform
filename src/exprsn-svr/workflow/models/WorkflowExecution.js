const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const WorkflowExecution = sequelize.define('WorkflowExecution', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
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
  workflow_version: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Snapshot of workflow version at execution time'
  },
  status: {
    type: DataTypes.ENUM('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout'),
    defaultValue: 'pending',
    allowNull: false
  },
  trigger_type: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  trigger_data: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Data that triggered the execution'
  },
  input_data: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Input parameters for the workflow'
  },
  output_data: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Output data from the workflow'
  },
  context: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Execution context including variables and state'
  },
  current_step_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Currently executing step ID'
  },
  completed_steps: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    allowNull: false,
    comment: 'List of completed step IDs'
  },
  failed_steps: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    allowNull: false,
    comment: 'List of failed step IDs'
  },
  step_results: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Results from each step execution'
  },
  error: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Error information if execution failed'
  },
  started_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Execution duration in milliseconds'
  },
  initiated_by: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'User ID who initiated the execution'
  },
  parent_execution_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'workflow_executions',
      key: 'id'
    },
    comment: 'Parent execution ID for subworkflows'
  },
  retry_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 5,
    allowNull: false,
    comment: 'Execution priority (1-10, higher is more important)'
  },
  flags: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Custom execution flags'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  },
  labels: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: [],
    comment: 'Custom labels for categorization and filtering'
  }
}, {
  tableName: 'workflow_executions',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['workflow_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['initiated_by']
    },
    {
      fields: ['parent_execution_id']
    },
    {
      fields: ['started_at']
    },
    {
      fields: ['completed_at']
    },
    {
      fields: ['priority']
    },
    {
      fields: ['created_at']
    }
  ]
});

module.exports = WorkflowExecution;
