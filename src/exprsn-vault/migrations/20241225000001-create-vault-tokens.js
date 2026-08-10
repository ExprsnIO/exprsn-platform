/**
 * Migration: Create Vault Tokens Table
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('vault_tokens', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      token_id: {
        type: Sequelize.STRING(64),
        unique: true,
        allowNull: false
      },
      token_hash: {
        type: Sequelize.STRING(256),
        allowNull: false
      },
      display_name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      // Ownership
      entity_type: {
        type: Sequelize.ENUM('user', 'group', 'organization', 'service', 'certificate'),
        allowNull: false
      },
      entity_id: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      created_by: {
        type: Sequelize.STRING(255),
        allowNull: false
      },

      // Permissions
      permissions: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {}
      },

      // Scope restrictions
      path_prefixes: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: []
      },
      ip_whitelist: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: []
      },

      // Expiration
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      max_uses: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      usage_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },

      // Status
      status: {
        type: Sequelize.ENUM('active', 'revoked', 'expired', 'suspended'),
        defaultValue: 'active',
        allowNull: false
      },
      revoked_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      revoked_by: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      revocation_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      // Integration
      ca_token_id: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      auth_session_id: {
        type: Sequelize.STRING(255),
        allowNull: true
      },

      // AI & Analytics
      risk_score: {
        type: Sequelize.FLOAT,
        defaultValue: 0.0
      },
      last_used_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      last_used_from: {
        type: Sequelize.STRING(100),
        allowNull: true
      },

      // Metadata
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
    await queryInterface.addIndex('vault_tokens', ['token_id'], {
      unique: true,
      name: 'vault_tokens_token_id_unique'
    });
    await queryInterface.addIndex('vault_tokens', ['token_hash']);
    await queryInterface.addIndex('vault_tokens', ['entity_type', 'entity_id']);
    await queryInterface.addIndex('vault_tokens', ['status']);
    await queryInterface.addIndex('vault_tokens', ['expires_at']);
    await queryInterface.addIndex('vault_tokens', ['created_by']);
    await queryInterface.addIndex('vault_tokens', ['ca_token_id']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('vault_tokens');
  }
};
