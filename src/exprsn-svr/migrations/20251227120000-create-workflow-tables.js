'use strict';

/**
 * Workflow System Migration
 * Creates all necessary tables for the workflow automation engine
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create workflows table
    await queryInterface.createTable('workflows', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT
      },
      trigger_type: {
        type: Sequelize.ENUM('manual', 'scheduled', 'webhook', 'event'),
        allowNull: false,
        defaultValue: 'manual'
      },
      trigger_config: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      steps: {
        type: Sequelize.JSONB,
        defaultValue: [],
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive', 'draft'),
        defaultValue: 'draft'
      },
      version: {
        type: Sequelize.INTEGER,
        defaultValue: 1
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      created_by: {
        type: Sequelize.UUID
      },
      updated_by: {
        type: Sequelize.UUID
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

    // Create workflow_executions table
    await queryInterface.createTable('workflow_executions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      workflow_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'workflows',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      trigger_type: {
        type: Sequelize.STRING
      },
      trigger_data: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      status: {
        type: Sequelize.ENUM('pending', 'running', 'completed', 'failed', 'cancelled'),
        defaultValue: 'pending'
      },
      current_step: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      context: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      result: {
        type: Sequelize.JSONB
      },
      error: {
        type: Sequelize.TEXT
      },
      started_at: {
        type: Sequelize.DATE
      },
      completed_at: {
        type: Sequelize.DATE
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

    // Create workflow_step_logs table
    await queryInterface.createTable('workflow_step_logs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      execution_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'workflow_executions',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      step_index: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      step_type: {
        type: Sequelize.STRING,
        allowNull: false
      },
      step_config: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      status: {
        type: Sequelize.ENUM('pending', 'running', 'completed', 'failed', 'skipped'),
        defaultValue: 'pending'
      },
      input: {
        type: Sequelize.JSONB
      },
      output: {
        type: Sequelize.JSONB
      },
      error: {
        type: Sequelize.TEXT
      },
      started_at: {
        type: Sequelize.DATE
      },
      completed_at: {
        type: Sequelize.DATE
      },
      duration_ms: {
        type: Sequelize.INTEGER
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

    // Create workflow_schedules table
    await queryInterface.createTable('workflow_schedules', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      workflow_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'workflows',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      cron_expression: {
        type: Sequelize.STRING,
        allowNull: false
      },
      timezone: {
        type: Sequelize.STRING,
        defaultValue: 'UTC'
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      last_run_at: {
        type: Sequelize.DATE
      },
      next_run_at: {
        type: Sequelize.DATE
      },
      run_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
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

    // Create workflow_templates table
    await queryInterface.createTable('workflow_templates', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT
      },
      category: {
        type: Sequelize.STRING
      },
      icon: {
        type: Sequelize.STRING
      },
      template_data: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      is_public: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      use_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      created_by: {
        type: Sequelize.UUID
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
    await queryInterface.addIndex('workflows', ['status']);
    await queryInterface.addIndex('workflows', ['enabled']);
    await queryInterface.addIndex('workflows', ['created_by']);
    await queryInterface.addIndex('workflows', ['trigger_type']);

    await queryInterface.addIndex('workflow_executions', ['workflow_id']);
    await queryInterface.addIndex('workflow_executions', ['status']);
    await queryInterface.addIndex('workflow_executions', ['created_at']);

    await queryInterface.addIndex('workflow_step_logs', ['execution_id']);
    await queryInterface.addIndex('workflow_step_logs', ['step_index']);
    await queryInterface.addIndex('workflow_step_logs', ['status']);

    await queryInterface.addIndex('workflow_schedules', ['workflow_id']);
    await queryInterface.addIndex('workflow_schedules', ['enabled']);
    await queryInterface.addIndex('workflow_schedules', ['next_run_at']);

    await queryInterface.addIndex('workflow_templates', ['category']);
    await queryInterface.addIndex('workflow_templates', ['is_public']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('workflow_step_logs');
    await queryInterface.dropTable('workflow_executions');
    await queryInterface.dropTable('workflow_schedules');
    await queryInterface.dropTable('workflow_templates');
    await queryInterface.dropTable('workflows');
  }
};
