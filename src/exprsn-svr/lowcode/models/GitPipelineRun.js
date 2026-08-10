/**
 * ═══════════════════════════════════════════════════════════
 * Git Pipeline Run Model
 * Represents individual pipeline executions
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const GitPipelineRun = sequelize.define('GitPipelineRun', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  pipelineId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'pipeline_id'
  },
  repositoryId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'repository_id'
  },
  runNumber: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'run_number'
  },
  status: {
    type: DataTypes.ENUM('pending', 'running', 'success', 'failure', 'cancelled', 'skipped'),
    defaultValue: 'pending',
    allowNull: false
  },
  trigger: {
    type: DataTypes.ENUM('push', 'pull_request', 'manual', 'webhook', 'schedule'),
    allowNull: false
  },
  branch: {
    type: DataTypes.STRING,
    allowNull: false
  },
  commitSha: {
    type: DataTypes.STRING(40),
    allowNull: false,
    field: 'commit_sha'
  },
  prId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'pr_id'
  },
  stagesStatus: {
    type: DataTypes.JSONB,
    defaultValue: {},
    field: 'stages_status'
  },
  startedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'started_by'
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'started_at'
  },
  finishedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'finished_at'
  },
  durationSeconds: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'duration_seconds'
  }
  }, {
  tableName: 'git_pipeline_runs',
  underscored: true,
  timestamps: true,
  updatedAt: false,
  indexes: [
    { fields: ['pipeline_id'] },
    { fields: ['repository_id', 'run_number'] },
    { fields: ['status'] },
    { fields: ['pr_id'] }
  ]
  });

  return GitPipelineRun;
  };
