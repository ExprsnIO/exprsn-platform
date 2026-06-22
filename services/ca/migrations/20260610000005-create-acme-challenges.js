'use strict';

/**
 * Migration: Create ACME Challenges Table
 * ═══════════════════════════════════════════════════════════════════════
 * ACME v2 (RFC 8555 §8) http-01 / dns-01 challenges
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('acme_challenges', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false
      },
      authorization_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'acme_authorizations',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      type: {
        type: Sequelize.ENUM('http-01', 'dns-01'),
        allowNull: false
      },
      token: {
        type: Sequelize.STRING(128),
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('pending', 'processing', 'valid', 'invalid'),
        allowNull: false,
        defaultValue: 'pending'
      },
      validated: {
        type: Sequelize.DATE,
        allowNull: true
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

    await queryInterface.addIndex('acme_challenges', ['authorization_id'], {
      name: 'acme_challenges_authorization_id_idx'
    });

    await queryInterface.addIndex('acme_challenges', ['token'], {
      name: 'acme_challenges_token_idx'
    });

    await queryInterface.addIndex('acme_challenges', ['status'], {
      name: 'acme_challenges_status_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('acme_challenges');
  }
};
