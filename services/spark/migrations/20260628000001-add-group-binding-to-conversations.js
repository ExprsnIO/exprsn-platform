'use strict';

/**
 * Phase 4 (Messaging): bind conversations to nexus groups.
 *
 * Adds two nullable columns to spark.conversations:
 *   - group_id      UUID  — the owning nexus group (null for direct/non-group)
 *   - channel_kind  ENUM('chat','announcement') — which auto-provisioned group
 *                    channel this is (null for non-group conversations)
 * plus a composite index on (group_id, channel_kind) used to look up a group's
 * channels.
 *
 * All objects are schema-qualified to the `spark` schema (see STATUS.md #1 —
 * unqualified DDL can leak into `public`).
 */

const SCHEMA = 'spark';
const TABLE = { tableName: 'conversations', schema: SCHEMA };
const INDEX_NAME = 'conversations_group_id_channel_kind';
const ENUM_TYPE = `"${SCHEMA}"."enum_conversations_channel_kind"`;

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.addColumn(TABLE, 'group_id', {
        type: Sequelize.UUID,
        allowNull: true
      }, { transaction: t });

      await queryInterface.addColumn(TABLE, 'channel_kind', {
        type: Sequelize.ENUM('chat', 'announcement'),
        allowNull: true
      }, { transaction: t });

      await queryInterface.addIndex(TABLE, ['group_id', 'channel_kind'], {
        name: INDEX_NAME,
        transaction: t
      });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  down: async (queryInterface) => {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeIndex(TABLE, INDEX_NAME, { transaction: t });
      await queryInterface.removeColumn(TABLE, 'channel_kind', { transaction: t });
      await queryInterface.removeColumn(TABLE, 'group_id', { transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
    // removeColumn does not drop the backing ENUM type — clean it up after.
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS ${ENUM_TYPE};`);
  }
};
