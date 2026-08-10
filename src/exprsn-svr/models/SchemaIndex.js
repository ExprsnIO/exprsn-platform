/**
 * ═══════════════════════════════════════════════════════════
 * Schema Index Model
 * Database indexes for performance optimization
 * ═══════════════════════════════════════════════════════════
 */

const { Model, DataTypes } = require('sequelize');

class SchemaIndex extends Model {
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
      indexType: {
        type: DataTypes.ENUM('btree', 'hash', 'gist', 'gin', 'brin', 'spgist'),
        defaultValue: 'btree',
        field: 'index_type'
      },
      columns: {
        type: DataTypes.ARRAY(DataTypes.UUID),
        allowNull: false
      },
      isUnique: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_unique'
      },
      isPrimary: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_primary'
      },
      whereClause: {
        type: DataTypes.TEXT,
        field: 'where_clause'
      },
      includeColumns: {
        type: DataTypes.ARRAY(DataTypes.UUID),
        field: 'include_columns'
      },
      storageParameters: {
        type: DataTypes.JSONB,
        field: 'storage_parameters'
      }
    }, {
      sequelize,
      modelName: 'SchemaIndex',
      tableName: 'schema_indexes',
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

module.exports = SchemaIndex;
