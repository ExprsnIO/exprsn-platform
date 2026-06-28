'use strict';

/**
 * Add live_stream_id to group events (Phase 5 — host live events for groups).
 *
 * Links a scheduled group event to an exprsn-live Stream when the event "goes
 * live". This is a cross-schema soft reference (live.streams lives in another
 * Postgres schema) so there is intentionally NO foreign key.
 *
 * Schema-qualified: the nexus module's tables live in the `nexus` Postgres
 * schema. DB_SCHEMA is injected by the platform migration runner; default to
 * `nexus` when running nexus's own sequelize-cli migrations.
 */

const SCHEMA = process.env.DB_SCHEMA || 'nexus';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn(
      { tableName: 'events', schema: SCHEMA },
      'live_stream_id',
      {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Linked exprsn-live Stream id when this event has gone live (null = not live)'
      }
    );

    await queryInterface.addIndex(
      { tableName: 'events', schema: SCHEMA },
      ['live_stream_id'],
      { name: 'events_live_stream_id' }
    );
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex(
      { tableName: 'events', schema: SCHEMA },
      'events_live_stream_id'
    );
    await queryInterface.removeColumn(
      { tableName: 'events', schema: SCHEMA },
      'live_stream_id'
    );
  }
};
