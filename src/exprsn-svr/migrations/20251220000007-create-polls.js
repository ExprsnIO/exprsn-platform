/**
 * Migration: Create Polls Table
 *
 * Polls allow users to create surveys and voting mechanisms within applications.
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('polls', {
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
      form_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'app_forms',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Associated form (if embedded in a form)',
      },
      creator_id: {
        type: Sequelize.UUID,
        allowNull: false,
        comment: 'User ID of poll creator',
      },
      question: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      poll_type: {
        type: Sequelize.ENUM('single-choice', 'multiple-choice', 'rating', 'ranking'),
        allowNull: false,
        defaultValue: 'single-choice',
      },
      options: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: 'Poll options/choices',
      },
      settings: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {
          allowAnonymous: true,
          allowMultipleResponses: false,
          showResults: 'after-vote',
          requireComment: false,
        },
      },
      start_date: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      end_date: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('draft', 'active', 'closed', 'archived'),
        allowNull: false,
        defaultValue: 'draft',
      },
      response_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      results: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Aggregated poll results',
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
    await queryInterface.addIndex('polls', ['application_id'], {
      name: 'polls_application_id_idx',
    });

    await queryInterface.addIndex('polls', ['form_id'], {
      name: 'polls_form_id_idx',
    });

    await queryInterface.addIndex('polls', ['creator_id'], {
      name: 'polls_creator_id_idx',
    });

    await queryInterface.addIndex('polls', ['status'], {
      name: 'polls_status_idx',
    });

    await queryInterface.addIndex('polls', ['start_date', 'end_date'], {
      name: 'polls_date_range_idx',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('polls');
  }
};
