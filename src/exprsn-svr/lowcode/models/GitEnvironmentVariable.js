/**
 * ═══════════════════════════════════════════════════════════
 * Git Environment Variable Model
 * Represents environment variables for CI/CD pipelines
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const GitEnvironmentVariable = sequelize.define('GitEnvironmentVariable', {
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
  environmentId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'environment_id'
  },
  key: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      is: /^[A-Z0-9_]+$/
    }
  },
  value: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  encrypted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  masked: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  protected: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  scope: {
    type: DataTypes.ENUM('global', 'repository', 'environment'),
    defaultValue: 'repository'
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by'
  }
  }, {
  tableName: 'git_environment_variables',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['repository_id'] },
    { fields: ['environment_id'] },
    { fields: ['scope'] },
    { fields: ['repository_id', 'key'], unique: true }
  ]
  });

  return GitEnvironmentVariable;
};
