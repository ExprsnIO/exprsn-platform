/**
 * ═══════════════════════════════════════════════════════════
 * Git Deployment Environment Model
 * Represents deployment environments (staging, production, etc.)
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const GitDeploymentEnvironment = sequelize.define('GitDeploymentEnvironment', {
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
      notEmpty: true,
      isIn: [['development', 'staging', 'production', 'testing', 'qa', 'custom']]
    }
  },
  displayName: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'display_name'
  },
  url: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isUrl: true
    }
  },
  protectedBranches: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    field: 'protected_branches'
  },
  requireApproval: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'require_approval'
  },
  approvers: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    defaultValue: []
  },
  deploymentTargetId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'deployment_target_id'
  },
  autoDeployBranch: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'auto_deploy_branch'
  },
  variables: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by'
  }
  }, {
  tableName: 'git_deployment_environments',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['repository_id'] },
    { fields: ['deployment_target_id'] }
  ]
  });

  return GitDeploymentEnvironment;
};
