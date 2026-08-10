/**
 * ═══════════════════════════════════════════════════════════
 * Schema Column Model
 * Columns (fields) within tables
 * ═══════════════════════════════════════════════════════════
 */

const { Model, DataTypes } = require('sequelize');

class SchemaColumn extends Model {
  static init(sequelize) {
    return super.init({
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      tableId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'table_id'
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: true
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
      dataType: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'data_type'
      },
      length: {
        type: DataTypes.INTEGER
      },
      precision: {
        type: DataTypes.INTEGER
      },
      scale: {
        type: DataTypes.INTEGER
      },
      isPrimaryKey: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_primary_key'
      },
      isNullable: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'is_nullable'
      },
      isUnique: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_unique'
      },
      isAutoIncrement: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_auto_increment'
      },
      defaultValue: {
        type: DataTypes.TEXT,
        field: 'default_value'
      },
      checkConstraint: {
        type: DataTypes.TEXT,
        field: 'check_constraint'
      },
      isGenerated: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_generated'
      },
      generationExpression: {
        type: DataTypes.TEXT,
        field: 'generation_expression'
      },
      collation: {
        type: DataTypes.STRING
      },
      position: {
        type: DataTypes.INTEGER
      },
      metadata: {
        type: DataTypes.JSONB,
        defaultValue: {}
      }
    }, {
      sequelize,
      modelName: 'SchemaColumn',
      tableName: 'schema_columns',
      underscored: true
    });
  }

  static associate(models) {
    this.belongsTo(models.SchemaTable, {
      foreignKey: 'tableId',
      as: 'table'
    });
  }
}

module.exports = SchemaColumn;
