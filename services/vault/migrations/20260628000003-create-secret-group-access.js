'use strict';

/**
 * Phase 6 (Shared keys / secrets for groups): create the secret_group_access
 * ACL table.
 *
 * Records that a nexus group has been granted access to an existing secret
 * (at read/write/manage level), without touching the `secrets` table. The
 * default sync path (`db:migrate`) derives the same table + indexes from
 * src/models/SecretGroupAccess.js — keep the two in agreement.
 *
 * All objects are schema-qualified to the `vault` schema (see STATUS.md #1 /
 * CLAUDE.md — unqualified DDL can leak into `public`).
 */

const SCHEMA = 'vault';
const TABLE = { tableName: 'secret_group_access', schema: SCHEMA };
const SECRETS = { tableName: 'secrets', schema: SCHEMA };
const UNIQUE_INDEX = 'secret_group_access_secret_group_unique';
const GROUP_INDEX = 'secret_group_access_group_id_idx';
const ENUM_TYPE = `"${SCHEMA}"."enum_secret_group_access_permission"`;

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(TABLE, {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true
        },
        secret_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: SECRETS, key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        group_id: {
          type: Sequelize.UUID,
          allowNull: false
        },
        permission: {
          type: Sequelize.ENUM('read', 'write', 'manage'),
          allowNull: false,
          defaultValue: 'read'
        },
        granted_by: {
          type: Sequelize.STRING(255),
          allowNull: false
        },
        expires_at: {
          type: Sequelize.DATE,
          allowNull: true
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
      }, { transaction: t });

      await queryInterface.addIndex(TABLE, ['secret_id', 'group_id'], {
        name: UNIQUE_INDEX,
        unique: true,
        transaction: t
      });
      await queryInterface.addIndex(TABLE, ['group_id'], {
        name: GROUP_INDEX,
        transaction: t
      });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable(TABLE);
    // dropTable does not drop the backing ENUM type — clean it up after.
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS ${ENUM_TYPE};`);
  }
};
