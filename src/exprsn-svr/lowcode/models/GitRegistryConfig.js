/**
 * ═══════════════════════════════════════════════════════════
 * Git Registry Config Model
 * Represents container and package registry configurations
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const GitRegistryConfig = sequelize.define('GitRegistryConfig', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  repositoryId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'repository_id'
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  registryType: {
    type: DataTypes.ENUM('docker', 'npm', 'maven', 'pypi', 'nuget', 'rubygems'),
    allowNull: false,
    field: 'registry_type'
  },
  url: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isUrl: true
    }
  },
  username: {
    type: DataTypes.STRING,
    allowNull: true
  },
  passwordEncrypted: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'password_encrypted'
  },
  tokenEncrypted: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'token_encrypted'
  },
  isDefault: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_default'
  },
  scope: {
    type: DataTypes.ENUM('global', 'repository'),
    defaultValue: 'repository'
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by'
  }
  }, {
  tableName: 'git_registry_config',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['repository_id'] },
    { fields: ['registry_type'] },
    { fields: ['scope'] }
  ]
  });

  return GitRegistryConfig;
};
