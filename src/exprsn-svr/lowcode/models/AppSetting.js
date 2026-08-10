/**
 * Application Setting Model
 * Stores configuration variables and settings for Low-Code applications
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AppSetting = sequelize.define('AppSetting', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    applicationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'applications',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    key: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Setting key/name (e.g., "apiUrl", "maxUploadSize")'
    },
    displayName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'User-friendly name'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Description of what this setting does'
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'general',
      comment: 'Setting category (general, api, database, ui, security, etc.)'
    },
    dataType: {
      type: DataTypes.ENUM(
        'string',
        'number',
        'boolean',
        'json',
        'array',
        'date',
        'datetime',
        'password',
        'url',
        'email',
        'color',
        'file'
      ),
      allowNull: false,
      defaultValue: 'string',
      comment: 'Data type of the setting value'
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Actual value (stored as string, parsed based on dataType)'
    },
    defaultValue: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Default value if not set'
    },
    isUserCustomizable: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Can users modify this setting?'
    },
    isSystemSetting: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Is this a system-managed setting?'
    },
    isRequired: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Is this setting required?'
    },
    isEncrypted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Is the value encrypted? (for passwords, API keys, etc.)'
    },
    environment: {
      type: DataTypes.ENUM('all', 'development', 'staging', 'production'),
      allowNull: false,
      defaultValue: 'all',
      comment: 'Which environment this setting applies to'
    },
    validationRules: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Validation rules (min, max, pattern, enum, etc.)'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Additional metadata (options for select, format hints, etc.)'
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Display order'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Is this setting currently active?'
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true
    },
    updatedBy: {
      type: DataTypes.UUID,
      allowNull: true
    }
  }, {
    tableName: 'app_settings',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['application_id', 'key', 'environment'],
        name: 'app_settings_unique_key'
      },
      {
        fields: ['application_id', 'category'],
        name: 'app_settings_category_idx'
      },
      {
        fields: ['is_system_setting'],
        name: 'app_settings_system_idx'
      }
    ]
  });

  AppSetting.associate = (models) => {
    AppSetting.belongsTo(models.Application, {
      foreignKey: 'applicationId',
      as: 'application'
    });
  };

  // Instance methods
  AppSetting.prototype.getParsedValue = function() {
    if (!this.value) {
      return this.getDefaultParsedValue();
    }

    try {
      switch (this.dataType) {
        case 'number':
          return parseFloat(this.value);

        case 'boolean':
          return this.value === 'true' || this.value === '1' || this.value === 1;

        case 'json':
        case 'array':
          return JSON.parse(this.value);

        case 'date':
        case 'datetime':
          return new Date(this.value);

        case 'password':
          // Return masked value, actual decryption should be done server-side
          return '********';

        default:
          return this.value;
      }
    } catch (error) {
      console.error(`Error parsing setting ${this.key}:`, error);
      return this.getDefaultParsedValue();
    }
  };

  AppSetting.prototype.getDefaultParsedValue = function() {
    if (!this.defaultValue) {
      return null;
    }

    try {
      switch (this.dataType) {
        case 'number':
          return parseFloat(this.defaultValue);

        case 'boolean':
          return this.defaultValue === 'true' || this.defaultValue === '1';

        case 'json':
        case 'array':
          return JSON.parse(this.defaultValue);

        case 'date':
        case 'datetime':
          return new Date(this.defaultValue);

        default:
          return this.defaultValue;
      }
    } catch (error) {
      return null;
    }
  };

  AppSetting.prototype.setValue = function(newValue) {
    if (newValue === null || newValue === undefined) {
      this.value = null;
      return;
    }

    switch (this.dataType) {
      case 'number':
      case 'string':
      case 'url':
      case 'email':
      case 'color':
      case 'password':
      case 'file':
        this.value = String(newValue);
        break;

      case 'boolean':
        this.value = Boolean(newValue) ? 'true' : 'false';
        break;

      case 'json':
      case 'array':
        this.value = JSON.stringify(newValue);
        break;

      case 'date':
      case 'datetime':
        if (newValue instanceof Date) {
          this.value = newValue.toISOString();
        } else {
          this.value = new Date(newValue).toISOString();
        }
        break;

      default:
        this.value = String(newValue);
    }
  };

  AppSetting.prototype.validate = function() {
    if (!this.validationRules) {
      return { valid: true };
    }

    const rules = this.validationRules;
    const value = this.getParsedValue();

    // Required check
    if (this.isRequired && (value === null || value === undefined || value === '')) {
      return {
        valid: false,
        error: `${this.displayName} is required`
      };
    }

    // Type-specific validation
    switch (this.dataType) {
      case 'number':
        if (rules.min !== undefined && value < rules.min) {
          return { valid: false, error: `Value must be at least ${rules.min}` };
        }
        if (rules.max !== undefined && value > rules.max) {
          return { valid: false, error: `Value must be at most ${rules.max}` };
        }
        break;

      case 'string':
      case 'url':
      case 'email':
        if (rules.minLength && value.length < rules.minLength) {
          return { valid: false, error: `Minimum length is ${rules.minLength}` };
        }
        if (rules.maxLength && value.length > rules.maxLength) {
          return { valid: false, error: `Maximum length is ${rules.maxLength}` };
        }
        if (rules.pattern && !new RegExp(rules.pattern).test(value)) {
          return { valid: false, error: `Value does not match required pattern` };
        }
        break;

      case 'array':
        if (rules.minItems && value.length < rules.minItems) {
          return { valid: false, error: `Minimum ${rules.minItems} items required` };
        }
        if (rules.maxItems && value.length > rules.maxItems) {
          return { valid: false, error: `Maximum ${rules.maxItems} items allowed` };
        }
        break;
    }

    // Enum validation
    if (rules.enum && !rules.enum.includes(value)) {
      return {
        valid: false,
        error: `Value must be one of: ${rules.enum.join(', ')}`
      };
    }

    return { valid: true };
  };

  return AppSetting;
};
