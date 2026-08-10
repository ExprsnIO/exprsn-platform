/**
 * ═══════════════════════════════════════════════════════════
 * Git Repository Policy Model
 * Represents branch protection and merge policies
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const GitRepositoryPolicy = sequelize.define('GitRepositoryPolicy', {
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
  branchPattern: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'main',
    field: 'branch_pattern'
  },
  requireApprovals: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    field: 'require_approvals'
  },
  requireCodeOwnerReview: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'require_code_owner_review'
  },
  requireStatusChecks: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'require_status_checks'
  },
  requiredStatusChecks: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    field: 'required_status_checks'
  },
  allowForcePush: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'allow_force_push'
  },
  allowDeletions: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'allow_deletions'
  },
  requireLinearHistory: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'require_linear_history'
  },
  mergeMethod: {
    type: DataTypes.ENUM('merge', 'squash', 'rebase'),
    defaultValue: 'merge',
    field: 'merge_method'
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by'
  }
  }, {
  tableName: 'git_repository_policies',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['repository_id'] },
    { fields: ['repository_id', 'branch_pattern'] }
  ]
  });

  return GitRepositoryPolicy;
};
