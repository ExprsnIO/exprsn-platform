/**
 * Migration: Create Data Sources Table
 *
 * Data sources represent connections to various data systems.
 * Supports PostgreSQL, Forge, REST APIs, SOAP, files (JSON, XML, CSV, TSV), etc.
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('data_sources', {
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
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      display_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      source_type: {
        type: Sequelize.ENUM(
          'postgresql',
          'forge',
          'rest',
          'soap',
          'webhook',
          'json',
          'xml',
          'csv',
          'tsv'
        ),
        allowNull: false,
      },
      connection_config: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: 'Connection configuration (host, port, credentials, etc.)',
      },
      schema_config: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Schema mappings and transformations',
      },
      operations: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {
          read: true,
          create: false,
          update: false,
          delete: false,
        },
        comment: 'Allowed operations on this data source',
      },
      delegable: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether operations can be delegated to the server (Power Apps concept)',
      },
      cache_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      cache_ttl: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Cache TTL in seconds',
      },
      timeout: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 30000,
        comment: 'Connection timeout in milliseconds',
      },
      retry_config: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {
          enabled: false,
          maxRetries: 3,
          backoffMs: 1000,
        },
      },
      auth_config: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Authentication configuration (encrypted)',
      },
      headers: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Default headers for REST/SOAP requests',
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive', 'error'),
        allowNull: false,
        defaultValue: 'active',
      },
      last_tested_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      last_test_result: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Result of last connection test',
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
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
      },
    });

    // Add indexes
    await queryInterface.addIndex('data_sources', ['application_id'], {
      name: 'data_sources_application_id_idx',
    });

    await queryInterface.addIndex('data_sources', ['source_type'], {
      name: 'data_sources_source_type_idx',
    });

    await queryInterface.addIndex('data_sources', ['status'], {
      name: 'data_sources_status_idx',
    });

    // Unique constraint: data source name within application
    await queryInterface.addIndex('data_sources', ['application_id', 'name'], {
      name: 'data_sources_app_name_unique',
      unique: true,
      where: {
        deleted_at: null,
      },
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('data_sources');
  }
};
