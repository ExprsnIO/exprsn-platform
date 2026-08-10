const Workflow = require('./Workflow');
const WorkflowStep = require('./WorkflowStep');
const WorkflowExecution = require('./WorkflowExecution');
const WorkflowLog = require('./WorkflowLog');
const WorkflowFavorite = require('./WorkflowFavorite');

// Define relationships

// Workflow -> WorkflowStep (one-to-many)
Workflow.hasMany(WorkflowStep, {
  foreignKey: 'workflow_id',
  as: 'steps',
  onDelete: 'CASCADE'
});
WorkflowStep.belongsTo(Workflow, {
  foreignKey: 'workflow_id',
  as: 'workflow'
});

// Workflow -> WorkflowExecution (one-to-many)
Workflow.hasMany(WorkflowExecution, {
  foreignKey: 'workflow_id',
  as: 'executions',
  onDelete: 'CASCADE'
});
WorkflowExecution.belongsTo(Workflow, {
  foreignKey: 'workflow_id',
  as: 'workflow'
});

// WorkflowExecution -> WorkflowExecution (parent-child for subworkflows)
WorkflowExecution.hasMany(WorkflowExecution, {
  foreignKey: 'parent_execution_id',
  as: 'subexecutions',
  onDelete: 'CASCADE'
});
WorkflowExecution.belongsTo(WorkflowExecution, {
  foreignKey: 'parent_execution_id',
  as: 'parent_execution'
});

// WorkflowExecution -> WorkflowLog (one-to-many)
WorkflowExecution.hasMany(WorkflowLog, {
  foreignKey: 'execution_id',
  as: 'logs',
  onDelete: 'CASCADE'
});
WorkflowLog.belongsTo(WorkflowExecution, {
  foreignKey: 'execution_id',
  as: 'execution'
});

// Workflow -> WorkflowLog (one-to-many)
Workflow.hasMany(WorkflowLog, {
  foreignKey: 'workflow_id',
  as: 'logs',
  onDelete: 'CASCADE'
});
WorkflowLog.belongsTo(Workflow, {
  foreignKey: 'workflow_id',
  as: 'workflow'
});

// Workflow -> WorkflowFavorite (one-to-many)
Workflow.hasMany(WorkflowFavorite, {
  foreignKey: 'workflow_id',
  as: 'favorites',
  onDelete: 'CASCADE'
});
WorkflowFavorite.belongsTo(Workflow, {
  foreignKey: 'workflow_id',
  as: 'workflow'
});

module.exports = {
  Workflow,
  WorkflowStep,
  WorkflowExecution,
  WorkflowLog,
  WorkflowFavorite
};
