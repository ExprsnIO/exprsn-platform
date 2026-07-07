'use strict';

/**
 * Migration: CA "UserGroups" — standalone group_id index (BUG-007)
 * ═══════════════════════════════════════════════════════════════════════
 * The UserGroup model declares `indexes: [{ fields: ['group_id'] }, ...]`, but
 * the live `ca."UserGroups"` table only had `UserGroups_pkey (user_id,
 * group_id)` and `user_groups_role_idx (role)` — no standalone `group_id`
 * index. The composite PK is leading-column `user_id`, so it does NOT serve
 * group_id-only lookups ("who are the members/admins/owners of this group?")
 * nor the `group_id` FK's ON DELETE CASCADE check (Postgres does not
 * auto-index the referencing side of a FK). The token-spec v1.1 migration added
 * `user_groups_role_idx` but never a group_id index, and the table pre-existed
 * via Sequelize's string-through association, so sync-based `db:migrate` never
 * added it either → `npm run db:check` red with `MISSING INDEX UserGroups:
 * group_id`.
 *
 * Index name `user_groups_group_id` is exactly what a fresh sync-based
 * `db:migrate` auto-generates from the UserGroup model
 * (underscore('UserGroups_group_id')), so this catch-up migration and a
 * from-scratch sync converge on the SAME index — no duplicate on fresh deploys.
 *
 * Idempotent: on a fresh deploy `sequelize.sync()` already creates this index
 * from the model, so up() no-ops if any index already covers exactly
 * [group_id] (by name or column-set). Schema-qualified to land in `ca`, never
 * `public`.
 *
 * Note (platform): sync-based `db:migrate` creates new tables but never ALTERs
 * existing ones — run this migration's up() directly against the DB when
 * deploying against an already-created `ca."UserGroups"` table.
 */

module.exports = {
  up: async (queryInterface) => {
    const userGroups = { tableName: 'UserGroups', schema: 'ca' };
    const indexName = 'user_groups_group_id';

    const existing = await queryInterface.showIndex(userGroups);
    const alreadyCovered = existing.some((ix) => {
      if (ix.name === indexName) return true;
      const cols = (ix.fields || []).map((f) => (typeof f === 'string' ? f : f.attribute || f.name));
      return cols.length === 1 && cols[0] === 'group_id';
    });

    if (!alreadyCovered) {
      await queryInterface.addIndex(userGroups, ['group_id'], { name: indexName });
    }
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS "ca"."user_groups_group_id";');
  }
};
