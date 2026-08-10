module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('saved_queries', {
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
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: []
      },
      is_shared: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      execution_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      last_executed_at: {
        type: Sequelize.DATE,
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

    await queryInterface.addIndex('saved_queries', ['connection_id']);
    await queryInterface.addIndex('saved_queries', ['user_id']);
    await queryInterface.addIndex('saved_queries', ['is_shared']);
    await queryInterface.addIndex('saved_queries', ['tags'], { using: 'gin' });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('saved_queries');
  }
};
