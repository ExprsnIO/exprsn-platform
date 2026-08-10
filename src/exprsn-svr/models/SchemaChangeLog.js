/**
 * ═══════════════════════════════════════════════════════════
 * Schema Change Log Model
 * Audit trail for all schema modifications
 * ═══════════════════════════════════════════════════════════
 */

const { Model, DataTypes } = require('sequelize');

class SchemaChangeLog extends Model {
  static init(sequelize) {
    return super.init({
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      schemaId: {
        type: DataTypes.UUID,
        field: 'schema_id'
      },
      entityType: {
        type: DataTypes.ENUM('schema', 'table', 'column', 'relationship', 'index', 'materialized_view'),
        allowNull: false,
        field: 'entity_type'
      },
      entityId: {
        type: DataTypes.UUID,
        field: 'entity_id'
      },
      action: {
        type: DataTypes.ENUM('create', 'update', 'delete', 'deploy', 'rollback'),
        allowNull: false
      },
      beforeState: {
        type: DataTypes.JSONB,
        field: 'before_state'
      },
      afterState: {
        type: DataTypes.JSONB,
        field: 'after_state'
      },
      changedBy: {
        type: DataTypes.UUID,
        field: 'changed_by'
      },
      changeDescription: {
        type: DataTypes.TEXT,
        field: 'change_description'
      }
    }, {
      sequelize,
      modelName: 'SchemaChangeLog',
      tableName: 'schema_change_log',
      underscored: true,
      timestamps: true,
      updatedAt: false // Only track creation, not updates
    });
  }

  static associate(models) {
    this.belongsTo(models.SchemaDefinition, {
      foreignKey: 'schemaId',
      as: 'schema'
    });
  }
}

module.exports = SchemaChangeLog;
