'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('event_attendees', {
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
      rsvp_status: {
        type: Sequelize.ENUM('going', 'maybe', 'not-going'),
        allowNull: false
      },
      guest_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      check_in_status: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      check_in_time: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      rsvp_at: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.BIGINT,
        allowNull: false
      }
    });

    // Add indexes
    await queryInterface.addIndex('event_attendees', ['event_id']);
    await queryInterface.addIndex('event_attendees', ['user_id']);
    await queryInterface.addIndex('event_attendees', ['event_id', 'user_id'], { unique: true });
    await queryInterface.addIndex('event_attendees', ['rsvp_status']);
    await queryInterface.addIndex('event_attendees', ['event_id', 'rsvp_status']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('event_attendees');
  }
};
