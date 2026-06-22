/**
 * Migration: Create events table
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('events', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        comment: 'User who created the event'
      },
      stream_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Associated live stream',
        references: {
          model: 'streams',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      event_type: {
        type: Sequelize.ENUM('live', 'pre_recorded', 'webinar', 'premiere'),
        defaultValue: 'live',
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('scheduled', 'live', 'ended', 'cancelled'),
        defaultValue: 'scheduled',
        allowNull: false
      },
      visibility: {
        type: Sequelize.ENUM('public', 'unlisted', 'private'),
        defaultValue: 'public',
        allowNull: false
      },
      scheduled_start_time: {
        type: Sequelize.DATE,
        allowNull: false
      },
      scheduled_end_time: {
        type: Sequelize.DATE,
        allowNull: true
      },
      actual_start_time: {
        type: Sequelize.DATE,
        allowNull: true
      },
      actual_end_time: {
        type: Sequelize.DATE,
        allowNull: true
      },
      duration_seconds: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      thumbnail_url: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      preview_video_url: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      recording_url: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      is_recording_enabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      allow_comments: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      allow_reactions: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      max_viewers: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      current_viewer_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      peak_viewer_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      total_views: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      category: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: []
      },
      language: {
        type: Sequelize.STRING(10),
        defaultValue: 'en'
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      moderation_settings: {
        type: Sequelize.JSONB,
        defaultValue: {
          auto_moderation: true,
          profanity_filter: true,
          spam_filter: true,
          link_filter: false,
          slow_mode: 0
        }
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
    await queryInterface.addIndex('events', ['user_id']);
    await queryInterface.addIndex('events', ['stream_id']);
    await queryInterface.addIndex('events', ['event_type']);
    await queryInterface.addIndex('events', ['status']);
    await queryInterface.addIndex('events', ['visibility']);
    await queryInterface.addIndex('events', ['scheduled_start_time']);
    await queryInterface.addIndex('events', ['category']);
    await queryInterface.addIndex('events', ['created_at']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('events');
  }
};
