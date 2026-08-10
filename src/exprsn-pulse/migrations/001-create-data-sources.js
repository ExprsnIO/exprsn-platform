/**
 * Migration: Create data_sources table
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('data_sources', {
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
      type: {
        type: Sequelize.ENUM('exprsn-service', 'postgresql', 'rest-api', 'custom-query'),
        allowNull: false,
        defaultValue: 'exprsn-service'
      },
      config: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      service_name: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false
      },
      updated_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      last_tested_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      test_status: {
        type: Sequelize.ENUM('success', 'failed', 'pending'),
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
    await queryInterface.addIndex('data_sources', ['type']);
    await queryInterface.addIndex('data_sources', ['service_name']);
    await queryInterface.addIndex('data_sources', ['is_active']);
    await queryInterface.addIndex('data_sources', ['created_by']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('data_sources');
  }
};
