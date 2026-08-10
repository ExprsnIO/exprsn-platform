const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class GroupMembership extends Model {}

GroupMembership.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id'
  },
  groupId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'group_id',
    references: {
      model: 'groups',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  role: {
    type: DataTypes.STRING(50),
    defaultValue: 'member',
    allowNull: false,
    comment: 'owner, admin, moderator, member, etc.'
  },
  customRoleId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'custom_role_id',
    references: {
      model: 'group_roles',
      key: 'id'
    },
    onDelete: 'SET NULL'
  },
  status: {
    type: DataTypes.ENUM('active', 'suspended', 'banned', 'left'),
    defaultValue: 'active',
    allowNull: false
  },
  signature: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Cryptographic signature for membership verification'
  },
  invitedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'invited_by'
  },
  joinedAt: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: () => Date.now(),
    field: 'joined_at'
  },
  leftAt: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'left_at'
  },
  suspendedAt: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'suspended_at'
  },
  suspendedUntil: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'suspended_until'
  },
  suspendedReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'suspended_reason'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional membership metadata'
  }
}, {
  sequelize,
  modelName: 'GroupMembership',
  tableName: 'group_memberships',
  timestamps: false,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['group_id'] },
    { fields: ['user_id', 'group_id'], unique: true },
    { fields: ['role'] },
    { fields: ['status'] },
    { fields: ['joined_at'] }
  ]
});

module.exports = GroupMembership;
