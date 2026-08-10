/**
 * ═══════════════════════════════════════════════════════════
 * SchemaExpressionFunction Model
 * Custom reusable JSONLex functions
 * ═══════════════════════════════════════════════════════════
 */

const { Model, DataTypes } = require('sequelize');

class SchemaExpressionFunction extends Model {
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
        comment: 'Function name (e.g., "calculateTax", "formatAddress")'
      },
      displayName: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'display_name'
      },
      description: {
        type: DataTypes.TEXT
      },
      parameters: {
        type: DataTypes.JSONB,
        defaultValue: [],
        comment: 'Array of {name, type, required, defaultValue}'
      },
      jsonlexExpression: {
        type: DataTypes.JSONB,
        allowNull: false,
        field: 'jsonlex_expression',
        comment: 'The function body as JSONLex',
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
      returnType: {
        type: DataTypes.STRING,
        field: 'return_type',
        comment: 'Expected return type'
      },
      category: {
        type: DataTypes.STRING,
        comment: 'Function category (math, string, date, business, etc.)'
      },
      isPure: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'is_pure',
        comment: 'Whether function has side effects'
      },
      examples: {
        type: DataTypes.JSONB,
        defaultValue: [],
        comment: 'Usage examples with inputs and expected outputs'
      },
      metadata: {
        type: DataTypes.JSONB,
        defaultValue: {}
      }
    }, {
      sequelize,
      modelName: 'SchemaExpressionFunction',
      tableName: 'schema_expression_functions',
      underscored: true,
      timestamps: true
    });
  }

  static associate(models) {
    this.belongsTo(models.SchemaDefinition, {
      foreignKey: 'schemaId',
      as: 'schema'
    });
  }

  /**
   * Execute function with arguments
   */
  execute(args = {}) {
    const JSONLexParser = require('../../services/schema/JSONLexParser');

    // Validate parameters
    const missingParams = this.parameters
      .filter(p => p.required && !(p.name in args))
      .map(p => p.name);

    if (missingParams.length > 0) {
      throw new Error(`Missing required parameters: ${missingParams.join(', ')}`);
    }

    // Apply default values
    const data = { ...args };
    this.parameters.forEach(param => {
      if (!(param.name in data) && param.defaultValue !== undefined) {
        data[param.name] = param.defaultValue;
      }
    });

    return JSONLexParser.evaluate(this.jsonlexExpression, data);
  }

  /**
   * Generate function signature for documentation
   */
  getSignature() {
    const params = this.parameters
      .map(p => {
        const required = p.required ? '' : '?';
        const type = p.type ? `: ${p.type}` : '';
        const def = p.defaultValue !== undefined ? ` = ${JSON.stringify(p.defaultValue)}` : '';
        return `${p.name}${required}${type}${def}`;
      })
      .join(', ');

    const returnType = this.returnType ? `: ${this.returnType}` : '';
    return `${this.name}(${params})${returnType}`;
  }
}

module.exports = SchemaExpressionFunction;
