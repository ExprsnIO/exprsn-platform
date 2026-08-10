/**
 * Migration: Create Process Tasks Table
 *
 * Individual task instances within a process execution.
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('process_tasks', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      process_instance_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'process_instances',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      task_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Task ID from process definition',
      },
      task_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      task_type: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'Task type (user, service, script, etc.)',
      },
      status: {
        type: Sequelize.ENUM('pending', 'running', 'completed', 'failed', 'skipped'),
        allowNull: false,
        defaultValue: 'pending',
      },
      assigned_to: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'User ID if user task',
      },
      input_data: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      output_data: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      error: {
        type: Sequelize.JSONB,
        allowNull: true,
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
    await queryInterface.addIndex('process_tasks', ['process_instance_id'], {
      name: 'process_tasks_process_instance_id_idx',
    });

    await queryInterface.addIndex('process_tasks', ['task_id'], {
      name: 'process_tasks_task_id_idx',
    });

    await queryInterface.addIndex('process_tasks', ['status'], {
      name: 'process_tasks_status_idx',
    });

    await queryInterface.addIndex('process_tasks', ['assigned_to'], {
      name: 'process_tasks_assigned_to_idx',
    });

    await queryInterface.addIndex('process_tasks', ['created_at'], {
      name: 'process_tasks_created_at_idx',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('process_tasks');
  }
};
