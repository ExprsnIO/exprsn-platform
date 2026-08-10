/**
 * Migration: Create Process Instances Table
 *
 * Running instances of processes. Each instance represents one execution of a process.
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('process_instances', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      process_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'processes',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      parent_instance_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'process_instances',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Parent instance (for sub-processes)',
      },
      initiated_by: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'User ID who started the process',
      },
      initiated_from: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Source (form_id, event, webhook, etc.)',
      },
      status: {
        type: Sequelize.ENUM('pending', 'running', 'suspended', 'completed', 'failed', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
      },
      current_step: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Current step/task ID',
      },
      input_data: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Input parameters provided when starting the process',
      },
      output_data: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Output data when process completes',
      },
      context: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Process context variables',
      },
      error: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Error details if process failed',
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      duration_ms: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Total execution time in milliseconds',
      },
      retry_count: {
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
    });

    // Add indexes
    await queryInterface.addIndex('process_instances', ['process_id'], {
      name: 'process_instances_process_id_idx',
    });

    await queryInterface.addIndex('process_instances', ['parent_instance_id'], {
      name: 'process_instances_parent_instance_id_idx',
    });

    await queryInterface.addIndex('process_instances', ['initiated_by'], {
      name: 'process_instances_initiated_by_idx',
    });

    await queryInterface.addIndex('process_instances', ['status'], {
      name: 'process_instances_status_idx',
    });

    await queryInterface.addIndex('process_instances', ['started_at'], {
      name: 'process_instances_started_at_idx',
    });

    await queryInterface.addIndex('process_instances', ['completed_at'], {
      name: 'process_instances_completed_at_idx',
    });

    await queryInterface.addIndex('process_instances', ['current_step'], {
      name: 'process_instances_current_step_idx',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('process_instances');
  }
};
