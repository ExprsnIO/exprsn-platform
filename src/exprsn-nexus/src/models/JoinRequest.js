const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class JoinRequest extends Model {}

JoinRequest.init({
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
  message: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Optional message to group admins'
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected', 'cancelled'),
    defaultValue: 'pending',
    allowNull: false
  },
  reviewedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'reviewed_by'
  },
  reviewMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'review_message'
  },
  createdAt: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: () => Date.now(),
    field: 'created_at'
  },
  reviewedAt: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'reviewed_at'
  },
  expiresAt: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'expires_at',
    comment: 'Auto-expire old requests'
  }
}, {
  sequelize,
  modelName: 'JoinRequest',
  tableName: 'join_requests',
  timestamps: false,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['group_id'] },
    { fields: ['user_id', 'group_id'], unique: true },
    { fields: ['status'] },
    { fields: ['created_at'] },
    { fields: ['expires_at'] }
  ]
});

module.exports = JoinRequest;
