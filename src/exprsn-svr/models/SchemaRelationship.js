/**
 * ═══════════════════════════════════════════════════════════
 * Schema Relationship Model
 * Foreign key relationships between tables
 * ═══════════════════════════════════════════════════════════
 */

const { Model, DataTypes } = require('sequelize');

class SchemaRelationship extends Model {
  static init(sequelize) {
    return super.init({
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      schemaId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'schema_id'
      },
      name: {
        type: DataTypes.STRING
      },
      sourceTableId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'source_table_id'
      },
      sourceColumnId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'source_column_id'
      },
      targetTableId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'target_table_id'
      },
      targetColumnId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'target_column_id'
      },
      relationshipType: {
        type: DataTypes.ENUM('one_to_one', 'one_to_many', 'many_to_one', 'many_to_many'),
        allowNull: false,
        field: 'relationship_type'
      },
      onDelete: {
        type: DataTypes.ENUM('CASCADE', 'SET NULL', 'SET DEFAULT', 'RESTRICT', 'NO ACTION'),
        defaultValue: 'CASCADE',
        field: 'on_delete'
      },
      onUpdate: {
        type: DataTypes.ENUM('CASCADE', 'SET NULL', 'SET DEFAULT', 'RESTRICT', 'NO ACTION'),
        defaultValue: 'CASCADE',
        field: 'on_update'
      },
      junctionTableId: {
        type: DataTypes.UUID,
        field: 'junction_table_id'
      },
      displayLabel: {
        type: DataTypes.STRING,
        field: 'display_label'
      },
      isRequired: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_required'
      },
      metadata: {
        type: DataTypes.JSONB,
        defaultValue: {}
      }
    }, {
      sequelize,
      modelName: 'SchemaRelationship',
      tableName: 'schema_relationships',
      underscored: true
    });
  }

  static associate(models) {
    this.belongsTo(models.SchemaDefinition, {
      foreignKey: 'schemaId',
      as: 'schema'
    });
    this.belongsTo(models.SchemaTable, {
      foreignKey: 'sourceTableId',
      as: 'sourceTable'
    });
    this.belongsTo(models.SchemaColumn, {
      foreignKey: 'sourceColumnId',
      as: 'sourceColumn'
    });
    this.belongsTo(models.SchemaTable, {
      foreignKey: 'targetTableId',
      as: 'targetTable'
    });
    this.belongsTo(models.SchemaColumn, {
      foreignKey: 'targetColumnId',
      as: 'targetColumn'
    });
    this.belongsTo(models.SchemaTable, {
      foreignKey: 'junctionTableId',
      as: 'junctionTable'
    });
  }
}

module.exports = SchemaRelationship;
