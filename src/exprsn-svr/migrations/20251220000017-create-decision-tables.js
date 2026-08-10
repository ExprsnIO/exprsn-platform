/**
 * Migration: Create Decision Tables Table
 *
 * Decision tables for business rules (DMN-style).
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('decision_tables', {
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
      inputs: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: 'Input columns definition',
      },
      outputs: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: 'Output columns definition',
      },
      rules: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: 'Decision rules',
      },
      hit_policy: {
        type: Sequelize.ENUM('first', 'unique', 'priority', 'any', 'collect'),
        allowNull: false,
        defaultValue: 'first',
        comment: 'Rule matching strategy',
      },
      default_output: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Default output if no rules match',
      },
      status: {
        type: Sequelize.ENUM('draft', 'active', 'inactive'),
        allowNull: false,
        defaultValue: 'draft',
      },
      version: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: '1.0.0',
      },
      execution_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
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
    await queryInterface.addIndex('decision_tables', ['application_id'], {
      name: 'decision_tables_application_id_idx',
    });

    await queryInterface.addIndex('decision_tables', ['status'], {
      name: 'decision_tables_status_idx',
    });

    await queryInterface.addIndex('decision_tables', ['name'], {
      name: 'decision_tables_name_idx',
    });

    // Unique constraint: decision table name within application
    await queryInterface.addIndex('decision_tables', ['application_id', 'name'], {
      name: 'decision_tables_app_name_unique',
      unique: true,
      where: {
        deleted_at: null,
      },
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('decision_tables');
  }
};
