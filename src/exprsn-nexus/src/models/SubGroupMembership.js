const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class SubGroupMembership extends Model {}

SubGroupMembership.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  subGroupId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'subgroup_id',
    references: {
      model: 'subgroups',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id'
  },
  role: {
    type: DataTypes.ENUM('moderator', 'member'),
    defaultValue: 'member',
    allowNull: false,
    comment: 'Role within this specific sub-group'
  },
  status: {
    type: DataTypes.ENUM('active', 'removed', 'banned'),
    defaultValue: 'active',
    allowNull: false
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
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  sequelize,
  modelName: 'SubGroupMembership',
  tableName: 'subgroup_memberships',
  timestamps: false,
  indexes: [
    { fields: ['subgroup_id'] },
    { fields: ['user_id'] },
    { fields: ['status'] },
    { fields: ['subgroup_id', 'user_id'], unique: true }
  ]
});

module.exports = SubGroupMembership;
