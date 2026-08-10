/**
 * Migration: Create Reports and Analytics System
 * Tables for reports, report schedules, and report executions
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Reports table
    await queryInterface.createTable('reports', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      display_name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      application_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'applications',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      modified_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      report_type: {
        type: Sequelize.ENUM('table', 'chart', 'pivot', 'kpi', 'custom'),
        defaultValue: 'table',
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('draft', 'published', 'archived'),
        defaultValue: 'draft',
        allowNull: false
      },
      data_source_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'data_sources',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      query_config: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: '{}'
      },
      raw_sql: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      parameters: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: '[]'
      },
      visualization_config: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: '{}'
      },
      cache_enabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: false
      },
      cache_ttl: {
        type: Sequelize.INTEGER,
        defaultValue: 300,
        allowNull: false
      },
      execution_timeout: {
        type: Sequelize.INTEGER,
        defaultValue: 30,
        allowNull: false
      },
      avg_execution_time: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      last_executed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      execution_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      version: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
        allowNull: false
      },
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: []
      },
      category: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add indexes for reports
    await queryInterface.addIndex('reports', ['application_id']);
    await queryInterface.addIndex('reports', ['status']);
    await queryInterface.addIndex('reports', ['created_by']);
    await queryInterface.addIndex('reports', ['report_type']);
    await queryInterface.addIndex('reports', ['category']);
    await queryInterface.addIndex('reports', ['created_at']);
    await queryInterface.addIndex('reports', ['last_executed_at']);
    await queryInterface.addIndex('reports', {
      fields: ['query_config'],
      using: 'gin'
    });
    await queryInterface.addIndex('reports', {
      fields: ['tags'],
      using: 'gin'
    });

    // 2. Report Schedules table
    await queryInterface.createTable('report_schedules', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      report_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'reports',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      application_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'applications',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      display_name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: false
      },
      cron_expression: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      schedule_description: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      timezone: {
        type: Sequelize.STRING(50),
        defaultValue: 'UTC',
        allowNull: false
      },
      delivery_method: {
        type: Sequelize.ENUM('email', 'webhook', 'storage', 'dashboard'),
        defaultValue: 'email',
        allowNull: false
      },
      delivery_config: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: '{}'
      },
      export_format: {
        type: Sequelize.ENUM('pdf', 'excel', 'csv', 'json', 'html'),
        defaultValue: 'pdf',
        allowNull: false
      },
      parameter_values: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: '{}'
      },
      last_executed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      next_execution_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      execution_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      last_execution_status: {
        type: Sequelize.ENUM('success', 'failed', 'pending'),
        allowNull: true
      },
      last_execution_error: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      retention_days: {
        type: Sequelize.INTEGER,
        defaultValue: 30,
        allowNull: false
      },
      notify_on_success: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      },
      notify_on_failure: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: false
      },
      notification_recipients: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: []
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add indexes for report_schedules
    await queryInterface.addIndex('report_schedules', ['report_id']);
    await queryInterface.addIndex('report_schedules', ['application_id']);
    await queryInterface.addIndex('report_schedules', ['enabled']);
    await queryInterface.addIndex('report_schedules', ['next_execution_at']);
    await queryInterface.addIndex('report_schedules', ['created_by']);
    await queryInterface.addIndex('report_schedules', ['created_at']);
    await queryInterface.addIndex('report_schedules', {
      fields: ['delivery_config'],
      using: 'gin'
    });

    // 3. Report Executions table
    await queryInterface.createTable('report_executions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      report_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'reports',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      schedule_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'report_schedules',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      application_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'applications',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      executed_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      execution_type: {
        type: Sequelize.ENUM('manual', 'scheduled', 'api'),
        defaultValue: 'manual',
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('pending', 'running', 'completed', 'failed', 'cancelled'),
        defaultValue: 'pending',
        allowNull: false
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      execution_time: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      executed_query: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      query_parameters: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: '{}'
      },
      result_count: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      result_data: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      result_metadata: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      export_format: {
        type: Sequelize.ENUM('pdf', 'excel', 'csv', 'json', 'html'),
        allowNull: true
      },
      export_path: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      export_size: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      error_stack: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      memory_usage: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      cpu_time: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      is_cached: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      },
      cache_expires_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      delivery_status: {
        type: Sequelize.ENUM('pending', 'delivered', 'failed', 'not_applicable'),
        defaultValue: 'not_applicable',
        allowNull: false
      },
      delivery_error: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      delivered_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add indexes for report_executions
    await queryInterface.addIndex('report_executions', ['report_id']);
    await queryInterface.addIndex('report_executions', ['schedule_id']);
    await queryInterface.addIndex('report_executions', ['application_id']);
    await queryInterface.addIndex('report_executions', ['executed_by']);
    await queryInterface.addIndex('report_executions', ['status']);
    await queryInterface.addIndex('report_executions', ['execution_type']);
    await queryInterface.addIndex('report_executions', ['started_at']);
    await queryInterface.addIndex('report_executions', ['completed_at']);
    await queryInterface.addIndex('report_executions', ['is_cached', 'cache_expires_at']);
    await queryInterface.addIndex('report_executions', {
      fields: ['result_data'],
      using: 'gin'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Drop tables in reverse order to respect foreign key constraints
    await queryInterface.dropTable('report_executions');
    await queryInterface.dropTable('report_schedules');
    await queryInterface.dropTable('reports');
  }
};
