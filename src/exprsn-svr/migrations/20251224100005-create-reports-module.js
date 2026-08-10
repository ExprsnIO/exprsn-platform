/**
 * Migration: Create Reports Module
 * Creates tables for unified reporting system
 * - reports
 * - report_schedules
 * - report_executions
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create reports table
    await queryInterface.createTable('reports', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      report_type: {
        type: Sequelize.ENUM(
          'crm_contacts',
          'crm_leads',
          'crm_opportunities',
          'crm_activities',
          'crm_campaigns',
          'crm_tickets',
          'erp_financial',
          'erp_inventory',
          'erp_sales',
          'erp_hr',
          'erp_assets',
          'groupware_tasks',
          'groupware_time_tracking',
          'groupware_projects',
          'custom'
        ),
        allowNull: false
      },
      category: {
        type: Sequelize.STRING(100),
        allowNull: false,
        defaultValue: 'custom'
      },
      owner_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      visibility: {
        type: Sequelize.ENUM('private', 'team', 'organization', 'public'),
        defaultValue: 'private'
      },
      config: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      visualization: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      custom_query: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('draft', 'active', 'archived'),
        defaultValue: 'draft'
      },
      timeout_seconds: {
        type: Sequelize.INTEGER,
        defaultValue: 60
      },
      cache_duration_minutes: {
        type: Sequelize.INTEGER,
        defaultValue: 15
      },
      execution_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      last_executed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      last_execution_duration_ms: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      avg_execution_duration_ms: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      shared_with: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        defaultValue: []
      },
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: []
      },
      is_favorite: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      is_template: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      template_id: {
        type: Sequelize.UUID,
        allowNull: true
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

    // Create indexes for reports table
    await queryInterface.addIndex('reports', ['owner_id'], {
      name: 'reports_owner_id_idx'
    });
    await queryInterface.addIndex('reports', ['report_type'], {
      name: 'reports_report_type_idx'
    });
    await queryInterface.addIndex('reports', ['category'], {
      name: 'reports_category_idx'
    });
    await queryInterface.addIndex('reports', ['status'], {
      name: 'reports_status_idx'
    });
    await queryInterface.addIndex('reports', ['visibility'], {
      name: 'reports_visibility_idx'
    });
    await queryInterface.addIndex('reports', ['is_template'], {
      name: 'reports_is_template_idx'
    });
    await queryInterface.addIndex('reports', ['created_at'], {
      name: 'reports_created_at_idx'
    });

    // Create report_schedules table
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
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      frequency: {
        type: Sequelize.ENUM('once', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'),
        allowNull: false
      },
      cron_expression: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      run_at: {
        type: Sequelize.TIME,
        allowNull: true
      },
      day_of_week: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      day_of_month: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      timezone: {
        type: Sequelize.STRING(100),
        defaultValue: 'UTC'
      },
      start_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      end_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      export_format: {
        type: Sequelize.ENUM('pdf', 'excel', 'csv', 'json'),
        defaultValue: 'pdf'
      },
      delivery_method: {
        type: Sequelize.ENUM('email', 'download', 'storage', 'webhook'),
        defaultValue: 'email'
      },
      recipients: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: []
      },
      storage_path: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      webhook_url: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      parameters: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      last_run_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      next_run_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      execution_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      failure_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      last_error: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false
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

    // Create indexes for report_schedules table
    await queryInterface.addIndex('report_schedules', ['report_id'], {
      name: 'report_schedules_report_id_idx'
    });
    await queryInterface.addIndex('report_schedules', ['is_active'], {
      name: 'report_schedules_is_active_idx'
    });
    await queryInterface.addIndex('report_schedules', ['next_run_at'], {
      name: 'report_schedules_next_run_at_idx'
    });
    await queryInterface.addIndex('report_schedules', ['frequency'], {
      name: 'report_schedules_frequency_idx'
    });
    await queryInterface.addIndex('report_schedules', ['created_by'], {
      name: 'report_schedules_created_by_idx'
    });

    // Create report_executions table
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
      executed_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      duration_ms: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('running', 'completed', 'failed', 'cancelled', 'timeout'),
        defaultValue: 'running'
      },
      row_count: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      result_size: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      export_format: {
        type: Sequelize.ENUM('pdf', 'excel', 'csv', 'json'),
        allowNull: true
      },
      export_path: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      export_url: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      export_expires_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      parameters: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      error: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      error_stack: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      cache_key: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      cache_hit: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      delivery_method: {
        type: Sequelize.ENUM('email', 'download', 'storage', 'webhook'),
        allowNull: true
      },
      delivery_status: {
        type: Sequelize.ENUM('pending', 'sent', 'failed'),
        allowNull: true
      },
      delivered_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      delivery_error: {
        type: Sequelize.TEXT,
        allowNull: true
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

    // Create indexes for report_executions table
    await queryInterface.addIndex('report_executions', ['report_id'], {
      name: 'report_executions_report_id_idx'
    });
    await queryInterface.addIndex('report_executions', ['schedule_id'], {
      name: 'report_executions_schedule_id_idx'
    });
    await queryInterface.addIndex('report_executions', ['executed_by'], {
      name: 'report_executions_executed_by_idx'
    });
    await queryInterface.addIndex('report_executions', ['status'], {
      name: 'report_executions_status_idx'
    });
    await queryInterface.addIndex('report_executions', ['started_at'], {
      name: 'report_executions_started_at_idx'
    });
    await queryInterface.addIndex('report_executions', ['cache_key'], {
      name: 'report_executions_cache_key_idx'
    });
    await queryInterface.addIndex('report_executions', ['export_expires_at'], {
      name: 'report_executions_export_expires_at_idx'
    });

    console.log('Reports module tables created successfully');
  },

  down: async (queryInterface, Sequelize) => {
    // Drop tables in reverse order (respecting foreign key constraints)
    await queryInterface.dropTable('report_executions');
    await queryInterface.dropTable('report_schedules');
    await queryInterface.dropTable('reports');

    console.log('Reports module tables dropped successfully');
  }
};
