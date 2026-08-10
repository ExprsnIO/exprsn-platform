/**
 * ═══════════════════════════════════════════════════════════
 * Git System Config Model
 * Represents system-wide Git configuration settings
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const GitSystemConfig = sequelize.define('GitSystemConfig', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  key: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    field: 'config_key',
    validate: {
      notEmpty: true
    }
  },
  value: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
    field: 'config_value'
  },
  type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'config_type'
  },
  encrypted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
    field: 'is_encrypted'
  },
  updatedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'updated_by'
  }
  }, {
  tableName: 'git_system_config',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['config_key'], unique: true },
    { fields: ['config_type'] }
  ]
  });

  return GitSystemConfig;
};
