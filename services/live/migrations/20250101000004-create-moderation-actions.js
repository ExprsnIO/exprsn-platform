/**
 * Migration: Create moderation_actions table
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('moderation_actions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      stream_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'streams',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      event_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'events',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      moderator_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      target_user_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      action_type: {
        type: Sequelize.ENUM(
          'ban_user',
          'timeout_user',
          'delete_message',
          'block_word',
          'enable_slow_mode',
          'disable_slow_mode',
          'enable_followers_only',
          'disable_followers_only',
          'pin_message',
          'unpin_message',
          'add_moderator',
          'remove_moderator',
          'clear_chat',
          'enable_emote_only',
          'disable_emote_only'
        ),
        allowNull: false
      },
      reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      duration_seconds: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      is_automated: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      automation_rule: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      message_content: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
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
    await queryInterface.addIndex('moderation_actions', ['stream_id']);
    await queryInterface.addIndex('moderation_actions', ['event_id']);
    await queryInterface.addIndex('moderation_actions', ['moderator_id']);
    await queryInterface.addIndex('moderation_actions', ['target_user_id']);
    await queryInterface.addIndex('moderation_actions', ['action_type']);
    await queryInterface.addIndex('moderation_actions', ['is_automated']);
    await queryInterface.addIndex('moderation_actions', ['is_active']);
    await queryInterface.addIndex('moderation_actions', ['expires_at']);
    await queryInterface.addIndex('moderation_actions', ['created_at']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('moderation_actions');
  }
};
