/**
 * ═══════════════════════════════════════════════════════════
 * Plugin Model
 * Manages installable plugins and extensions
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Plugin = sequelize.define('Plugin', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      is: /^[a-z0-9-]+$/i, // alphanumeric and hyphens only
      len: [1, 100]
    }
  },
  displayName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'display_name'
  },
  description: {
    type: DataTypes.TEXT
  },
  version: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      is: /^\d+\.\d+\.\d+$/ // semantic versioning
    }
  },
  author: {
    type: DataTypes.STRING
  },
  authorEmail: {
    type: DataTypes.STRING,
    field: 'author_email',
    validate: {
      isEmail: true
    }
  },
  license: {
    type: DataTypes.STRING
  },
  homepage: {
    type: DataTypes.STRING,
    validate: {
      isUrl: true
    }
  },
  repository: {
    type: DataTypes.STRING,
    validate: {
      isUrl: true
    }
  },
  type: {
    type: DataTypes.ENUM('component', 'service', 'middleware', 'theme', 'integration', 'workflow-step'),
    allowNull: false
  },
  category: {
    type: DataTypes.STRING
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  mainFile: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'main_file'
  },
  configSchema: {
    type: DataTypes.JSONB,
    defaultValue: {},
    field: 'config_schema'
  },
  defaultConfig: {
    type: DataTypes.JSONB,
    defaultValue: {},
    field: 'default_config'
  },
  dependencies: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  permissionsRequired: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    field: 'permissions_required'
  },
  hooks: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'disabled', 'error'),
    defaultValue: 'inactive'
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  installedAt: {
    type: DataTypes.DATE,
    field: 'installed_at'
  },
  installedBy: {
    type: DataTypes.UUID,
    field: 'installed_by'
  },
  updatedBy: {
    type: DataTypes.UUID,
    field: 'updated_by'
  },
  errorMessage: {
    type: DataTypes.TEXT,
    field: 'error_message'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'plugins',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['name'] },
    { fields: ['type'] },
    { fields: ['status'] },
    { fields: ['enabled'] },
    { fields: ['category'] }
  ]
});

/**
 * Instance methods
 */
Plugin.prototype.activate = async function() {
  this.enabled = true;
  this.status = 'active';
  await this.save();
};

Plugin.prototype.deactivate = async function() {
  this.enabled = false;
  this.status = 'inactive';
  await this.save();
};

Plugin.prototype.setError = async function(error) {
  this.status = 'error';
  this.errorMessage = error.message || String(error);
  await this.save();
};

Plugin.prototype.toSafeJSON = function() {
  return {
    id: this.id,
    name: this.name,
    displayName: this.displayName,
    description: this.description,
    version: this.version,
    author: this.author,
    license: this.license,
    homepage: this.homepage,
    type: this.type,
    category: this.category,
    tags: this.tags,
    status: this.status,
    enabled: this.enabled,
    installedAt: this.installedAt,
    metadata: this.metadata
  };
};

module.exports = Plugin;
