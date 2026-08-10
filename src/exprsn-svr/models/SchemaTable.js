/**
 * Schema Table Model
 */
const { Model, DataTypes } = require('sequelize');

class SchemaTable extends Model {
  static init(sequelize) {
    return super.init({
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      schemaId: { type: DataTypes.UUID, allowNull: false, field: 'schema_id' },
      name: { type: DataTypes.STRING, allowNull: false },
      displayName: { type: DataTypes.STRING, allowNull: false, field: 'display_name' },
      description: { type: DataTypes.TEXT },
      tableType: { type: DataTypes.ENUM('table', 'view', 'materialized_view', 'junction'), defaultValue: 'table', field: 'table_type' },
      isTemporal: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_temporal' },
      isSoftDelete: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_soft_delete' },
      isAudited: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_audited' },
      rowLevelSecurity: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'row_level_security' },
      positionX: { type: DataTypes.INTEGER, field: 'position_x' },
      positionY: { type: DataTypes.INTEGER, field: 'position_y' },
      color: { type: DataTypes.STRING },
      icon: { type: DataTypes.STRING },
      options: { type: DataTypes.JSONB, defaultValue: {} }
    }, {
      sequelize,
      modelName: 'SchemaTable',
      tableName: 'schema_tables',
      underscored: true
    });
  }

  static associate(models) {
    this.belongsTo(models.SchemaDefinition, { foreignKey: 'schemaId', as: 'schema' });
    this.hasMany(models.SchemaColumn, { foreignKey: 'tableId', as: 'columns' });
    this.hasMany(models.SchemaIndex, { foreignKey: 'tableId', as: 'indexes' });
  }
}

module.exports = SchemaTable;
