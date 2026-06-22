/**
 * ═══════════════════════════════════════════════════════════
 * Moderator Config Model
 * System-wide configuration settings
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ModeratorConfig = sequelize.define('ModeratorConfig', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    key: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
        is: /^[a-z_][a-z0-9_]*$/i  // Valid config key format
      }
    },
    value: {
      type: DataTypes.JSONB,
      allowNull: false,
      get() {
        const value = this.getDataValue('value');
        return typeof value === 'string' ? JSON.parse(value) : value;
      },
      set(value) {
        this.setDataValue('value', value);
      }
    },
    category: {
      type: DataTypes.ENUM(
        'general',
        'thresholds',
        'email',
        'ai_providers',
        'workflows',
        'rate_limiting',
        'notifications',
        'advanced'
      ),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    isSensitive: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_sensitive'
    },
    isSystem: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_system'
    },
    updatedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'updated_by'
    }
  }, {
    tableName: 'moderator_config',
    underscored: true,
    timestamps: true
  });

  // Class methods
  ModeratorConfig.getConfig = async function(key, defaultValue = null) {
    const config = await this.findOne({ where: { key } });
    return config ? config.value : defaultValue;
  };

  ModeratorConfig.setConfig = async function(key, value, category = 'general', updatedBy = null) {
    const [config, created] = await this.findOrCreate({
      where: { key },
      defaults: { key, value, category, updatedBy }
    });

    if (!created) {
      config.value = value;
      if (updatedBy) config.updatedBy = updatedBy;
      await config.save();
    }

    return config;
  };

  ModeratorConfig.getByCategory = async function(category) {
    const configs = await this.findAll({ where: { category } });
    return configs.reduce((acc, config) => {
      acc[config.key] = config.value;
      return acc;
    }, {});
  };

  return ModeratorConfig;
};
