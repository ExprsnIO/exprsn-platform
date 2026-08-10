/**
 * Migration: Create Core Low-Code Platform Tables
 *
 * Creates all essential tables for the Low-Code Platform:
 * - applications: Container for low-code apps
 * - entities: Database schema definitions
 * - forms: Form definitions
 * - grids: Grid/table view definitions
 * - data_sources: External data connections
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Applications table
    await queryInterface.createTable('applications', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
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
      },
      version: {
        type: Sequelize.STRING(50),
        defaultValue: '1.0.0',
      },
      status: {
        type: Sequelize.STRING(50),
        defaultValue: 'draft',
      },
      owner_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      icon: {
        type: Sequelize.STRING(255),
      },
      color: {
        type: Sequelize.STRING(50),
      },
      settings: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },
      git_repository: {
        type: Sequelize.STRING(500),
      },
      git_branch: {
        type: Sequelize.STRING(255),
      },
      published_version: {
        type: Sequelize.STRING(50),
      },
      published_at: {
        type: Sequelize.DATE,
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
      },
    });

    await queryInterface.addIndex('applications', ['owner_id']);
    await queryInterface.addIndex('applications', ['status']);
    await queryInterface.addConstraint('applications', {
      fields: ['name', 'owner_id'],
      type: 'unique',
      name: 'applications_name_owner_unique',
    });

    console.log('✅ Created applications table');

    // Entities table
    await queryInterface.createTable('entities', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      application_id: {
        type: Sequelize.UUID,
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
      table_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      display_name: {
        type: Sequelize.STRING(255),
      },
      description: {
        type: Sequelize.TEXT,
      },
      icon: {
        type: Sequelize.STRING(100),
      },
      schema: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      migrations: {
        type: Sequelize.JSONB,
        defaultValue: [],
      },
      version: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
      },
      locked: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      locked_by: {
        type: Sequelize.UUID,
      },
      locked_at: {
        type: Sequelize.DATE,
      },
      created_by: {
        type: Sequelize.UUID,
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
    });

    await queryInterface.addIndex('entities', ['application_id']);
    await queryInterface.addConstraint('entities', {
      fields: ['application_id', 'name'],
      type: 'unique',
      name: 'entities_app_name_unique',
    });

    console.log('✅ Created entities table');

    // Forms table
    await queryInterface.createTable('forms', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      application_id: {
        type: Sequelize.UUID,
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
      },
      description: {
        type: Sequelize.TEXT,
      },
      entity_id: {
        type: Sequelize.UUID,
        references: {
          model: 'entities',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      schema: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      layout: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },
      validation_rules: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },
      version: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
      },
      is_published: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      created_by: {
        type: Sequelize.UUID,
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
    });

    await queryInterface.addIndex('forms', ['application_id']);
    await queryInterface.addIndex('forms', ['entity_id']);

    console.log('✅ Created forms table');

    // Grids table
    await queryInterface.createTable('grids', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      application_id: {
        type: Sequelize.UUID,
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
      },
      description: {
        type: Sequelize.TEXT,
      },
      entity_id: {
        type: Sequelize.UUID,
        references: {
          model: 'entities',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      columns: {
        type: Sequelize.JSONB,
        defaultValue: [],
      },
      filters: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },
      sort_config: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },
      pagination_config: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },
      version: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
      },
      created_by: {
        type: Sequelize.UUID,
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
    });

    await queryInterface.addIndex('grids', ['application_id']);
    await queryInterface.addIndex('grids', ['entity_id']);

    console.log('✅ Created grids table');

    // Data Sources table
    await queryInterface.createTable('data_sources', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      application_id: {
        type: Sequelize.UUID,
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
      },
      type: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      connection_config: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      created_by: {
        type: Sequelize.UUID,
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
    });

    await queryInterface.addIndex('data_sources', ['application_id']);
    await queryInterface.addIndex('data_sources', ['type']);

    console.log('✅ Created data_sources table');
    console.log('\n🎉 All Low-Code core tables created successfully!');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('data_sources');
    await queryInterface.dropTable('grids');
    await queryInterface.dropTable('forms');
    await queryInterface.dropTable('entities');
    await queryInterface.dropTable('applications');
  },
};
