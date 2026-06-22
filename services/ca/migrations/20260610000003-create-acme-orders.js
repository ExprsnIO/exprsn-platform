'use strict';

/**
 * Migration: Create ACME Orders Table
 * ═══════════════════════════════════════════════════════════════════════
 * ACME v2 (RFC 8555 §7.1.3) certificate orders
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('acme_orders', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false
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
      status: {
        type: Sequelize.ENUM('pending', 'ready', 'processing', 'valid', 'invalid'),
        allowNull: false,
        defaultValue: 'pending'
      },
      expires: {
        type: Sequelize.DATE,
        allowNull: false
      },
      identifiers: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: []
      },
      not_before: {
        type: Sequelize.DATE,
        allowNull: true
      },
      not_after: {
        type: Sequelize.DATE,
        allowNull: true
      },
      certificate_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'certificates',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      error: {
        type: Sequelize.JSONB,
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

    await queryInterface.addIndex('acme_orders', ['account_id'], {
      name: 'acme_orders_account_id_idx'
    });

    await queryInterface.addIndex('acme_orders', ['status'], {
      name: 'acme_orders_status_idx'
    });

    await queryInterface.addIndex('acme_orders', ['certificate_id'], {
      name: 'acme_orders_certificate_id_idx'
    });

    await queryInterface.addIndex('acme_orders', ['expires'], {
      name: 'acme_orders_expires_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('acme_orders');
  }
};
