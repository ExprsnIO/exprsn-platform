/**
 * Migration: Create timeline_segments table
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('timeline_segments', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      event_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'events',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      segment_type: {
        type: Sequelize.ENUM(
          'intro',
          'main_content',
          'break',
          'qa_session',
          'outro',
          'chapter',
          'advertisement',
          'custom'
        ),
        defaultValue: 'main_content',
        allowNull: false
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      order_index: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      start_time_ms: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      end_time_ms: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      duration_ms: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      source_video_url: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      source_start_ms: {
        type: Sequelize.BIGINT,
        defaultValue: 0
      },
      source_end_ms: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      is_skippable: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      thumbnail_url: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      transitions: {
        type: Sequelize.JSONB,
        defaultValue: {
          in: { type: 'none', duration_ms: 0 },
          out: { type: 'none', duration_ms: 0 }
        }
      },
      audio_settings: {
        type: Sequelize.JSONB,
        defaultValue: {
          volume: 1.0,
          fade_in_ms: 0,
          fade_out_ms: 0,
          muted: false
        }
      },
      overlays: {
        type: Sequelize.JSONB,
        defaultValue: []
      },
      markers: {
        type: Sequelize.JSONB,
        defaultValue: []
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
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
    await queryInterface.addIndex('timeline_segments', ['event_id']);
    await queryInterface.addIndex('timeline_segments', ['user_id']);
    await queryInterface.addIndex('timeline_segments', ['segment_type']);
    await queryInterface.addIndex('timeline_segments', ['order_index']);
    await queryInterface.addIndex('timeline_segments', ['event_id', 'order_index']);
    await queryInterface.addIndex('timeline_segments', ['created_at']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('timeline_segments');
  }
};
