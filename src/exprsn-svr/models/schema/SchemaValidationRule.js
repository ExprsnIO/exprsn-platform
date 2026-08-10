/**
 * ═══════════════════════════════════════════════════════════
 * SchemaValidationRule Model
 * Reusable JSONLex-based validation rules
 * ═══════════════════════════════════════════════════════════
 */

const { Model, DataTypes } = require('sequelize');

class SchemaValidationRule extends Model {
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
        comment: 'Rule name (e.g., "email", "phone", "positive_number")'
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
        comment: 'JSONLex expression that returns boolean',
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
      errorMessage: {
        type: DataTypes.STRING,
        field: 'error_message',
        comment: 'Error message when validation fails'
      },
      severity: {
        type: DataTypes.ENUM('error', 'warning', 'info'),
        defaultValue: 'error'
      },
      isReusable: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'is_reusable',
        comment: 'Whether this can be applied to multiple fields'
      },
      applicableTypes: {
        type: DataTypes.JSONB,
        defaultValue: [],
        field: 'applicable_types',
        comment: 'Data types this validation can be applied to'
      },
      metadata: {
        type: DataTypes.JSONB,
        defaultValue: {}
      }
    }, {
      sequelize,
      modelName: 'SchemaValidationRule',
      tableName: 'schema_validation_rules',
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
   * Validate value against this rule
   */
  validate(value, context = {}) {
    const JSONLexParser = require('../../services/schema/JSONLexParser');

    // Set up context with 'value' as the primary field
    const data = { value, ...context };

    try {
      const result = JSONLexParser.evaluate(this.jsonlexExpression, data);
      return {
        valid: Boolean(result),
        message: result ? null : this.errorMessage,
        severity: this.severity
      };
    } catch (error) {
      return {
        valid: false,
        message: `Validation error: ${error.message}`,
        severity: 'error'
      };
    }
  }

  /**
   * Check if this rule is applicable to a data type
   */
  isApplicableTo(dataType) {
    if (!this.applicableTypes || this.applicableTypes.length === 0) {
      return true; // No restrictions
    }
    return this.applicableTypes.includes(dataType.toUpperCase());
  }

  /**
   * Create common validation rules
   */
  static async seedCommonRules(schemaId) {
    const commonRules = [
      {
        schemaId,
        name: 'email',
        displayName: 'Email Address',
        description: 'Validates email format',
        jsonlexExpression: {
          operator: 'and',
          operands: [
            {
              operator: 'greaterThan',
              operands: ['$value.length', 0]
            },
            {
              operator: 'matches',
              operands: ['$value', '^[^@]+@[^@]+\\.[^@]+$']
            }
          ]
        },
        errorMessage: 'Must be a valid email address',
        applicableTypes: ['VARCHAR', 'TEXT', 'STRING']
      },
      {
        schemaId,
        name: 'url',
        displayName: 'URL',
        description: 'Validates URL format',
        jsonlexExpression: {
          operator: 'matches',
          operands: ['$value', '^https?://']
        },
        errorMessage: 'Must be a valid URL starting with http:// or https://',
        applicableTypes: ['VARCHAR', 'TEXT', 'STRING']
      },
      {
        schemaId,
        name: 'positive',
        displayName: 'Positive Number',
        description: 'Value must be greater than zero',
        jsonlexExpression: {
          operator: 'greaterThan',
          operands: ['$value', 0]
        },
        errorMessage: 'Must be a positive number',
        applicableTypes: ['INTEGER', 'BIGINT', 'DECIMAL', 'FLOAT', 'DOUBLE']
      },
      {
        schemaId,
        name: 'non_negative',
        displayName: 'Non-Negative Number',
        description: 'Value must be zero or greater',
        jsonlexExpression: {
          operator: 'greaterThanOrEqual',
          operands: ['$value', 0]
        },
        errorMessage: 'Must be a non-negative number',
        applicableTypes: ['INTEGER', 'BIGINT', 'DECIMAL', 'FLOAT', 'DOUBLE']
      },
      {
        schemaId,
        name: 'phone_us',
        displayName: 'US Phone Number',
        description: 'Validates US phone number format',
        jsonlexExpression: {
          operator: 'matches',
          operands: ['$value', '^\\+?1?[\\s.-]?\\(?\\d{3}\\)?[\\s.-]?\\d{3}[\\s.-]?\\d{4}$']
        },
        errorMessage: 'Must be a valid US phone number',
        applicableTypes: ['VARCHAR', 'TEXT', 'STRING']
      },
      {
        schemaId,
        name: 'min_length',
        displayName: 'Minimum Length',
        description: 'String must have minimum length',
        jsonlexExpression: {
          operator: 'greaterThanOrEqual',
          operands: [
            { operator: 'length', operands: ['$value'] },
            '$minLength'
          ]
        },
        errorMessage: 'Does not meet minimum length requirement',
        applicableTypes: ['VARCHAR', 'TEXT', 'STRING']
      },
      {
        schemaId,
        name: 'max_length',
        displayName: 'Maximum Length',
        description: 'String must not exceed maximum length',
        jsonlexExpression: {
          operator: 'lessThanOrEqual',
          operands: [
            { operator: 'length', operands: ['$value'] },
            '$maxLength'
          ]
        },
        errorMessage: 'Exceeds maximum length',
        applicableTypes: ['VARCHAR', 'TEXT', 'STRING']
      },
      {
        schemaId,
        name: 'range',
        displayName: 'Numeric Range',
        description: 'Value must be within specified range',
        jsonlexExpression: {
          operator: 'and',
          operands: [
            { operator: 'greaterThanOrEqual', operands: ['$value', '$min'] },
            { operator: 'lessThanOrEqual', operands: ['$value', '$max'] }
          ]
        },
        errorMessage: 'Value must be within the specified range',
        applicableTypes: ['INTEGER', 'BIGINT', 'DECIMAL', 'FLOAT', 'DOUBLE']
      }
    ];

    return await this.bulkCreate(commonRules);
  }
}

module.exports = SchemaValidationRule;
