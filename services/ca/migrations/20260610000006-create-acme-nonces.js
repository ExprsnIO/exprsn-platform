'use strict';

/**
 * Migration: Create ACME Nonces Table
 * ═══════════════════════════════════════════════════════════════════════
 * Single-use replay nonces (RFC 8555 §6.5)
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('acme_nonces', {
      nonce: {
        type: Sequelize.STRING(64),
        primaryKey: true,
        allowNull: false
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false
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

    await queryInterface.addIndex('acme_nonces', ['expires_at'], {
      name: 'acme_nonces_expires_at_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('acme_nonces');
  }
};
