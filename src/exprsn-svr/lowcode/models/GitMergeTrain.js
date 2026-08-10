/**
 * ═══════════════════════════════════════════════════════════
 * Git Merge Train Model
 * Represents merge train entries for sequential PR merging
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const GitMergeTrain = sequelize.define('GitMergeTrain', {
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
  pullRequestId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'pull_request_id'
  },
  targetBranch: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'target_branch'
  },
  position: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('queued', 'processing', 'merged', 'failed', 'cancelled'),
    defaultValue: 'queued'
  },
  pipelineRunId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'pipeline_run_id'
  },
  enqueuedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'enqueued_at'
  },
  mergedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'merged_at'
  },
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'error_message'
  }
  }, {
  tableName: 'git_merge_trains',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['repository_id', 'target_branch'] },
    { fields: ['pull_request_id'] },
    { fields: ['status'] },
    { fields: ['repository_id', 'target_branch', 'position'] }
  ]
  });

  return GitMergeTrain;
};
