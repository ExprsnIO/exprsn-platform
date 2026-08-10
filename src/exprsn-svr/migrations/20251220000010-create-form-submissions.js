/**
 * Migration: Create Form Submissions Table
 *
 * Stores submitted form data from users.
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('form_submissions', {
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
        onDelete: 'SET NULL',
        comment: 'Direct reference to app_form if not using forms table',
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'User ID (null for anonymous submissions)',
      },
      submission_data: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: 'Submitted form data',
      },
      attachments: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'File attachments',
      },
      status: {
        type: Sequelize.ENUM('submitted', 'processing', 'completed', 'rejected', 'archived'),
        allowNull: false,
        defaultValue: 'submitted',
      },
      ip_address: {
        type: Sequelize.STRING(45),
        allowNull: true,
      },
      user_agent: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      validation_errors: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Validation errors if any',
      },
      workflow_instance_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Associated workflow instance (if triggered)',
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
    await queryInterface.addIndex('form_submissions', ['form_id'], {
      name: 'form_submissions_form_id_idx',
    });

    await queryInterface.addIndex('form_submissions', ['app_form_id'], {
      name: 'form_submissions_app_form_id_idx',
    });

    await queryInterface.addIndex('form_submissions', ['user_id'], {
      name: 'form_submissions_user_id_idx',
    });

    await queryInterface.addIndex('form_submissions', ['status'], {
      name: 'form_submissions_status_idx',
    });

    await queryInterface.addIndex('form_submissions', ['created_at'], {
      name: 'form_submissions_created_at_idx',
    });

    await queryInterface.addIndex('form_submissions', ['workflow_instance_id'], {
      name: 'form_submissions_workflow_instance_id_idx',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('form_submissions');
  }
};
