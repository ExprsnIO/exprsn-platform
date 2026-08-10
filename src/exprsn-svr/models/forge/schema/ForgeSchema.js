const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

/**
 * ForgeSchema Model
 *
 * Stores JSON Schema definitions that define Forge models
 * Supports versioning, status tracking, and metadata
 */
const ForgeSchema = sequelize.define('ForgeSchema', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  modelId: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'model_id',
    validate: {
      is: /^[a-zA-Z][a-zA-Z0-9_]*$/,
      notEmpty: true
    },
    comment: 'Unique identifier for the model (e.g., Customer, Invoice)'
  },
  version: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      is: /^[0-9]+\.[0-9]+\.[0-9]+$/, // Semantic versioning
      notEmpty: true
    },
    comment: 'Semantic version (e.g., 1.0.0, 2.1.3)'
  },
  name: {
    type: DataTypes.STRING(200),
    allowNull: false,
    comment: 'Human-readable name of the model'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Description of the model purpose and usage'
  },
  tableName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'table_name',
    validate: {
      is: /^[a-zA-Z][a-zA-Z0-9_]*$/,
      notEmpty: true
    },
    comment: 'PostgreSQL table name for this model'
  },
  schemaDefinition: {
    type: DataTypes.JSONB,
    allowNull: false,
    field: 'schema_definition',
    comment: 'Extended JSON Schema with database, ui, validation, and workflow sections'
  },
  status: {
    type: DataTypes.ENUM('draft', 'active', 'deprecated', 'archived'),
    allowNull: false,
    defaultValue: 'draft',
    comment: 'Current status of the schema'
  },
  isSystem: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_system',
    comment: 'System schemas cannot be deleted or modified by users'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Additional metadata (tags, categories, etc.)'
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'created_by',
    comment: 'User who created this schema'
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'created_at'
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'updated_at'
  },
  activatedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'activated_at',
    comment: 'When the schema was activated'
  },
  deprecatedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'deprecated_at',
    comment: 'When the schema was deprecated'
  }
}, {
  tableName: 'forge_schemas',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['model_id', 'version']
    },
    {
      fields: ['model_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['table_name']
    },
    {
      fields: ['created_by']
    },
    {
      fields: ['created_at']
    },
    {
      fields: ['is_system']
    },
    {
      using: 'gin',
      fields: ['schema_definition']
    },
    {
      using: 'gin',
      fields: ['metadata']
    }
  ],
  hooks: {
    beforeValidate: (schema) => {
      // Ensure modelId and version match schema definition
      if (schema.schemaDefinition) {
        const def = typeof schema.schemaDefinition === 'string'
          ? JSON.parse(schema.schemaDefinition)
          : schema.schemaDefinition;

        if (def.modelId && schema.modelId !== def.modelId) {
          throw new Error('modelId does not match schema definition modelId');
        }

        if (def.version && schema.version !== def.version) {
          throw new Error('version does not match schema definition version');
        }
      }
    },
    beforeUpdate: (schema) => {
      // Prevent modification of system schemas
      if (schema.isSystem && schema.changed('schemaDefinition')) {
        throw new Error('Cannot modify system schema definitions');
      }
    },
    beforeDestroy: (schema) => {
      // Prevent deletion of system schemas
      if (schema.isSystem) {
        throw new Error('Cannot delete system schemas');
      }
    }
  }
});

/**
 * Instance Methods
 */

/**
 * Activate this schema
 */
ForgeSchema.prototype.activate = async function() {
  if (this.status === 'active') {
    throw new Error('Schema is already active');
  }

  this.status = 'active';
  this.activatedAt = new Date();
  await this.save();
};

/**
 * Deprecate this schema
 */
ForgeSchema.prototype.deprecate = async function() {
  if (this.status === 'deprecated') {
    throw new Error('Schema is already deprecated');
  }

  this.status = 'deprecated';
  this.deprecatedAt = new Date();
  await this.save();
};

/**
 * Check if schema is active
 */
ForgeSchema.prototype.isActive = function() {
  return this.status === 'active';
};

/**
 * Get schema properties
 */
ForgeSchema.prototype.getProperties = function() {
  return this.schemaDefinition?.properties || {};
};

/**
 * Get schema indexes
 */
ForgeSchema.prototype.getIndexes = function() {
  return this.schemaDefinition?.indexes || [];
};

/**
 * Get schema workflows
 */
ForgeSchema.prototype.getWorkflows = function() {
  return this.schemaDefinition?.workflows || [];
};

/**
 * Get schema permissions
 */
ForgeSchema.prototype.getPermissions = function() {
  return this.schemaDefinition?.permissions || {};
};

/**
 * Class Methods
 */

/**
 * Get latest active version of a model
 */
ForgeSchema.getLatestVersion = async function(modelId) {
  const schemas = await this.findAll({
    where: {
      modelId,
      status: 'active'
    },
    order: [
      [sequelize.literal("split_part(version, '.', 1)::int"), 'DESC'],
      [sequelize.literal("split_part(version, '.', 2)::int"), 'DESC'],
      [sequelize.literal("split_part(version, '.', 3)::int"), 'DESC']
    ],
    limit: 1
  });

  return schemas[0] || null;
};

/**
 * Get all versions of a model
 */
ForgeSchema.getVersions = async function(modelId) {
  return await this.findAll({
    where: { modelId },
    order: [
      [sequelize.literal("split_part(version, '.', 1)::int"), 'DESC'],
      [sequelize.literal("split_part(version, '.', 2)::int"), 'DESC'],
      [sequelize.literal("split_part(version, '.', 3)::int"), 'DESC']
    ]
  });
};

/**
 * Get all active schemas
 */
ForgeSchema.getActiveSchemas = async function() {
  return await this.findAll({
    where: { status: 'active' },
    order: [['modelId', 'ASC']]
  });
};

/**
 * Find schema by model ID and version
 */
ForgeSchema.findByModelVersion = async function(modelId, version) {
  return await this.findOne({
    where: { modelId, version }
  });
};

module.exports = ForgeSchema;
