/**
 * Migration: Create Scheduled Automations Table
 *
 * Scheduled (cron-based) automations.
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('scheduled_automations', {
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
      schedule: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Cron expression (e.g., "0 9 * * 1-5")',
      },
      timezone: {
        type: Sequelize.STRING(100),
        allowNull: false,
        defaultValue: 'UTC',
      },
      action_type: {
        type: Sequelize.ENUM('process', 'workflow', 'script', 'webhook', 'notification'),
        allowNull: false,
      },
      action_config: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: 'Action configuration (process_id, script, etc.)',
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      last_run_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      last_run_status: {
        type: Sequelize.ENUM('success', 'failed', 'skipped'),
        allowNull: true,
      },
      last_run_result: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      next_run_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      execution_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      failure_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
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
    await queryInterface.addIndex('scheduled_automations', ['application_id'], {
      name: 'scheduled_automations_application_id_idx',
    });

    await queryInterface.addIndex('scheduled_automations', ['enabled'], {
      name: 'scheduled_automations_enabled_idx',
    });

    await queryInterface.addIndex('scheduled_automations', ['next_run_at'], {
      name: 'scheduled_automations_next_run_at_idx',
    });

    await queryInterface.addIndex('scheduled_automations', ['last_run_at'], {
      name: 'scheduled_automations_last_run_at_idx',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('scheduled_automations');
  }
};
