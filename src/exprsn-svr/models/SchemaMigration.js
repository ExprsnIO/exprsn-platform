/**
 * ═══════════════════════════════════════════════════════════
 * Schema Migration Model
 * Generated DDL migrations for database deployment
 * ═══════════════════════════════════════════════════════════
 */

const { Model, DataTypes } = require('sequelize');

class SchemaMigration extends Model {
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
      version: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: true
        }
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: true
        }
      },
      upSql: {
        type: DataTypes.TEXT,
        allowNull: false,
        field: 'up_sql'
      },
      downSql: {
        type: DataTypes.TEXT,
        allowNull: false,
        field: 'down_sql'
      },
      status: {
        type: DataTypes.ENUM('pending', 'applied', 'rolled_back', 'failed'),
        defaultValue: 'pending'
      },
      appliedAt: {
        type: DataTypes.DATE,
        field: 'applied_at'
      },
      rolledBackAt: {
        type: DataTypes.DATE,
        field: 'rolled_back_at'
      },
      errorMessage: {
        type: DataTypes.TEXT,
        field: 'error_message'
      }
    }, {
      sequelize,
      modelName: 'SchemaMigration',
      tableName: 'schema_migrations',
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

module.exports = SchemaMigration;
