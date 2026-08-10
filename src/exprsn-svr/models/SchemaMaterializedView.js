/**
 * ═══════════════════════════════════════════════════════════
 * Schema Materialized View Model
 * Cached query results for performance
 * ═══════════════════════════════════════════════════════════
 */

const { Model, DataTypes } = require('sequelize');

class SchemaMaterializedView extends Model {
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
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: true
        }
      },
      displayName: {
        type: DataTypes.STRING,
        field: 'display_name'
      },
      description: {
        type: DataTypes.TEXT
      },
      querySql: {
        type: DataTypes.TEXT,
        allowNull: false,
        field: 'query_sql'
      },
      refreshStrategy: {
        type: DataTypes.ENUM('manual', 'on_commit', 'scheduled', 'incremental'),
        defaultValue: 'manual',
        field: 'refresh_strategy'
      },
      refreshSchedule: {
        type: DataTypes.STRING,
        field: 'refresh_schedule'
      },
      withData: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'with_data'
      },
      storageParameters: {
        type: DataTypes.JSONB,
        field: 'storage_parameters'
      },
      lastRefreshedAt: {
        type: DataTypes.DATE,
        field: 'last_refreshed_at'
      }
    }, {
      sequelize,
      modelName: 'SchemaMaterializedView',
      tableName: 'schema_materialized_views',
      underscored: true
    });
  }

  static associate(models) {
    this.belongsTo(models.SchemaDefinition, {
      foreignKey: 'schemaId',
      as: 'schema'
    });
  }
}

module.exports = SchemaMaterializedView;
