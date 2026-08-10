/**
 * Migration: Create Global Variables Table
 *
 * Global variables accessible across the entire application.
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('global_variables', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      application_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'applications',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      display_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      data_type: {
        type: Sequelize.ENUM('string', 'number', 'boolean', 'date', 'object', 'array'),
        allowNull: false,
        defaultValue: 'string',
      },
      value: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Variable value',
      },
      default_value: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Default value',
      },
      scope: {
        type: Sequelize.ENUM('global', 'environment'),
        allowNull: false,
        defaultValue: 'global',
      },
      environment: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Environment (dev, staging, prod)',
      },
      encrypted: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether the value is encrypted',
      },
      read_only: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    // Add indexes
    await queryInterface.addIndex('global_variables', ['application_id'], {
      name: 'global_variables_application_id_idx',
    });

    await queryInterface.addIndex('global_variables', ['scope'], {
      name: 'global_variables_scope_idx',
    });

    await queryInterface.addIndex('global_variables', ['environment'], {
      name: 'global_variables_environment_idx',
    });

    // Unique constraint: variable name within application and scope
    await queryInterface.addIndex('global_variables', ['application_id', 'name', 'scope', 'environment'], {
      name: 'global_variables_unique_idx',
      unique: true,
      where: {
        deleted_at: null,
      },
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('global_variables');
  }
};
