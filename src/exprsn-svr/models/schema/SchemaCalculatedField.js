/**
 * ═══════════════════════════════════════════════════════════
 * SchemaCalculatedField Model
 * JSONLex-based calculated field definitions
 * ═══════════════════════════════════════════════════════════
 */

const { Model, DataTypes } = require('sequelize');

class SchemaCalculatedField extends Model {
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
      tableId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'table_id'
      },
      columnId: {
        type: DataTypes.UUID,
        field: 'column_id',
        comment: 'Associated column if this is a column calculation'
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Calculation name/identifier'
      },
      displayName: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'display_name'
      },
      description: {
        type: DataTypes.TEXT
      },
      jsonlexExpression: {
        type: DataTypes.JSONB,
        allowNull: false,
        field: 'jsonlex_expression',
        comment: 'The JSONLex expression',
        validate: {
          isValidExpression(value) {
            const JSONLexParser = require('../../services/schema/JSONLexParser');
            const result = JSONLexParser.validate(value);
            if (!result.valid) {
              throw new Error(`Invalid JSONLex expression: ${result.errors.join(', ')}`);
            }
          }
        }
      },
      calculationType: {
        type: DataTypes.ENUM('client', 'database', 'virtual', 'trigger'),
        defaultValue: 'client',
        field: 'calculation_type',
        comment: 'Where/how the calculation executes'
      },
      returnType: {
        type: DataTypes.STRING,
        field: 'return_type',
        comment: 'Expected return data type'
      },
      dependencies: {
        type: DataTypes.JSONB,
        defaultValue: [],
        comment: 'List of field names this calculation depends on'
      },
      cacheTtl: {
        type: DataTypes.INTEGER,
        field: 'cache_ttl',
        comment: 'Cache TTL in seconds for expensive calculations'
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'is_active'
      },
      metadata: {
        type: DataTypes.JSONB,
        defaultValue: {}
      }
    }, {
      sequelize,
      modelName: 'SchemaCalculatedField',
      tableName: 'schema_calculated_fields',
      underscored: true,
      timestamps: true
    });
  }

  static associate(models) {
    this.belongsTo(models.SchemaDefinition, {
      foreignKey: 'schemaId',
      as: 'schema'
    });
    this.belongsTo(models.SchemaTable, {
      foreignKey: 'tableId',
      as: 'table'
    });
    this.belongsTo(models.SchemaColumn, {
      foreignKey: 'columnId',
      as: 'column'
    });
  }

  /**
   * Generate SQL for this calculated field
   */
  toSQL() {
    const JSONLexParser = require('../../services/schema/JSONLexParser');
    return JSONLexParser.parseToSQL(this.jsonlexExpression);
  }

  /**
   * Evaluate expression with data
   */
  evaluate(data) {
    const JSONLexParser = require('../../services/schema/JSONLexParser');
    return JSONLexParser.evaluate(this.jsonlexExpression, data);
  }

  /**
   * Get dependency field names
   */
  getDependencies() {
    if (this.dependencies && this.dependencies.length > 0) {
      return this.dependencies;
    }

    // Auto-detect from expression
    const deps = new Set();
    const extractFields = (expr) => {
      if (!expr || typeof expr !== 'object') return;

      if (expr.operator === 'field' && expr.operands && expr.operands[0]) {
        deps.add(expr.operands[0]);
      }

      if (Array.isArray(expr.operands)) {
        expr.operands.forEach(op => {
          if (typeof op === 'object' && op.operator) {
            extractFields(op);
          } else if (typeof op === 'string' && op.startsWith('$')) {
            deps.add(op.substring(1));
          }
        });
      }
    };

    extractFields(this.jsonlexExpression);
    return Array.from(deps);
  }
}

module.exports = SchemaCalculatedField;
