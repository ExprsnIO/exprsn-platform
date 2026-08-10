/**
 * ═══════════════════════════════════════════════════════════
 * Git Issue Model
 * Represents repository issues with workflow integration
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const GitIssue = sequelize.define('GitIssue', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  repositoryId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'repository_id'
  },
  number: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 500]
    }
  },
  body: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  state: {
    type: DataTypes.ENUM('open', 'closed', 'in_progress', 'resolved', 'wont_fix'),
    defaultValue: 'open',
    allowNull: false
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
    defaultValue: 'medium'
  },
  issueType: {
    type: DataTypes.ENUM('bug', 'feature', 'enhancement', 'task', 'question', 'documentation'),
    defaultValue: 'task',
    field: 'issue_type'
  },
  labels: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  assignees: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    defaultValue: []
  },
  milestoneId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'milestone_id'
  },
  // Workflow integration
  workflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'workflow_id'
  },
  workflowInstanceId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'workflow_instance_id'
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by'
  },
  closedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'closed_by'
  },
  closedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'closed_at'
  },
  dueDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'due_date'
  }
  }, {
  tableName: 'git_issues',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['repository_id', 'number'], unique: true },
    { fields: ['state'] },
    { fields: ['created_by'] },
    { fields: ['workflow_instance_id'] }
  ]
  });

  return GitIssue;
  };
