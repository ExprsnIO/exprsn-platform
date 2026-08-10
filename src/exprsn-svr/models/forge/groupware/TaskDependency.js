const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const TaskDependency = sequelize.define('TaskDependency', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  taskId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'task_id',
    comment: 'The dependent task'
  },
  dependsOnTaskId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'depends_on_task_id',
    comment: 'The task that must be completed first'
  },
  dependencyType: {
    type: DataTypes.ENUM('finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish'),
    allowNull: false,
    defaultValue: 'finish_to_start',
    field: 'dependency_type',
    comment: 'FS: predecessor must finish before successor starts, SS: both start together, FF: both finish together, SF: successor must finish before predecessor starts'
  },
  lagDays: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'lag_days',
    comment: 'Delay between tasks (can be negative for lead time)'
  },
  // Status tracking
  isBlocking: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_blocking',
    comment: 'If true, dependent task cannot start until dependency is met'
  },
  isCriticalPath: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_critical_path',
    comment: 'Part of the critical path'
  },
  status: {
    type: DataTypes.ENUM('active', 'met', 'violated', 'cancelled'),
    allowNull: false,
    defaultValue: 'active'
  },
  metAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'met_at',
    comment: 'When the dependency was satisfied'
  },
  violatedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'violated_at',
    comment: 'When the dependency was violated'
  },
  // Workflow integration
  onMetWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_met_workflow_id',
    comment: 'Workflow to trigger when dependency is met'
  },
  onViolatedWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_violated_workflow_id',
    comment: 'Workflow to trigger when dependency is violated'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'created_at'
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'updated_at'
  }
}, {
  tableName: 'task_dependencies',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['task_id']
    },
    {
      fields: ['depends_on_task_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['is_critical_path']
    },
    {
      fields: ['task_id', 'depends_on_task_id'],
      unique: true
    }
  ]
});

module.exports = TaskDependency;
