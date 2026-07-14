'use strict';

/**
 * CHECK-CONSTRAINT-ONLY migration (FEAT-011, ADR §DDL).
 *
 * The model (services/timeline/src/models/UserRelationship.js) owns the table,
 * the ENUM, and all three indexes — those are created by `db:migrate` (model
 * sync). This file adds ONLY the self-block CHECK, which a Sequelize define()
 * cannot express. Do NOT hand-write CREATE TABLE/TYPE/INDEX here: sync
 * reconciles indexes by name and would create duplicate physical indexes
 * (6-for-3), and a bare CREATE would error because sync runs first.
 *
 * Application order (binding — same manual step as posts_content_maxlen):
 *   1. `npm run db:migrate` (sync) creates timeline.user_relationships + enum + 3 indexes.
 *   2. Run THIS up() directly — timeline's `db:migrate:raw` is sync({alter:true})
 *      and does NOT replay migration files.
 *   3. `npm run db:check` exits 0.
 *
 * db:check does NOT audit CHECK constraints; verify explicitly via pg_constraint.
 */
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(
      'ALTER TABLE timeline.user_relationships ' +
      'ADD CONSTRAINT user_relationships_no_self CHECK ("actorId" <> "targetId")'
    );
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(
      'ALTER TABLE timeline.user_relationships ' +
      'DROP CONSTRAINT IF EXISTS user_relationships_no_self'
    );
  }
};
