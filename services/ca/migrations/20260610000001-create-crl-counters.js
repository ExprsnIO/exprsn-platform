'use strict';

/**
 * Migration: Create CRL Counters Table
 * ═══════════════════════════════════════════════════════════════════════
 * Persistent monotonic cRLNumber per issuing CA (RFC 5280 §5.2.3)
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('crl_counters', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false
      },
      issuer_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: {
          model: 'certificates',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      counter: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0
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

    await queryInterface.addIndex('crl_counters', ['issuer_id'], {
      unique: true,
      name: 'crl_counters_issuer_id_unique_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('crl_counters');
  }
};
