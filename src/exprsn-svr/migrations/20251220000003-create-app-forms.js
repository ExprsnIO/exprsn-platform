/**
 * Migration: Create App Forms Table
 *
 * Forms are the primary user interface for interacting with data.
 * This table stores form definitions with Power Apps-style architecture.
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('app_forms', {
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
      form_type: {
        type: Sequelize.ENUM('standard', 'wizard', 'dialog', 'card', 'list'),
        allowNull: false,
        defaultValue: 'standard',
      },
      layout: {
        type: Sequelize.ENUM('single-column', 'two-column', 'three-column', 'grid', 'custom'),
        allowNull: false,
        defaultValue: 'single-column',
      },
      screens: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Multi-screen forms (wizard steps)',
      },
      controls: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: 'Form controls (inputs, buttons, etc.)',
      },
      data_sources: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Data source connections',
      },
      collections: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'In-memory collections (Power Apps style)',
      },
      variables: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Form variables',
      },
      events: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Form-level events (onLoad, onSubmit, etc.)',
      },
      validation_rules: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Form validation rules',
      },
      background_services: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Background services (auto-save, debounce, etc.)',
      },
      theme: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Form theme and styling',
      },
      settings: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Form settings (responsive, accessibility, etc.)',
      },
      permissions: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Form-level permissions',
      },
      status: {
        type: Sequelize.ENUM('draft', 'published', 'archived'),
        allowNull: false,
        defaultValue: 'draft',
      },
      version: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: '1.0.0',
      },
      published_version: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      published_at: {
        type: Sequelize.DATE,
        allowNull: true,
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
    await queryInterface.addIndex('app_forms', ['application_id'], {
      name: 'app_forms_application_id_idx',
    });

    await queryInterface.addIndex('app_forms', ['status'], {
      name: 'app_forms_status_idx',
    });

    await queryInterface.addIndex('app_forms', ['form_type'], {
      name: 'app_forms_form_type_idx',
    });

    await queryInterface.addIndex('app_forms', ['created_at'], {
      name: 'app_forms_created_at_idx',
    });

    // Unique constraint: form name within application
    await queryInterface.addIndex('app_forms', ['application_id', 'name'], {
      name: 'app_forms_app_name_unique',
      unique: true,
      where: {
        deleted_at: null,
      },
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('app_forms');
  }
};
