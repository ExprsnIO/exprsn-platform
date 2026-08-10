/**
 * Migration: Create stream_destinations table
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('stream_destinations', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      stream_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'streams',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      platform: {
        type: Sequelize.ENUM(
          'youtube',
          'twitch',
          'facebook',
          'twitter',
          'linkedin',
          'srs',
          'rtmp_custom',
          'cloudflare'
        ),
        allowNull: false
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      is_enabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      status: {
        type: Sequelize.ENUM('pending', 'connecting', 'live', 'error', 'disconnected'),
        defaultValue: 'pending',
        allowNull: false
      },
      rtmp_url: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      stream_key: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      platform_stream_id: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      access_token: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      refresh_token: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      token_expires_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      playback_url: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      viewer_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      ended_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      retry_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      last_retry_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      settings: {
        type: Sequelize.JSONB,
        defaultValue: {
          bitrate: 4500,
          resolution: '1920x1080',
          framerate: 30,
          auto_start: false,
          auto_reconnect: true,
          max_retries: 3
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
    await queryInterface.addIndex('stream_destinations', ['stream_id']);
    await queryInterface.addIndex('stream_destinations', ['user_id']);
    await queryInterface.addIndex('stream_destinations', ['platform']);
    await queryInterface.addIndex('stream_destinations', ['status']);
    await queryInterface.addIndex('stream_destinations', ['is_enabled']);
    await queryInterface.addIndex('stream_destinations', ['created_at']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('stream_destinations');
  }
};
