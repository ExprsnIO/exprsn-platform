/**
 * Migration: Create Form Drafts Table
 *
 * Stores draft (unsubmitted) form data for auto-save functionality.
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('form_drafts', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      form_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'forms',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      app_form_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'app_forms',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      draft_data: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: 'Draft form data',
      },
      version: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: 'Draft version number',
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Expiration date for auto-cleanup',
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
    });

    // Add indexes
    await queryInterface.addIndex('form_drafts', ['form_id'], {
      name: 'form_drafts_form_id_idx',
    });

    await queryInterface.addIndex('form_drafts', ['app_form_id'], {
      name: 'form_drafts_app_form_id_idx',
    });

    await queryInterface.addIndex('form_drafts', ['user_id'], {
      name: 'form_drafts_user_id_idx',
    });

    await queryInterface.addIndex('form_drafts', ['expires_at'], {
      name: 'form_drafts_expires_at_idx',
    });

    // Unique constraint: one draft per user per form
    await queryInterface.addIndex('form_drafts', ['form_id', 'user_id'], {
      name: 'form_drafts_form_user_unique',
      unique: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('form_drafts');
  }
};
