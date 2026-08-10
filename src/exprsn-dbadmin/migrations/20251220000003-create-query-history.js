module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('query_history', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      query: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      connection_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'connections',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      execution_time_ms: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      rows_affected: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('success', 'error', 'cancelled'),
        allowNull: false,
        defaultValue: 'success'
      },
      error_message: {
        type: Sequelize.TEXT,
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

    await queryInterface.addIndex('query_history', ['connection_id']);
    await queryInterface.addIndex('query_history', ['user_id']);
    await queryInterface.addIndex('query_history', ['status']);
    await queryInterface.addIndex('query_history', ['created_at']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('query_history');
  }
};
