'use strict';

/**
 * Migration: Create ACME Authorizations Table
 * ═══════════════════════════════════════════════════════════════════════
 * ACME v2 (RFC 8555 §7.1.4) identifier authorizations
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('acme_authorizations', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false
      },
      order_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'acme_orders',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      account_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'acme_accounts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      identifier: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      wildcard: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      status: {
        type: Sequelize.ENUM('pending', 'valid', 'invalid', 'deactivated', 'expired', 'revoked'),
        allowNull: false,
        defaultValue: 'pending'
      },
      expires: {
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

    await queryInterface.addIndex('acme_authorizations', ['order_id'], {
      name: 'acme_authorizations_order_id_idx'
    });

    await queryInterface.addIndex('acme_authorizations', ['account_id'], {
      name: 'acme_authorizations_account_id_idx'
    });

    await queryInterface.addIndex('acme_authorizations', ['status'], {
      name: 'acme_authorizations_status_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('acme_authorizations');
  }
};
