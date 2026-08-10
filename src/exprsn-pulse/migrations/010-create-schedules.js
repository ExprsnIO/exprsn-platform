/**
 * Migration: Create schedules table
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('schedules', {
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
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      cron_expression: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      timezone: {
        type: Sequelize.STRING(100),
        allowNull: false,
        defaultValue: 'UTC'
      },
      parameters: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      format: {
        type: Sequelize.ENUM('pdf', 'excel', 'csv', 'html', 'json'),
        allowNull: false,
        defaultValue: 'pdf'
      },
      recipients: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: []
      },
      delivery_method: {
        type: Sequelize.ENUM('email', 'webhook', 's3', 'both'),
        allowNull: false,
        defaultValue: 'email'
      },
      webhook_url: {
        type: Sequelize.STRING(1000),
        allowNull: true
      },
      s3_bucket: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      s3_path: {
        type: Sequelize.STRING(1000),
        allowNull: true
      },
      email_subject: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      email_body: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      start_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      end_date: {
        type: Sequelize.DATE,
        allowNull: true
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
        allowNull: false,
        defaultValue: 0
      },
      failure_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false
      },
      updated_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
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

    // Add indexes
    await queryInterface.addIndex('schedules', ['report_id']);
    await queryInterface.addIndex('schedules', ['is_active']);
    await queryInterface.addIndex('schedules', ['next_execution_at']);
    await queryInterface.addIndex('schedules', ['created_by']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('schedules');
  }
};
