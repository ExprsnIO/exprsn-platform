/**
 * Migration: Create Queries Table
 *
 * Creates the queries table for storing visual and SQL query definitions.
 * Supports visual query builder state, raw SQL, JSONLex transformations, and caching.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('queries', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      application_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'applications',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Application this query belongs to',
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Machine-readable query name (alphanumeric with underscores)',
      },
      display_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Human-readable query name',
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Query description and purpose',
      },
      data_source_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'data_sources',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Data source to execute query against',
      },
      query_type: {
        type: Sequelize.ENUM('visual', 'sql', 'function', 'rest'),
        allowNull: false,
        defaultValue: 'visual',
        comment: 'Type of query: visual builder, raw SQL, function call, or REST API',
      },
      query_definition: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Visual query builder state (tables, joins, filters, grouping, sorting)',
      },
      raw_sql: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Raw SQL for sql type queries',
      },
      parameters: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Query parameters with names, types, and default values',
      },
      result_transform: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'JSONLex expression to transform query results',
      },
      cache_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether to cache query results',
      },
      cache_ttl: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Cache time-to-live in seconds',
      },
      timeout: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 30000,
        comment: 'Query execution timeout in milliseconds',
      },
      status: {
        type: Sequelize.ENUM('draft', 'active', 'inactive', 'deprecated'),
        allowNull: false,
        defaultValue: 'draft',
        comment: 'Query lifecycle status',
      },
      icon: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Icon identifier for UI display',
      },
      color: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Color code for UI display',
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Additional metadata (tags, category, permissions)',
      },
      last_executed_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Timestamp of last query execution',
      },
      execution_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Total number of times query has been executed',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Soft delete timestamp',
      },
    });

    // Create indexes for performance
    await queryInterface.addIndex('queries', ['application_id'], {
      name: 'idx_queries_application_id',
    });

    await queryInterface.addIndex('queries', ['data_source_id'], {
      name: 'idx_queries_data_source_id',
    });

    await queryInterface.addIndex('queries', ['status'], {
      name: 'idx_queries_status',
    });

    await queryInterface.addIndex('queries', ['query_type'], {
      name: 'idx_queries_query_type',
    });

    // Create unique constraint on name within application
    await queryInterface.addIndex('queries', ['name', 'application_id'], {
      unique: true,
      name: 'idx_queries_name_app_unique',
      where: {
        deleted_at: null, // Only enforce uniqueness for non-deleted records
      },
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('queries');
  },
};
