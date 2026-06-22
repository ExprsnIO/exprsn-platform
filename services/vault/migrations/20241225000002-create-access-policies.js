/**
 * Migration: Create Access Policies Table
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('access_policies', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING(255),
        unique: true,
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      // Policy definition
      policy_type: {
        type: Sequelize.ENUM('secret', 'key', 'credential', 'global'),
        allowNull: false
      },
      rules: {
        type: Sequelize.JSONB,
        allowNull: false
      },

      // Applicability
      entity_types: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: ['user', 'group', 'organization', 'service']
      },

      // Enforcement
      priority: {
        type: Sequelize.INTEGER,
        defaultValue: 100
      },
      enforcement_mode: {
        type: Sequelize.ENUM('enforcing', 'permissive', 'audit'),
        defaultValue: 'enforcing'
      },

      // AI suggestions
      ai_suggested: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      ai_confidence: {
        type: Sequelize.FLOAT,
        allowNull: true
      },

      // Status
      status: {
        type: Sequelize.ENUM('active', 'draft', 'deprecated'),
        defaultValue: 'active'
      },

      // Metadata
      created_by: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
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
    await queryInterface.addIndex('access_policies', ['name'], {
      unique: true,
      name: 'access_policies_name_unique'
    });
    await queryInterface.addIndex('access_policies', ['policy_type']);
    await queryInterface.addIndex('access_policies', ['status']);
    await queryInterface.addIndex('access_policies', ['priority']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('access_policies');
  }
};
