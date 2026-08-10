/**
 * ═══════════════════════════════════════════════════════════
 * Git Pull Request Model
 * Represents pull requests with CI/CD integration
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const GitPullRequest = sequelize.define('GitPullRequest', {
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
    type: DataTypes.ENUM('open', 'closed', 'merged', 'draft'),
    defaultValue: 'open',
    allowNull: false
  },
  sourceBranch: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'source_branch'
  },
  targetBranch: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'target_branch'
  },
  headSha: {
    type: DataTypes.STRING(40),
    allowNull: false,
    field: 'head_sha'
  },
  baseSha: {
    type: DataTypes.STRING(40),
    allowNull: false,
    field: 'base_sha'
  },
  mergeCommitSha: {
    type: DataTypes.STRING(40),
    allowNull: true,
    field: 'merge_commit_sha'
  },
  mergeable: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  conflicts: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  labels: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  assignees: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    defaultValue: []
  },
  reviewers: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    defaultValue: []
  },
  // CI/CD integration
  ciStatus: {
    type: DataTypes.ENUM('pending', 'running', 'success', 'failure', 'cancelled'),
    defaultValue: 'pending',
    field: 'ci_status'
  },
  ciPipelineId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'ci_pipeline_id'
  },
  // Review status
  reviewStatus: {
    type: DataTypes.ENUM('pending', 'approved', 'changes_requested', 'commented'),
    defaultValue: 'pending',
    field: 'review_status'
  },
  approvalsCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'approvals_count'
  },
  changesRequestedCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'changes_requested_count'
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by'
  },
  mergedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'merged_by'
  },
  mergedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'merged_at'
  },
  closedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'closed_at'
  }
  }, {
  tableName: 'git_pull_requests',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['repository_id', 'number'], unique: true },
    { fields: ['state'] },
    { fields: ['created_by'] },
    { fields: ['ci_pipeline_id'] }
  ]
  });

  return GitPullRequest;
  };
