/**
 * Migration: Create schedule_executions table
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('schedule_executions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      schedule_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'schedules',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      status: {
        type: Sequelize.ENUM('pending', 'running', 'success', 'failed', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending'
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      duration: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      parameters: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      result_size: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      result_url: {
        type: Sequelize.STRING(1000),
        allowNull: true
      },
      delivery_status: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      error: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      error_stack: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      logs: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: []
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
    await queryInterface.addIndex('schedule_executions', ['schedule_id']);
    await queryInterface.addIndex('schedule_executions', ['status']);
    await queryInterface.addIndex('schedule_executions', ['started_at']);
    await queryInterface.addIndex('schedule_executions', ['created_at']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('schedule_executions');
  }
};
