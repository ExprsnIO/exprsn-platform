/**
 * Migration: Create Schema Manager Tables
 *
 * Creates tables for the Schema Manager module:
 * - forge_schemas: Store JSON Schema definitions
 * - forge_schema_versions: Track schema version history
 * - forge_schema_dependencies: Track dependencies between schemas
 * - forge_migrations: Track database migrations
 * - forge_schema_changes: Audit log for schema changes
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create forge_schemas table
    await queryInterface.createTable('forge_schemas', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      model_id: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'Unique identifier for the model (e.g., Customer, Invoice)'
      },
      version: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'Semantic version (e.g., 1.0.0, 2.1.3)'
      },
      name: {
        type: Sequelize.STRING(200),
        allowNull: false,
        comment: 'Human-readable name of the model'
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Description of the model purpose and usage'
      },
      table_name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'PostgreSQL table name for this model'
      },
      schema_definition: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: 'Extended JSON Schema with database, ui, validation, and workflow sections'
      },
      status: {
        type: Sequelize.ENUM('draft', 'active', 'deprecated', 'archived'),
        allowNull: false,
        defaultValue: 'draft',
        comment: 'Current status of the schema'
      },
      is_system: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'System schemas cannot be deleted or modified by users'
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Additional metadata (tags, categories, etc.)'
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'User who created this schema'
      },
      activated_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the schema was activated'
      },
      deprecated_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the schema was deprecated'
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

    // Add indexes for forge_schemas
    await queryInterface.addIndex('forge_schemas', ['model_id', 'version'], {
      unique: true,
      name: 'forge_schemas_model_id_version_unique'
    });
    await queryInterface.addIndex('forge_schemas', ['model_id']);
    await queryInterface.addIndex('forge_schemas', ['status']);
    await queryInterface.addIndex('forge_schemas', ['table_name']);
    await queryInterface.addIndex('forge_schemas', ['created_by']);
    await queryInterface.addIndex('forge_schemas', ['created_at']);
    await queryInterface.addIndex('forge_schemas', ['is_system']);
    await queryInterface.addIndex('forge_schemas', ['schema_definition'], {
      using: 'GIN',
      name: 'forge_schemas_schema_definition_gin'
    });
    await queryInterface.addIndex('forge_schemas', ['metadata'], {
      using: 'GIN',
      name: 'forge_schemas_metadata_gin'
    });

    // Create forge_schema_versions table
    await queryInterface.createTable('forge_schema_versions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      schema_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'forge_schemas',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Reference to the schema'
      },
      version_number: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Sequential version number (1, 2, 3, ...)'
      },
      previous_version_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'forge_schema_versions',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Reference to the previous version'
      },
      schema_definition: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: 'Schema definition at this version'
      },
      change_summary: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Summary of changes in this version'
      },
      changes: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Detailed changelog'
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'User who created this version'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add indexes for forge_schema_versions
    await queryInterface.addIndex('forge_schema_versions', ['schema_id']);
    await queryInterface.addIndex('forge_schema_versions', ['schema_id', 'version_number'], {
      unique: true,
      name: 'forge_schema_versions_schema_version_unique'
    });
    await queryInterface.addIndex('forge_schema_versions', ['previous_version_id']);
    await queryInterface.addIndex('forge_schema_versions', ['created_at']);

    // Create forge_schema_dependencies table
    await queryInterface.createTable('forge_schema_dependencies', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      schema_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'forge_schemas',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Schema that has the dependency'
      },
      depends_on_schema_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'forge_schemas',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Schema that is depended upon'
      },
      dependency_type: {
        type: Sequelize.ENUM('foreign_key', 'reference', 'extends', 'allOf', 'anyOf', 'oneOf', 'not'),
        allowNull: false,
        defaultValue: 'reference',
        comment: 'Type of dependency relationship'
      },
      field_path: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: 'JSON path to the field with the dependency (e.g., "properties.customerId")'
      },
      is_required: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether the dependency is required'
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Additional dependency metadata'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add indexes for forge_schema_dependencies
    await queryInterface.addIndex('forge_schema_dependencies', ['schema_id']);
    await queryInterface.addIndex('forge_schema_dependencies', ['depends_on_schema_id']);
    await queryInterface.addIndex('forge_schema_dependencies', ['schema_id', 'depends_on_schema_id'], {
      unique: true,
      name: 'forge_schema_deps_unique'
    });
    await queryInterface.addIndex('forge_schema_dependencies', ['dependency_type']);

    // Create forge_migrations table
    await queryInterface.createTable('forge_migrations', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      from_schema_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'forge_schemas',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Source schema (null for initial migration)'
      },
      to_schema_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'forge_schemas',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Target schema'
      },
      migration_type: {
        type: Sequelize.ENUM('create', 'alter', 'drop', 'data'),
        allowNull: false,
        comment: 'Type of migration operation'
      },
      migration_sql: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'SQL statements to apply the migration'
      },
      rollback_sql: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'SQL statements to rollback the migration'
      },
      status: {
        type: Sequelize.ENUM('pending', 'running', 'completed', 'failed', 'rolled_back'),
        allowNull: false,
        defaultValue: 'pending',
        comment: 'Current status of the migration'
      },
      executed_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the migration was executed'
      },
      execution_time_ms: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Execution time in milliseconds'
      },
      executed_by: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'User who executed the migration'
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Error message if migration failed'
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Additional migration metadata'
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

    // Add indexes for forge_migrations
    await queryInterface.addIndex('forge_migrations', ['from_schema_id']);
    await queryInterface.addIndex('forge_migrations', ['to_schema_id']);
    await queryInterface.addIndex('forge_migrations', ['status']);
    await queryInterface.addIndex('forge_migrations', ['created_at']);
    await queryInterface.addIndex('forge_migrations', ['executed_at']);
    await queryInterface.addIndex('forge_migrations', ['migration_type']);

    // Create forge_schema_changes table
    await queryInterface.createTable('forge_schema_changes', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      schema_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'forge_schemas',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Schema that was changed'
      },
      change_type: {
        type: Sequelize.ENUM('created', 'updated', 'activated', 'deprecated', 'archived', 'deleted'),
        allowNull: false,
        comment: 'Type of change'
      },
      field_changed: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Specific field that was changed (for updates)'
      },
      old_value: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Previous value (for updates)'
      },
      new_value: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'New value (for updates)'
      },
      change_summary: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Summary of the change'
      },
      changed_by: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'User who made the change'
      },
      ip_address: {
        type: Sequelize.STRING(45),
        allowNull: true,
        comment: 'IP address of the user'
      },
      user_agent: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'User agent string'
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Additional change metadata'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add indexes for forge_schema_changes
    await queryInterface.addIndex('forge_schema_changes', ['schema_id']);
    await queryInterface.addIndex('forge_schema_changes', ['change_type']);
    await queryInterface.addIndex('forge_schema_changes', ['changed_by']);
    await queryInterface.addIndex('forge_schema_changes', ['created_at']);
    await queryInterface.addIndex('forge_schema_changes', ['field_changed']);
  },

  down: async (queryInterface, Sequelize) => {
    // Drop tables in reverse order (respecting foreign key constraints)
    await queryInterface.dropTable('forge_schema_changes');
    await queryInterface.dropTable('forge_migrations');
    await queryInterface.dropTable('forge_schema_dependencies');
    await queryInterface.dropTable('forge_schema_versions');
    await queryInterface.dropTable('forge_schemas');
  }
};
