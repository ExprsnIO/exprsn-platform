'use strict';

/**
 * Migration: Create ACME Accounts Table
 * ═══════════════════════════════════════════════════════════════════════
 * ACME v2 (RFC 8555) account registry
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('acme_accounts', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false
      },
      key_thumbprint: {
        type: Sequelize.STRING(128),
        allowNull: false,
        unique: true
      },
      jwk: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('valid', 'deactivated', 'revoked'),
        allowNull: false,
        defaultValue: 'valid'
      },
      contact: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: false,
        defaultValue: []
      },
      terms_of_service_agreed: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {},
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('acme_accounts', ['key_thumbprint'], {
      unique: true,
      name: 'acme_accounts_key_thumbprint_unique_idx'
    });

    await queryInterface.addIndex('acme_accounts', ['status'], {
      name: 'acme_accounts_status_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('acme_accounts');
  }
};
