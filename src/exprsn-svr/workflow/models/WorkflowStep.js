const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const WorkflowStep = sequelize.define('WorkflowStep', {
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
  step_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Unique identifier within the workflow (e.g., step_1, condition_2)'
  },
  step_type: {
    type: DataTypes.ENUM(
      'action',
      'condition',
      'loop',
      'parallel',
      'switch',
      'trigger',
      'javascript',
      'api_call',
      'data_transform',
      'wait',
      'approval',
      'notification',
      'subworkflow'
    ),
    allowNull: false
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  comment: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'User-added notes and documentation for this step'
  },
  position: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Visual position in designer {x: number, y: number}'
  },
  config: {
    type: DataTypes.JSONB,
    allowNull: false,
    comment: 'Step-specific configuration'
  },
  inputs: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Input field mappings and values'
  },
  outputs: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Output field mappings'
  },
  conditions: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Condition expressions for branching'
  },
  next_steps: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Next step IDs based on conditions or outcomes'
  },
  error_handler: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Error handling configuration (retry, fallback, skip)'
  },
  timeout: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Step timeout in milliseconds'
  },
  retry_config: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {
      maxRetries: 0,
      retryDelay: 1000,
      backoffMultiplier: 2
    }
  },
  flags: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Custom flags for step behavior'
  },
  order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Execution order for sequential steps'
  },
  is_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
  }
}, {
  tableName: 'workflow_steps',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['workflow_id']
    },
    {
      fields: ['workflow_id', 'step_id'],
      unique: true
    },
    {
      fields: ['step_type']
    },
    {
      fields: ['order']
    }
  ]
});

module.exports = WorkflowStep;
