/**
 * ═══════════════════════════════════════════════════════════
 * Add JSONLex Expression Support
 * Enhance schema columns with JSONLex calculated field support
 * ═══════════════════════════════════════════════════════════
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add JSONLex expression fields to schema_columns
    await queryInterface.addColumn('schema_columns', 'jsonlex_expression', {
      type: Sequelize.JSONB,
      comment: 'JSONLex expression for calculated/computed fields'
    });

    await queryInterface.addColumn('schema_columns', 'jsonlex_validation', {
      type: Sequelize.JSONB,
      comment: 'JSONLex validation rules'
    });

    await queryInterface.addColumn('schema_columns', 'is_calculated', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      comment: 'Whether this is a calculated field (client-side or generated)'
    });

    await queryInterface.addColumn('schema_columns', 'calculation_type', {
      type: Sequelize.ENUM('client', 'database', 'virtual'),
      comment: 'How the calculation is performed: client (JS), database (GENERATED), virtual (on-read)'
    });

    // Add JSONLex support to schema_tables for table-level constraints
    await queryInterface.addColumn('schema_tables', 'table_constraints', {
      type: Sequelize.JSONB,
      defaultValue: [],
      comment: 'JSONLex expressions for table-level CHECK constraints'
    });

    // Create calculated_fields table for complex calculations
    await queryInterface.createTable('schema_calculated_fields', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      schema_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'schema_definitions',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      table_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'schema_tables',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      column_id: {
        type: Sequelize.UUID,
        references: {
          model: 'schema_columns',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Associated column if this is a column calculation'
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Calculation name/identifier'
      },
      display_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT
      },
      jsonlex_expression: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: 'The JSONLex expression'
      },
      calculation_type: {
        type: Sequelize.ENUM('client', 'database', 'virtual', 'trigger'),
        defaultValue: 'client',
        comment: 'Where/how the calculation executes'
      },
      return_type: {
        type: Sequelize.STRING,
        comment: 'Expected return data type'
      },
      dependencies: {
        type: Sequelize.JSONB,
        defaultValue: [],
        comment: 'List of field names this calculation depends on'
      },
      cache_ttl: {
        type: Sequelize.INTEGER,
        comment: 'Cache TTL in seconds for expensive calculations'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Create validation_rules table for reusable validation expressions
    await queryInterface.createTable('schema_validation_rules', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      schema_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'schema_definitions',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Rule name (e.g., "email", "phone", "positive_number")'
      },
      display_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT
      },
      jsonlex_expression: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: 'JSONLex expression that returns boolean'
      },
      error_message: {
        type: Sequelize.STRING,
        comment: 'Error message when validation fails'
      },
      severity: {
        type: Sequelize.ENUM('error', 'warning', 'info'),
        defaultValue: 'error'
      },
      is_reusable: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: 'Whether this can be applied to multiple fields'
      },
      applicable_types: {
        type: Sequelize.JSONB,
        defaultValue: [],
        comment: 'Data types this validation can be applied to'
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Create expression_functions table for custom reusable functions
    await queryInterface.createTable('schema_expression_functions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      schema_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'schema_definitions',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Function name (e.g., "calculateTax", "formatAddress")'
      },
      display_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT
      },
      parameters: {
        type: Sequelize.JSONB,
        defaultValue: [],
        comment: 'Array of {name, type, required, defaultValue}'
      },
      jsonlex_expression: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: 'The function body as JSONLex'
      },
      return_type: {
        type: Sequelize.STRING,
        comment: 'Expected return type'
      },
      category: {
        type: Sequelize.STRING,
        comment: 'Function category (math, string, date, business, etc.)'
      },
      is_pure: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: 'Whether function has side effects'
      },
      examples: {
        type: Sequelize.JSONB,
        defaultValue: [],
        comment: 'Usage examples with inputs and expected outputs'
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Add indexes
    await queryInterface.addIndex('schema_calculated_fields', ['schema_id']);
    await queryInterface.addIndex('schema_calculated_fields', ['table_id']);
    await queryInterface.addIndex('schema_calculated_fields', ['column_id']);

    await queryInterface.addIndex('schema_validation_rules', ['schema_id']);
    await queryInterface.addIndex('schema_validation_rules', ['name']);

    await queryInterface.addIndex('schema_expression_functions', ['schema_id']);
    await queryInterface.addIndex('schema_expression_functions', ['name']);
    await queryInterface.addIndex('schema_expression_functions', ['category']);
  },

  down: async (queryInterface, Sequelize) => {
    // Drop new tables
    await queryInterface.dropTable('schema_expression_functions');
    await queryInterface.dropTable('schema_validation_rules');
    await queryInterface.dropTable('schema_calculated_fields');

    // Remove columns from schema_tables
    await queryInterface.removeColumn('schema_tables', 'table_constraints');

    // Remove columns from schema_columns
    await queryInterface.removeColumn('schema_columns', 'calculation_type');
    await queryInterface.removeColumn('schema_columns', 'is_calculated');
    await queryInterface.removeColumn('schema_columns', 'jsonlex_validation');
    await queryInterface.removeColumn('schema_columns', 'jsonlex_expression');

    // Drop enums
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_schema_columns_calculation_type"');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_schema_calculated_fields_calculation_type"');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_schema_validation_rules_severity"');
  }
};
