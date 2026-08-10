/**
 * Migration: Create Poll Responses Table
 *
 * Records individual responses to polls.
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('poll_responses', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      poll_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'polls',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'User ID (null for anonymous responses)',
      },
      selected_options: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: 'Selected option IDs or values',
      },
      comment: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Additional metadata (IP, user agent, etc.)',
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
    await queryInterface.addIndex('poll_responses', ['poll_id'], {
      name: 'poll_responses_poll_id_idx',
    });

    await queryInterface.addIndex('poll_responses', ['user_id'], {
      name: 'poll_responses_user_id_idx',
    });

    await queryInterface.addIndex('poll_responses', ['created_at'], {
      name: 'poll_responses_created_at_idx',
    });

    // Unique constraint: one response per user per poll (if not allowing multiple)
    await queryInterface.addIndex('poll_responses', ['poll_id', 'user_id'], {
      name: 'poll_responses_poll_user_idx',
      unique: false, // Set to true if enforcing one response per user
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('poll_responses');
  }
};
