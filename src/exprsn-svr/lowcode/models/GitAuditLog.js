/**
 * ═══════════════════════════════════════════════════════════
 * Git Audit Log Model
 * Represents audit trail for all Git operations
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const GitAuditLog = sequelize.define('GitAuditLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'user_id'
  },
  action: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  entityType: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'entity_type'
  },
  entityId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'entity_id'
  },
  repositoryId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'repository_id'
  },
  changes: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  ipAddress: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'ip_address'
  },
  userAgent: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'user_agent'
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
  }, {
  tableName: 'git_audit_logs',
  underscored: true,
  timestamps: false,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['entity_type', 'entity_id'] },
    { fields: ['repository_id'] },
    { fields: ['action'] },
    { fields: ['timestamp'] }
  ]
  });

  return GitAuditLog;
};
