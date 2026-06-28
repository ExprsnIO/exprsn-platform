'use strict';

/**
 * admin_audit — append-only audit trail of privileged platform-admin actions
 * performed through the nexus admin console.
 *
 * Schema-qualified ({ tableName, schema: 'nexus' }) so the raw migration path
 * (scripts/migrate-modules.js) lands the table in the nexus schema rather than
 * leaking into public (see STATUS.md #1).
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = { tableName: 'admin_audit', schema: 'nexus' };

    await queryInterface.createTable(table, {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      actor_user_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      action: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      target_type: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      target_id: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      group_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.BIGINT,
        allowNull: false
      }
    });

    await queryInterface.addIndex(table, ['created_at']);
    await queryInterface.addIndex(table, ['group_id']);
    await queryInterface.addIndex(table, ['actor_user_id']);
    await queryInterface.addIndex(table, ['action']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable({ tableName: 'admin_audit', schema: 'nexus' });
  }
};
