/**
 * Migration: Create Process Variables Table
 *
 * Variables scoped to specific process instances.
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('process_variables', {
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
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      data_type: {
        type: Sequelize.ENUM('string', 'number', 'boolean', 'date', 'object', 'array'),
        allowNull: false,
        defaultValue: 'string',
      },
      value: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Variable value',
      },
      scope: {
        type: Sequelize.ENUM('process', 'task'),
        allowNull: false,
        defaultValue: 'process',
      },
      task_id: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Task ID if task-scoped',
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
    await queryInterface.addIndex('process_variables', ['process_instance_id'], {
      name: 'process_variables_process_instance_id_idx',
    });

    await queryInterface.addIndex('process_variables', ['scope'], {
      name: 'process_variables_scope_idx',
    });

    await queryInterface.addIndex('process_variables', ['task_id'], {
      name: 'process_variables_task_id_idx',
    });

    // Unique constraint: variable name within process instance and scope
    await queryInterface.addIndex('process_variables', ['process_instance_id', 'name', 'scope', 'task_id'], {
      name: 'process_variables_unique_idx',
      unique: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('process_variables');
  }
};
