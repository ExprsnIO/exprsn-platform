module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('connections', {
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
      host: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      port: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 5432
      },
      database: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      username: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      password: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      ssl_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      pg_version: {
        type: Sequelize.STRING(20),
        allowNull: true
      },
      color: {
        type: Sequelize.STRING(7),
        allowNull: true,
        defaultValue: '#007bff'
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      last_connected_at: {
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

    await queryInterface.addIndex('connections', ['user_id']);
    await queryInterface.addIndex('connections', ['is_active']);
    await queryInterface.addIndex('connections', ['user_id', 'name'], { unique: true });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('connections');
  }
};
