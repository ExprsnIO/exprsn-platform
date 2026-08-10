/**
 * Migration: Create Webhook Triggers Table
 *
 * Webhook endpoints for external systems to trigger automations.
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('webhook_triggers', {
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
      webhook_url: {
        type: Sequelize.STRING(500),
        allowNull: false,
        unique: true,
        comment: 'Unique webhook URL path',
      },
      secret: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: 'Webhook secret for signature verification',
      },
      allowed_methods: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: false,
        defaultValue: ['POST'],
        comment: 'Allowed HTTP methods',
      },
      allowed_ips: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        comment: 'IP whitelist (optional)',
      },
      action_type: {
        type: Sequelize.ENUM('process', 'workflow', 'script', 'notification'),
        allowNull: false,
      },
      action_config: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: 'Action configuration',
      },
      transform_payload: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'JavaScript code to transform incoming payload',
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      request_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      last_triggered_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      last_request: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Last request details (for debugging)',
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
    await queryInterface.addIndex('webhook_triggers', ['application_id'], {
      name: 'webhook_triggers_application_id_idx',
    });

    await queryInterface.addIndex('webhook_triggers', ['webhook_url'], {
      name: 'webhook_triggers_webhook_url_idx',
      unique: true,
    });

    await queryInterface.addIndex('webhook_triggers', ['enabled'], {
      name: 'webhook_triggers_enabled_idx',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('webhook_triggers');
  }
};
