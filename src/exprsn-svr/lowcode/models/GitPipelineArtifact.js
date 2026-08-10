/**
 * ═══════════════════════════════════════════════════════════
 * Git Pipeline Artifact Model
 * Represents build artifacts from pipeline runs
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const GitPipelineArtifact = sequelize.define('GitPipelineArtifact', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  pipelineRunId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'pipeline_run_id'
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  artifactType: {
    type: DataTypes.ENUM('archive', 'image', 'package', 'report', 'log'),
    defaultValue: 'archive',
    field: 'artifact_type'
  },
  storagePath: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'storage_path'
  },
  size: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0
  },
  mimeType: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'mime_type'
  },
  checksum: {
    type: DataTypes.STRING,
    allowNull: true
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'expires_at'
  },
  downloadCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'download_count'
  }
  }, {
  tableName: 'git_pipeline_artifacts',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['pipeline_run_id'] },
    { fields: ['artifact_type'] },
    { fields: ['expires_at'] }
  ]
  });

  return GitPipelineArtifact;
};
