const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

/**
 * AdminAudit Model
 *
 * Append-only audit trail of privileged platform-admin actions performed
 * through the nexus admin console (group edit/delete, member remove/role
 * change, event cancel/delete, subgroup mutations, config saves, moderation
 * flag resolutions, etc.). Rows are written best-effort and never block the
 * underlying action — see services/adminAuditService.js.
 */
class AdminAudit extends Model {}

AdminAudit.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  actorUserId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'actor_user_id',
    comment: 'User who performed the action'
  },
  action: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Dotted action name, e.g. group.update, event.cancel'
  },
  targetType: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'target_type',
    comment: 'Type of the affected entity (group, event, subgroup, member, config, flag)'
  },
  targetId: {
    // STRING (not UUID) — some targets are non-UUID identifiers (e.g. a config
    // section id like "nexus-groups").
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'target_id',
    comment: 'Identifier of the affected entity'
  },
  groupId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'group_id',
    comment: 'Group context for the action, when applicable'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Action details, incl. { platformAdmin: bool } and any reason/changes'
  },
  createdAt: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: () => Date.now(),
    field: 'created_at'
  }
}, {
  sequelize,
  modelName: 'AdminAudit',
  tableName: 'admin_audit',
  timestamps: false,
  indexes: [
    { fields: ['created_at'] },
    { fields: ['group_id'] },
    { fields: ['actor_user_id'] },
    { fields: ['action'] }
  ]
});

module.exports = AdminAudit;
