/**
 * Migration: Create Token Bindings Table
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('token_bindings', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      token_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'vault_tokens',
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      policy_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'access_policies',
          key: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },

      // Direct permissions override
      permissions: {
        type: Sequelize.JSONB,
        allowNull: true
      },

      // Binding metadata
      bound_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      bound_by: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true
      },

      status: {
        type: Sequelize.ENUM('active', 'inactive'),
        defaultValue: 'active'
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Indexes
    await queryInterface.addIndex('token_bindings', ['token_id']);
    await queryInterface.addIndex('token_bindings', ['policy_id']);
    await queryInterface.addIndex('token_bindings', ['status']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('token_bindings');
  }
};
