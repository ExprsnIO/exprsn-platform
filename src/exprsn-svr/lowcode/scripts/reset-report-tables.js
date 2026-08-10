/**
 * Reset Report Tables
 * Drops and recreates report tables
 */

const { sequelize } = require('../models');

async function resetReportTables() {
  try {
    console.log('🗑️  Dropping existing report tables (if any)...\n');

    const queryInterface = sequelize.getQueryInterface();

    // Drop tables in reverse order (to respect foreign keys)
    const tablesToDrop = ['report_executions', 'report_schedules', 'reports'];

    for (const table of tablesToDrop) {
      try {
        await queryInterface.dropTable(table);
        console.log(`✅ Dropped ${table}`);
      } catch (error) {
        if (error.message.includes('does not exist')) {
          console.log(`ℹ️  ${table} does not exist (skipping)`);
        } else {
          console.log(`⚠️  Error dropping ${table}: ${error.message}`);
        }
      }
    }

    console.log('\n📋 Creating report tables...\n');

    // Create reports table
    await queryInterface.createTable('reports', {
      id: {
        type: sequelize.Sequelize.UUID,
        defaultValue: sequelize.Sequelize.UUIDV4,
        primaryKey: true
      },
      display_name: {
        type: sequelize.Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: sequelize.Sequelize.TEXT,
        allowNull: true
      },
      application_id: {
        type: sequelize.Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'applications',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      created_by: {
        type: sequelize.Sequelize.UUID,
        allowNull: true
      },
      modified_by: {
        type: sequelize.Sequelize.UUID,
        allowNull: true
      },
      report_type: {
        type: sequelize.Sequelize.ENUM('table', 'chart', 'pivot', 'kpi', 'custom'),
        defaultValue: 'table',
        allowNull: false
      },
      status: {
        type: sequelize.Sequelize.ENUM('draft', 'published', 'archived'),
        defaultValue: 'draft',
        allowNull: false
      },
      data_source_id: {
        type: sequelize.Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'data_sources',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      query_config: {
        type: sequelize.Sequelize.JSONB,
        allowNull: false,
        defaultValue: '{}'
      },
      raw_sql: {
        type: sequelize.Sequelize.TEXT,
        allowNull: true
      },
      parameters: {
        type: sequelize.Sequelize.JSONB,
        allowNull: false,
        defaultValue: '[]'
      },
      visualization_config: {
        type: sequelize.Sequelize.JSONB,
        allowNull: false,
        defaultValue: '{}'
      },
      cache_enabled: {
        type: sequelize.Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: false
      },
      cache_ttl: {
        type: sequelize.Sequelize.INTEGER,
        defaultValue: 300,
        allowNull: false
      },
      execution_timeout: {
        type: sequelize.Sequelize.INTEGER,
        defaultValue: 30,
        allowNull: false
      },
      avg_execution_time: {
        type: sequelize.Sequelize.INTEGER,
        allowNull: true
      },
      last_executed_at: {
        type: sequelize.Sequelize.DATE,
        allowNull: true
      },
      execution_count: {
        type: sequelize.Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      version: {
        type: sequelize.Sequelize.INTEGER,
        defaultValue: 1,
        allowNull: false
      },
      tags: {
        type: sequelize.Sequelize.ARRAY(sequelize.Sequelize.STRING),
        allowNull: true,
        defaultValue: []
      },
      category: {
        type: sequelize.Sequelize.STRING(100),
        allowNull: true
      },
      created_at: {
        type: sequelize.Sequelize.DATE,
        allowNull: false,
        defaultValue: sequelize.Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: sequelize.Sequelize.DATE,
        allowNull: false,
        defaultValue: sequelize.Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });
    console.log('✅ Created reports table');

    // Add indexes for reports
    await queryInterface.addIndex('reports', ['application_id'], { name: 'reports_application_id_idx' });
    await queryInterface.addIndex('reports', ['status'], { name: 'reports_status_idx' });
    await queryInterface.addIndex('reports', ['report_type'], { name: 'reports_report_type_idx' });
    console.log('✅ Added indexes to reports table');

    // Create report_schedules table
    await queryInterface.createTable('report_schedules', {
      id: {
        type: sequelize.Sequelize.UUID,
        defaultValue: sequelize.Sequelize.UUIDV4,
        primaryKey: true
      },
      report_id: {
        type: sequelize.Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'reports',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      application_id: {
        type: sequelize.Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'applications',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      created_by: {
        type: sequelize.Sequelize.UUID,
        allowNull: true
      },
      display_name: {
        type: sequelize.Sequelize.STRING(255),
        allowNull: false
      },
      enabled: {
        type: sequelize.Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: false
      },
      cron_expression: {
        type: sequelize.Sequelize.STRING(100),
        allowNull: false
      },
      delivery_method: {
        type: sequelize.Sequelize.ENUM('email', 'webhook', 'storage', 'dashboard'),
        defaultValue: 'email',
        allowNull: false
      },
      delivery_config: {
        type: sequelize.Sequelize.JSONB,
        allowNull: false,
        defaultValue: '{}'
      },
      created_at: {
        type: sequelize.Sequelize.DATE,
        allowNull: false,
        defaultValue: sequelize.Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: sequelize.Sequelize.DATE,
        allowNull: false,
        defaultValue: sequelize.Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });
    console.log('✅ Created report_schedules table');

    // Create report_executions table
    await queryInterface.createTable('report_executions', {
      id: {
        type: sequelize.Sequelize.UUID,
        defaultValue: sequelize.Sequelize.UUIDV4,
        primaryKey: true
      },
      report_id: {
        type: sequelize.Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'reports',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      application_id: {
        type: sequelize.Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'applications',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      status: {
        type: sequelize.Sequelize.ENUM('pending', 'running', 'completed', 'failed', 'cancelled'),
        defaultValue: 'pending',
        allowNull: false
      },
      result_data: {
        type: sequelize.Sequelize.JSONB,
        allowNull: true
      },
      created_at: {
        type: sequelize.Sequelize.DATE,
        allowNull: false,
        defaultValue: sequelize.Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: sequelize.Sequelize.DATE,
        allowNull: false,
        defaultValue: sequelize.Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });
    console.log('✅ Created report_executions table');

    console.log('\n✅ All report tables created successfully!');

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Reset failed:', error.message);
    console.error('\nFull error:', error);
    await sequelize.close();
    process.exit(1);
  }
}

// Run reset
resetReportTables();
