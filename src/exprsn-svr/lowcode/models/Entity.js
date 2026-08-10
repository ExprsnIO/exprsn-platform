/**
 * Entity Model
 *
 * Represents a data entity within an application.
 * Entities are similar to database tables and define the structure of data.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Entity = sequelize.define('Entity', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    applicationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'application_id',
      references: {
        model: 'applications',
        key: 'id',
      },
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
        is: /^[a-zA-Z][a-zA-Z0-9_]*$/, // Must start with letter
      },
    },
    displayName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'display_name',
    },
    pluralName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'plural_name',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    tableName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'table_name',
    },
    schema: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: { fields: [] },
      validate: {
        isValidSchema(value) {
          if (!value.fields || !Array.isArray(value.fields)) {
            throw new Error('Schema must contain a fields array');
          }
        },
      },
    },
    relationships: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    indexes: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    permissions: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    validationRules: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      field: 'validation_rules',
    },
    sourceType: {
      type: DataTypes.ENUM('custom', 'forge', 'external'),
      allowNull: false,
      defaultValue: 'custom',
      field: 'source_type',
    },
    sourceConfig: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'source_config',
    },
    enableAudit: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'enable_audit',
    },
    enableVersioning: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'enable_versioning',
    },
    softDelete: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'soft_delete',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
  }, {
    tableName: 'app_entities',
    timestamps: true,
    underscored: true,
    paranoid: true,
    indexes: [
      { fields: ['application_id'] },
      { fields: ['name'] },
      { fields: ['source_type'] },
      {
        unique: true,
        fields: ['application_id', 'name'],
        where: { deleted_at: null },
      },
    ],
  });

  Entity.associate = (models) => {
    // Entity belongs to an application
    Entity.belongsTo(models.Application, {
      foreignKey: 'applicationId',
      as: 'application',
    });
  };

  // Instance methods
  Entity.prototype.addField = function(field) {
    if (!this.schema.fields) {
      this.schema.fields = [];
    }

    // Validate field has required properties
    if (!field.name || !field.type) {
      throw new Error('Field must have name and type');
    }

    this.schema.fields.push(field);
    this.changed('schema', true); // Mark JSONB field as changed
    return this;
  };

  Entity.prototype.removeField = function(fieldName) {
    if (!this.schema.fields) return this;

    this.schema.fields = this.schema.fields.filter(f => f.name !== fieldName);
    this.changed('schema', true);
    return this;
  };

  Entity.prototype.updateField = function(fieldName, updates) {
    if (!this.schema.fields) return this;

    const fieldIndex = this.schema.fields.findIndex(f => f.name === fieldName);
    if (fieldIndex === -1) {
      throw new Error(`Field ${fieldName} not found`);
    }

    this.schema.fields[fieldIndex] = {
      ...this.schema.fields[fieldIndex],
      ...updates,
    };
    this.changed('schema', true);
    return this;
  };

  Entity.prototype.getField = function(fieldName) {
    if (!this.schema.fields) return null;
    return this.schema.fields.find(f => f.name === fieldName);
  };

  Entity.prototype.addRelationship = function(relationship) {
    if (!this.relationships) {
      this.relationships = [];
    }

    // Validate relationship
    if (!relationship.name || !relationship.type || !relationship.targetEntity) {
      throw new Error('Relationship must have name, type, and targetEntity');
    }

    this.relationships.push(relationship);
    this.changed('relationships', true);
    return this;
  };

  return Entity;
};
