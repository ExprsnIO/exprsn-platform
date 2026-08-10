/**
 * ═══════════════════════════════════════════════════════════
 * Git Webhook Model
 * Represents webhook configurations for CI/CD triggers
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const GitWebhook = sequelize.define('GitWebhook', {
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
  url: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isUrl: true
    }
  },
  secret: {
    type: DataTypes.STRING,
    allowNull: true
  },
  events: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: ['push', 'pull_request', 'issues']
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  sslVerify: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'ssl_verify'
  },
  headers: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by'
  }
  }, {
  tableName: 'git_webhooks',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['repository_id'] }
  ]
  });

  return GitWebhook;
  };
