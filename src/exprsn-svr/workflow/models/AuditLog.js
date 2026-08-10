const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AuditLog = sequelize.define('AuditLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  event_type: {
    type: DataTypes.ENUM(
      'workflow_create',
      'workflow_update',
      'workflow_delete',
      'workflow_clone',
      'workflow_execute',
      'workflow_cancel',
      'workflow_export',
      'workflow_import',
      'execution_start',
      'execution_complete',
      'execution_fail',
      'execution_cancel',
      'execution_retry',
      'step_execute',
      'step_fail',
      'permission_grant',
      'permission_revoke',
      'config_change'
    ),
    allowNull: false,
    comment: 'Type of event that was audited'
  },
  workflow_id: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'Associated workflow ID'
  },
  execution_id: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'Associated execution ID'
  },
  step_id: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Associated step ID within workflow'
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'User who performed the action'
  },
  user_ip: {
    type: DataTypes.INET,
    allowNull: true,
    comment: 'IP address of the user'
  },
  user_agent: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'User agent string'
  },
  changes: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Before/after values for updates',
    defaultValue: {}
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Additional context and metadata',
    defaultValue: {}
  },
  success: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Whether the operation succeeded'
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Error message if operation failed'
  },
  duration_ms: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Duration of operation in milliseconds'
  },
  severity: {
    type: DataTypes.ENUM('info', 'warning', 'error', 'critical'),
    allowNull: false,
    defaultValue: 'info',
    comment: 'Severity level of the event'
  }
}, {
  tableName: 'audit_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false, // Audit logs are immutable
  underscored: true,
  indexes: [
    { fields: ['workflow_id', 'created_at'] },
    { fields: ['execution_id', 'created_at'] },
    { fields: ['user_id', 'created_at'] },
    { fields: ['event_type', 'created_at'] },
    { fields: ['created_at'] },
    { using: 'gin', fields: ['metadata'] },
    { using: 'gin', fields: ['changes'] }
  ]
});

module.exports = AuditLog;
