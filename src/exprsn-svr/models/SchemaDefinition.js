/**
 * ═══════════════════════════════════════════════════════════
 * Schema Definition Model
 * Top-level schema container
 * ═══════════════════════════════════════════════════════════
 */

const { Model, DataTypes } = require('sequelize');

class SchemaDefinition extends Model {
  static init(sequelize) {
    return super.init({
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: true
        }
      },
      slug: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          is: /^[a-z0-9-]+$/
        }
      },
      description: {
        type: DataTypes.TEXT
      },
      databaseName: {
        type: DataTypes.STRING,
        field: 'database_name'
      },
      schemaName: {
        type: DataTypes.STRING,
        field: 'schema_name',
        defaultValue: 'public'
      },
      version: {
        type: DataTypes.STRING,
        defaultValue: '1.0.0'
      },
      status: {
        type: DataTypes.ENUM('draft', 'active', 'deprecated', 'archived'),
        defaultValue: 'draft'
      },
      metadata: {
        type: DataTypes.JSONB,
        defaultValue: {}
      },
      createdBy: {
        type: DataTypes.UUID,
        field: 'created_by'
      },
      updatedBy: {
        type: DataTypes.UUID,
        field: 'updated_by'
      }
    }, {
      sequelize,
      modelName: 'SchemaDefinition',
      tableName: 'schema_definitions',
      paranoid: true,
      underscored: true
    });
  }

  static associate(models) {
    this.hasMany(models.SchemaTable, {
      foreignKey: 'schemaId',
      as: 'tables'
    });
    this.hasMany(models.SchemaRelationship, {
      foreignKey: 'schemaId',
      as: 'relationships'
    });
    this.hasMany(models.SchemaMaterializedView, {
      foreignKey: 'schemaId',
      as: 'materializedViews'
    });
    this.hasMany(models.SchemaChangeLog, {
      foreignKey: 'schemaId',
      as: 'changeLogs'
    });
    this.hasMany(models.SchemaMigration, {
      foreignKey: 'schemaId',
      as: 'migrations'
    });
  }
}

module.exports = SchemaDefinition;
