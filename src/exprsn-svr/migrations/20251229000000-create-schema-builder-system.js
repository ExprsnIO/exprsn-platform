/**
 * ═══════════════════════════════════════════════════════════
 * Schema Builder System Migration
 * Complete visual schema designer with relationships, indexes, and materialized views
 * ═══════════════════════════════════════════════════════════
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Schema Definitions Table
    await queryInterface.createTable('schema_definitions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      slug: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      description: {
        type: Sequelize.TEXT
      },
      database_name: {
        type: Sequelize.STRING,
        comment: 'Target database name'
      },
      schema_name: {
        type: Sequelize.STRING,
        defaultValue: 'public',
        comment: 'PostgreSQL schema name'
      },
      version: {
        type: Sequelize.STRING,
        defaultValue: '1.0.0'
      },
      status: {
        type: Sequelize.ENUM('draft', 'active', 'deprecated', 'archived'),
        defaultValue: 'draft'
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      created_by: {
        type: Sequelize.UUID
      },
      updated_by: {
        type: Sequelize.UUID
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      deleted_at: {
        type: Sequelize.DATE
      }
    });

    // Tables (Entities) in Schema
    await queryInterface.createTable('schema_tables', {
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
        comment: 'Table name (snake_case)'
      },
      display_name: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Human-readable name'
      },
      description: {
        type: Sequelize.TEXT
      },
      table_type: {
        type: Sequelize.ENUM('table', 'view', 'materialized_view', 'junction'),
        defaultValue: 'table'
      },
      is_temporal: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: 'Enable temporal (time-travel) features'
      },
      is_soft_delete: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: 'Use soft deletes (deleted_at)'
      },
      is_audited: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: 'Track all changes in audit log'
      },
      row_level_security: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: 'Enable PostgreSQL RLS'
      },
      position_x: {
        type: Sequelize.INTEGER,
        comment: 'X position in visual designer'
      },
      position_y: {
        type: Sequelize.INTEGER,
        comment: 'Y position in visual designer'
      },
      color: {
        type: Sequelize.STRING,
        comment: 'Display color in visual designer'
      },
      icon: {
        type: Sequelize.STRING,
        comment: 'Icon class for visual designer'
      },
      options: {
        type: Sequelize.JSONB,
        defaultValue: {},
        comment: 'Additional table options (partitioning, inheritance, etc.)'
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

    // Columns (Fields) in Tables
    await queryInterface.createTable('schema_columns', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
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
      name: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Column name (snake_case)'
      },
      display_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT
      },
      data_type: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'PostgreSQL data type (INTEGER, VARCHAR, UUID, JSONB, etc.)'
      },
      length: {
        type: Sequelize.INTEGER,
        comment: 'For VARCHAR, CHAR'
      },
      precision: {
        type: Sequelize.INTEGER,
        comment: 'For DECIMAL, NUMERIC'
      },
      scale: {
        type: Sequelize.INTEGER,
        comment: 'For DECIMAL, NUMERIC'
      },
      is_primary_key: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      is_nullable: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      is_unique: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      is_auto_increment: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      default_value: {
        type: Sequelize.TEXT,
        comment: 'Default value expression'
      },
      check_constraint: {
        type: Sequelize.TEXT,
        comment: 'CHECK constraint SQL'
      },
      is_generated: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: 'Generated/computed column'
      },
      generation_expression: {
        type: Sequelize.TEXT,
        comment: 'SQL expression for generated columns'
      },
      collation: {
        type: Sequelize.STRING,
        comment: 'Collation for text columns'
      },
      position: {
        type: Sequelize.INTEGER,
        comment: 'Column order in table'
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {},
        comment: 'UI hints, validation rules, etc.'
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

    // Relationships (Foreign Keys)
    await queryInterface.createTable('schema_relationships', {
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
        comment: 'Relationship name'
      },
      source_table_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'schema_tables',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      source_column_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'schema_columns',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      target_table_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'schema_tables',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      target_column_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'schema_columns',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      relationship_type: {
        type: Sequelize.ENUM('one_to_one', 'one_to_many', 'many_to_one', 'many_to_many'),
        allowNull: false
      },
      on_delete: {
        type: Sequelize.ENUM('CASCADE', 'SET NULL', 'SET DEFAULT', 'RESTRICT', 'NO ACTION'),
        defaultValue: 'CASCADE'
      },
      on_update: {
        type: Sequelize.ENUM('CASCADE', 'SET NULL', 'SET DEFAULT', 'RESTRICT', 'NO ACTION'),
        defaultValue: 'CASCADE'
      },
      junction_table_id: {
        type: Sequelize.UUID,
        references: {
          model: 'schema_tables',
          key: 'id'
        },
        comment: 'For many-to-many relationships'
      },
      display_label: {
        type: Sequelize.STRING,
        comment: 'Label for UI (e.g., "Orders", "Customer")'
      },
      is_required: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
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

    // Indexes
    await queryInterface.createTable('schema_indexes', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
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
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      index_type: {
        type: Sequelize.ENUM('btree', 'hash', 'gist', 'gin', 'brin', 'spgist'),
        defaultValue: 'btree'
      },
      columns: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        allowNull: false,
        comment: 'Array of column IDs'
      },
      is_unique: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      is_primary: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      where_clause: {
        type: Sequelize.TEXT,
        comment: 'Partial index WHERE clause'
      },
      include_columns: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        comment: 'INCLUDE columns for covering index'
      },
      storage_parameters: {
        type: Sequelize.JSONB,
        comment: 'Index storage options (fillfactor, etc.)'
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

    // Materialized Views
    await queryInterface.createTable('schema_materialized_views', {
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
        allowNull: false
      },
      display_name: {
        type: Sequelize.STRING
      },
      description: {
        type: Sequelize.TEXT
      },
      query_sql: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'SELECT query for materialized view'
      },
      refresh_strategy: {
        type: Sequelize.ENUM('manual', 'on_commit', 'scheduled', 'incremental'),
        defaultValue: 'manual'
      },
      refresh_schedule: {
        type: Sequelize.STRING,
        comment: 'Cron expression for scheduled refresh'
      },
      with_data: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: 'Create WITH DATA or WITH NO DATA'
      },
      storage_parameters: {
        type: Sequelize.JSONB,
        comment: 'Storage parameters'
      },
      last_refreshed_at: {
        type: Sequelize.DATE
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

    // Schema Change Log (Audit Trail)
    await queryInterface.createTable('schema_change_log', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      schema_id: {
        type: Sequelize.UUID,
        references: {
          model: 'schema_definitions',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      entity_type: {
        type: Sequelize.ENUM('schema', 'table', 'column', 'relationship', 'index', 'materialized_view'),
        allowNull: false
      },
      entity_id: {
        type: Sequelize.UUID,
        comment: 'ID of the changed entity'
      },
      action: {
        type: Sequelize.ENUM('create', 'update', 'delete', 'deploy', 'rollback'),
        allowNull: false
      },
      before_state: {
        type: Sequelize.JSONB,
        comment: 'State before change'
      },
      after_state: {
        type: Sequelize.JSONB,
        comment: 'State after change'
      },
      changed_by: {
        type: Sequelize.UUID
      },
      change_description: {
        type: Sequelize.TEXT
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Schema Migrations (Generated DDL)
    await queryInterface.createTable('schema_migrations', {
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
      version: {
        type: Sequelize.STRING,
        allowNull: false
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      up_sql: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'SQL to apply migration'
      },
      down_sql: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'SQL to rollback migration'
      },
      status: {
        type: Sequelize.ENUM('pending', 'applied', 'rolled_back', 'failed'),
        defaultValue: 'pending'
      },
      applied_at: {
        type: Sequelize.DATE
      },
      rolled_back_at: {
        type: Sequelize.DATE
      },
      error_message: {
        type: Sequelize.TEXT
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
    await queryInterface.addIndex('schema_definitions', ['slug']);
    await queryInterface.addIndex('schema_definitions', ['status']);
    await queryInterface.addIndex('schema_tables', ['schema_id']);
    await queryInterface.addIndex('schema_tables', ['name']);
    await queryInterface.addIndex('schema_columns', ['table_id']);
    await queryInterface.addIndex('schema_columns', ['name']);
    await queryInterface.addIndex('schema_relationships', ['schema_id']);
    await queryInterface.addIndex('schema_relationships', ['source_table_id']);
    await queryInterface.addIndex('schema_relationships', ['target_table_id']);
    await queryInterface.addIndex('schema_indexes', ['table_id']);
    await queryInterface.addIndex('schema_materialized_views', ['schema_id']);
    await queryInterface.addIndex('schema_change_log', ['schema_id', 'created_at']);
    await queryInterface.addIndex('schema_migrations', ['schema_id', 'version']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('schema_migrations');
    await queryInterface.dropTable('schema_change_log');
    await queryInterface.dropTable('schema_materialized_views');
    await queryInterface.dropTable('schema_indexes');
    await queryInterface.dropTable('schema_relationships');
    await queryInterface.dropTable('schema_columns');
    await queryInterface.dropTable('schema_tables');
    await queryInterface.dropTable('schema_definitions');
  }
};
