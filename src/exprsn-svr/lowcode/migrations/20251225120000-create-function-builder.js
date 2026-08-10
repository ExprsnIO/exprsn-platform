/**
 * Migration: Create Function Builder System
 * Tables for function library, saved queries, and query vault
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Function categories table
    await queryInterface.createTable('function_categories', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true
      },
      display_name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      icon: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      order: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Function library table
    await queryInterface.createTable('function_library', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      category_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'function_categories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      display_name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      syntax: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      parameters: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: []
      },
      return_type: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      examples: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: []
      },
      implementation: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: []
      },
      is_system: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      is_enabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Saved queries (vault)
    await queryInterface.createTable('saved_queries', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      application_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'applications',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      query_type: {
        type: Sequelize.ENUM('formula', 'sql', 'powerquery', 'transform'),
        allowNull: false
      },
      query_content: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      query_ast: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Abstract syntax tree for query'
      },
      data_sources: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Tables/entities used'
      },
      parameters: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: []
      },
      output_schema: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Expected output columns'
      },
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: []
      },
      folder: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      is_public: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      execution_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      last_executed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false
      },
      updated_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Query execution history
    await queryInterface.createTable('query_executions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      query_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'saved_queries',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      query_content: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      parameters: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      execution_time_ms: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      rows_returned: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      success: {
        type: Sequelize.BOOLEAN,
        allowNull: false
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      executed_by: {
        type: Sequelize.UUID,
        allowNull: false
      },
      executed_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Database metadata cache
    await queryInterface.createTable('database_metadata', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      schema_name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      table_name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      column_name: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      data_type: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      is_nullable: {
        type: Sequelize.BOOLEAN,
        allowNull: true
      },
      column_default: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      ordinal_position: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      last_refreshed_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Indexes
    await queryInterface.addIndex('function_library', ['category_id']);
    await queryInterface.addIndex('function_library', ['name']);
    await queryInterface.addIndex('function_library', ['is_enabled']);
    await queryInterface.addIndex('function_library', ['tags'], { using: 'GIN' });

    await queryInterface.addIndex('saved_queries', ['application_id']);
    await queryInterface.addIndex('saved_queries', ['created_by']);
    await queryInterface.addIndex('saved_queries', ['query_type']);
    await queryInterface.addIndex('saved_queries', ['folder']);
    await queryInterface.addIndex('saved_queries', ['tags'], { using: 'GIN' });

    await queryInterface.addIndex('query_executions', ['query_id']);
    await queryInterface.addIndex('query_executions', ['executed_by']);
    await queryInterface.addIndex('query_executions', ['executed_at']);

    await queryInterface.addIndex('database_metadata', ['schema_name', 'table_name']);
    await queryInterface.addIndex('database_metadata', ['table_name']);
    await queryInterface.addIndex('database_metadata', ['column_name']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('database_metadata');
    await queryInterface.dropTable('query_executions');
    await queryInterface.dropTable('saved_queries');
    await queryInterface.dropTable('function_library');
    await queryInterface.dropTable('function_categories');
  }
};
