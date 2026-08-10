/**
 * Migration: Create plugins table
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('plugins', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      display_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT
      },
      version: {
        type: Sequelize.STRING,
        allowNull: false
      },
      author: {
        type: Sequelize.STRING
      },
      author_email: {
        type: Sequelize.STRING
      },
      license: {
        type: Sequelize.STRING
      },
      homepage: {
        type: Sequelize.STRING
      },
      repository: {
        type: Sequelize.STRING
      },
      type: {
        type: Sequelize.ENUM('component', 'service', 'middleware', 'theme', 'integration', 'workflow-step'),
        allowNull: false
      },
      category: {
        type: Sequelize.STRING
      },
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: []
      },
      main_file: {
        type: Sequelize.STRING,
        allowNull: false
      },
      config_schema: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      default_config: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      dependencies: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      permissions_required: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: []
      },
      hooks: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive', 'disabled', 'error'),
        defaultValue: 'inactive'
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      installed_at: {
        type: Sequelize.DATE
      },
      installed_by: {
        type: Sequelize.UUID
      },
      updated_by: {
        type: Sequelize.UUID
      },
      error_message: {
        type: Sequelize.TEXT
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

    // Add indexes
    await queryInterface.addIndex('plugins', ['name']);
    await queryInterface.addIndex('plugins', ['type']);
    await queryInterface.addIndex('plugins', ['status']);
    await queryInterface.addIndex('plugins', ['enabled']);
    await queryInterface.addIndex('plugins', ['category']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('plugins');
  }
};
