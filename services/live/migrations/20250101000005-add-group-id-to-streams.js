/**
 * Migration: add group_id to streams (Phase 5 — group-hosted live events)
 *
 * Lets a stream be owned by a nexus group ("Go live for the group"). When
 * group_id is set, start/stop/manage authorization is delegated to the group's
 * admin/owner role (via the shared requireGroupMembership guard) instead of the
 * personal-owner check. Personal streams keep group_id NULL.
 *
 * Schema-qualified: the live module's tables live in the `live` Postgres schema.
 * DB_SCHEMA is injected by scripts/migrate-modules.js (db:migrate:raw); the
 * default db:migrate path syncs the model instead.
 */

const SCHEMA = process.env.DB_SCHEMA || 'live';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn(
      { tableName: 'streams', schema: SCHEMA },
      'group_id',
      {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Owning nexus group, when this is a group-hosted stream (null = personal stream)'
      }
    );

    await queryInterface.addIndex(
      { tableName: 'streams', schema: SCHEMA },
      ['group_id', 'status'],
      { name: 'streams_group_id_status' }
    );
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex(
      { tableName: 'streams', schema: SCHEMA },
      'streams_group_id_status'
    );
    await queryInterface.removeColumn(
      { tableName: 'streams', schema: SCHEMA },
      'group_id'
    );
  }
};
