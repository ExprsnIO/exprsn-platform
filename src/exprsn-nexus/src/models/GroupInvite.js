const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class GroupInvite extends Model {}

GroupInvite.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
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
  userId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'user_id',
    comment: 'Specific user invite (null for open invite link)'
  },
  inviterId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'inviter_id'
  },
  inviteCode: {
    type: DataTypes.STRING(100),
    allowNull: true,
    unique: true,
    field: 'invite_code',
    comment: 'Unique code for invite links'
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'accepted', 'declined', 'expired'),
    defaultValue: 'pending',
    allowNull: false
  },
  maxUses: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'max_uses',
    comment: 'For invite links (null = unlimited)'
  },
  useCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'use_count'
  },
  createdAt: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: () => Date.now(),
    field: 'created_at'
  },
  acceptedAt: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'accepted_at'
  },
  expiresAt: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'expires_at'
  }
}, {
  sequelize,
  modelName: 'GroupInvite',
  tableName: 'group_invites',
  timestamps: false,
  indexes: [
    { fields: ['group_id'] },
    { fields: ['user_id'] },
    { fields: ['inviter_id'] },
    { fields: ['invite_code'], unique: true },
    { fields: ['status'] },
    { fields: ['expires_at'] }
  ]
});

module.exports = GroupInvite;
