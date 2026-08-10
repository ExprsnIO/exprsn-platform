const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class GroupRole extends Model {}

GroupRole.init({
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
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [2, 100]
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  color: {
    type: DataTypes.STRING(7),
    allowNull: true,
    validate: {
      is: /^#[0-9A-F]{6}$/i
    }
  },
  position: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
    comment: 'Display order (higher = more important)'
  },
  isDefault: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_default',
    comment: 'Auto-assigned to new members'
  },
  isSystem: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_system',
    comment: 'System roles cannot be deleted'
  },
  permissions: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Permission flags for this role'
  },
  createdAt: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: () => Date.now(),
    field: 'created_at'
  },
  updatedAt: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: () => Date.now(),
    field: 'updated_at'
  }
}, {
  sequelize,
  modelName: 'GroupRole',
  tableName: 'group_roles',
  timestamps: false,
  indexes: [
    { fields: ['group_id'] },
    { fields: ['group_id', 'name'], unique: true },
    { fields: ['is_default'] },
    { fields: ['position'] }
  ]
});

module.exports = GroupRole;
