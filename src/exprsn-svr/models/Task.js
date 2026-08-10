const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Task extends Model {
    static associate(models) {
      // Associations
      Task.belongsTo(models.Project, { foreignKey: 'project_id', as: 'project' });
      Task.belongsTo(models.TaskType, { foreignKey: 'task_type_id', as: 'taskType' });
      Task.belongsTo(models.Task, { foreignKey: 'parent_task_id', as: 'parentTask' });
      Task.hasMany(models.Task, { foreignKey: 'parent_task_id', as: 'subtasks' });
      Task.belongsTo(models.Sprint, { foreignKey: 'sprint_id', as: 'sprint' });
      Task.belongsTo(models.Employee, { foreignKey: 'assignee_id', as: 'assignee' });
      Task.belongsTo(models.Employee, { foreignKey: 'reporter_id', as: 'reporter' });
      Task.belongsTo(models.BoardColumn, { foreignKey: 'board_column_id', as: 'boardColumn' });
      
      // Relations
      Task.hasMany(models.TimeEntry, { foreignKey: 'task_id', as: 'timeEntries' });
      Task.hasMany(models.TaskComment, { foreignKey: 'task_id', as: 'comments' });
      Task.hasMany(models.TaskHistory, { foreignKey: 'task_id', as: 'history' });
      Task.hasMany(models.TaskAgentAnalysis, { foreignKey: 'task_id', as: 'agentAnalysis' });
      Task.hasMany(models.TaskAgentComment, { foreignKey: 'task_id', as: 'agentComments' });
      Task.hasMany(models.TaskAssignmentSuggestion, { foreignKey: 'task_id', as: 'assignmentSuggestions' });
      
      // Dependencies
      Task.hasMany(models.TaskDependency, { foreignKey: 'task_id', as: 'dependencies' });
      Task.hasMany(models.TaskDependency, { foreignKey: 'depends_on_task_id', as: 'blockedBy' });
    }
  }

  Task.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    taskNumber: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      field: 'task_number'
    },
    projectId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'project_id'
    },
    taskTypeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'task_type_id'
    },
    parentTaskId: {
      type: DataTypes.UUID,
      field: 'parent_task_id'
    },
    sprintId: {
      type: DataTypes.UUID,
      field: 'sprint_id'
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT
    },
    acceptanceCriteria: {
      type: DataTypes.TEXT,
      field: 'acceptance_criteria'
    },
    status: {
      type: DataTypes.ENUM('backlog', 'todo', 'in_progress', 'in_review', 'testing', 'done', 'closed', 'cancelled'),
      defaultValue: 'backlog'
    },
    priority: {
      type: DataTypes.ENUM('lowest', 'low', 'medium', 'high', 'highest', 'critical'),
      defaultValue: 'medium'
    },
    severity: {
      type: DataTypes.ENUM('trivial', 'minor', 'major', 'critical', 'blocker')
    },
    storyPoints: {
      type: DataTypes.INTEGER,
      field: 'story_points'
    },
    estimatedHours: {
      type: DataTypes.DECIMAL(10, 2),
      field: 'estimated_hours'
    },
    actualHours: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      field: 'actual_hours'
    },
    remainingHours: {
      type: DataTypes.DECIMAL(10, 2),
      field: 'remaining_hours'
    },
    dueDate: {
      type: DataTypes.DATE,
      field: 'due_date'
    },
    startDate: {
      type: DataTypes.DATE,
      field: 'start_date'
    },
    completedDate: {
      type: DataTypes.DATE,
      field: 'completed_date'
    },
    assigneeId: {
      type: DataTypes.UUID,
      field: 'assignee_id'
    },
    reporterId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'reporter_id'
    },
    boardColumnId: {
      type: DataTypes.UUID,
      field: 'board_column_id'
    },
    columnPosition: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'column_position'
    },
    isBillable: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_billable'
    },
    billableRate: {
      type: DataTypes.DECIMAL(10, 2),
      field: 'billable_rate'
    },
    environment: {
      type: DataTypes.ENUM('production', 'staging', 'development', 'testing', 'other')
    },
    affectedVersion: {
      type: DataTypes.STRING(50),
      field: 'affected_version'
    },
    fixedVersion: {
      type: DataTypes.STRING(50),
      field: 'fixed_version'
    },
    resolution: {
      type: DataTypes.ENUM('fixed', 'wont_fix', 'duplicate', 'cannot_reproduce', 'works_as_designed', 'deferred')
    },
    labels: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: []
    },
    watchers: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      defaultValue: []
    },
    attachments: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    customFields: {
      type: DataTypes.JSONB,
      defaultValue: {},
      field: 'custom_fields'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    sequelize,
    modelName: 'Task',
    tableName: 'tasks',
    underscored: true,
    timestamps: true
  });

  return Task;
};
