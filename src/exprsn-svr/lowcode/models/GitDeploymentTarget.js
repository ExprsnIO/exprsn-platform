/**
 * ═══════════════════════════════════════════════════════════
 * Git Deployment Target Model
 * Represents deployment destinations (Docker, K8s, Cloud)
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const GitDeploymentTarget = sequelize.define('GitDeploymentTarget', {
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
  type: {
    type: DataTypes.ENUM('docker', 'kubernetes', 'digitalocean', 'aws', 'azure', 'gcp', 'bare_metal', 'xen', 'qemu'),
    allowNull: false
  },
  environment: {
    type: DataTypes.ENUM('development', 'staging', 'production', 'testing'),
    defaultValue: 'development'
  },
  configuration: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  credentials: {
    type: DataTypes.JSONB,
    defaultValue: {}
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
  tableName: 'git_deployment_targets',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['repository_id'] },
    { fields: ['type'] }
  ]
  });

  return GitDeploymentTarget;
  };
