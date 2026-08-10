/**
 * ═══════════════════════════════════════════════════════════
 * Git Pipeline Cache Model
 * Represents cached data for pipeline optimization
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const GitPipelineCache = sequelize.define('GitPipelineCache', {
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
  key: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  scope: {
    type: DataTypes.ENUM('global', 'branch', 'tag', 'commit'),
    defaultValue: 'branch'
  },
  scopeValue: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'scope_value'
  },
  storagePath: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'storage_path'
  },
  size: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  checksum: {
    type: DataTypes.STRING,
    allowNull: true
  },
  lastAccessedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'last_accessed_at'
  },
  accessCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'access_count'
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'expires_at'
  }
  }, {
  tableName: 'git_pipeline_cache',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['repository_id', 'key', 'scope', 'scope_value'], unique: true },
    { fields: ['last_accessed_at'] },
    { fields: ['expires_at'] }
  ]
  });

  return GitPipelineCache;
};
