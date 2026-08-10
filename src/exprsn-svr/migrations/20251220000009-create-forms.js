/**
 * Migration: Create Forms Table
 *
 * Enhanced forms table for standalone electronic forms (separate from app_forms).
 * This table is for forms that can exist independently outside of applications.
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('forms', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      application_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'applications',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Optional application association',
      },
      app_form_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'app_forms',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Reference to app_forms template',
      },
      owner_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      title: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      form_definition: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: 'Complete form definition (schema, controls, logic)',
      },
      status: {
        type: Sequelize.ENUM('draft', 'published', 'archived'),
        allowNull: false,
        defaultValue: 'draft',
      },
      settings: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
      },
      permissions: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
      },
      submission_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
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
    await queryInterface.addIndex('forms', ['application_id'], {
      name: 'forms_application_id_idx',
    });

    await queryInterface.addIndex('forms', ['app_form_id'], {
      name: 'forms_app_form_id_idx',
    });

    await queryInterface.addIndex('forms', ['owner_id'], {
      name: 'forms_owner_id_idx',
    });

    await queryInterface.addIndex('forms', ['status'], {
      name: 'forms_status_idx',
    });

    await queryInterface.addIndex('forms', ['created_at'], {
      name: 'forms_created_at_idx',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('forms');
  }
};
