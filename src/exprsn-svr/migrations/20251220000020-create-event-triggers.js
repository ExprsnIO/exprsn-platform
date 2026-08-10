/**
 * Migration: Create Event Triggers Table
 *
 * Event-driven automation triggers (form submit, record create, etc.).
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('event_triggers', {
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
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      event_type: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'Event type (form.submit, entity.create, etc.)',
      },
      event_source: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Specific source (form_id, entity_id, etc.)',
      },
      conditions: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Conditions that must be met to trigger',
      },
      action_type: {
        type: Sequelize.ENUM('process', 'workflow', 'script', 'webhook', 'notification'),
        allowNull: false,
      },
      action_config: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: 'Action configuration',
      },
      async: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Execute asynchronously',
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      execution_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      last_triggered_at: {
        type: Sequelize.DATE,
        allowNull: true,
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
    await queryInterface.addIndex('event_triggers', ['application_id'], {
      name: 'event_triggers_application_id_idx',
    });

    await queryInterface.addIndex('event_triggers', ['event_type'], {
      name: 'event_triggers_event_type_idx',
    });

    await queryInterface.addIndex('event_triggers', ['event_source'], {
      name: 'event_triggers_event_source_idx',
    });

    await queryInterface.addIndex('event_triggers', ['enabled'], {
      name: 'event_triggers_enabled_idx',
    });

    // Composite index for event lookups
    await queryInterface.addIndex('event_triggers', ['event_type', 'event_source', 'enabled'], {
      name: 'event_triggers_lookup_idx',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('event_triggers');
  }
};
