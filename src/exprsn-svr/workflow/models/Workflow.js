const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Workflow = sequelize.define('Workflow', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
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
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('draft', 'active', 'inactive', 'archived'),
    defaultValue: 'draft',
    allowNull: false
  },
  trigger_type: {
    type: DataTypes.ENUM('manual', 'scheduled', 'webhook', 'event', 'api'),
    defaultValue: 'manual',
    allowNull: false
  },
  trigger_config: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Configuration for trigger (cron schedule, webhook URL, event filters, etc.)'
  },
  definition: {
    type: DataTypes.JSONB,
    allowNull: false,
    comment: 'Complete workflow definition with steps, conditions, and connections'
  },
  variables: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Workflow-level variables and their default values'
  },
  permissions: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'RBAC permissions for workflow access (view, execute, edit, delete)'
  },
  jsonlex_schema: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'JSONLex schema for input validation'
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: []
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  owner_id: {
    type: DataTypes.UUID,
    allowNull: false,
    comment: 'User ID of workflow owner'
  },
  is_template: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  },
  template_category: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  execution_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  success_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  failure_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  average_duration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Average execution duration in milliseconds'
  },
  last_executed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  settings: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {
      maxExecutionTime: 300000,
      maxSteps: 100,
      maxIterations: 1000,
      enableLogging: true,
      notifyOnFailure: false,
      notifyOnSuccess: false
    }
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  }
}, {
  tableName: 'workflows',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['owner_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['trigger_type']
    },
    {
      fields: ['is_template']
    },
    {
      fields: ['category']
    },
    {
      fields: ['tags'],
      using: 'gin'
    },
    {
      fields: ['created_at']
    }
  ]
});

module.exports = Workflow;
