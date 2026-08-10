/**
 * ═══════════════════════════════════════════════════════════
 * Git Pipeline Model
 * Represents CI/CD pipeline definitions
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const GitPipeline = sequelize.define('GitPipeline', {
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
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  triggerOn: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: ['push', 'pull_request'],
    field: 'trigger_on'
  },
  branches: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: ['*']
  },
  // Workflow integration
  workflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'workflow_id'
  },
  // Pipeline definition
  stages: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  environmentVariables: {
    type: DataTypes.JSONB,
    defaultValue: {},
    field: 'environment_variables'
  },
  timeoutMinutes: {
    type: DataTypes.INTEGER,
    defaultValue: 60,
    field: 'timeout_minutes'
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by'
  }
  }, {
  tableName: 'git_pipelines',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['repository_id'] },
    { fields: ['workflow_id'] }
  ]
  });

  return GitPipeline;
  };
