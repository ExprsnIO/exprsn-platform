'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('events', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      group_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'groups',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      creator_id: {
        type: Sequelize.UUID,
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
      event_type: {
        type: Sequelize.ENUM('in-person', 'virtual', 'hybrid'),
        allowNull: false
      },
      location: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      virtual_url: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      start_time: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      end_time: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      timezone: {
        type: Sequelize.STRING(100),
        defaultValue: 'UTC'
      },
      max_attendees: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      attendee_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      rsvp_deadline: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      requires_approval: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      visibility: {
        type: Sequelize.ENUM('public', 'members-only', 'invite-only'),
        defaultValue: 'members-only'
      },
      cover_image_url: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: []
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      status: {
        type: Sequelize.ENUM('draft', 'published', 'cancelled', 'postponed', 'completed'),
        defaultValue: 'published'
      },
      cancelled_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      cancelled_at: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      created_at: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.BIGINT,
        allowNull: false
      }
    });

    // Add indexes
    await queryInterface.addIndex('events', ['group_id']);
    await queryInterface.addIndex('events', ['creator_id']);
    await queryInterface.addIndex('events', ['start_time']);
    await queryInterface.addIndex('events', ['status']);
    await queryInterface.addIndex('events', ['group_id', 'start_time']);
    await queryInterface.addIndex('events', ['group_id', 'status']);
    await queryInterface.addIndex('events', ['tags'], { using: 'gin' });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('events');
  }
};
