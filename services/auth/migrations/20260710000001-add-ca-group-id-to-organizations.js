'use strict';

/**
 * Migration: add ca_group_id to organizations (FEAT-032 / ADR-0003 Decision 5)
 * ═══════════════════════════════════════════════════════════════════════
 * Links an auth.organizations row to its CA directory group (ca.groups id,
 * type organizational_unit), so an org-scoped token minted with
 * organizationId = org.caGroupId validates per token-spec v1.1.
 *
 * PLAIN UUID — no cross-schema FK (ca.groups is a different module's schema;
 * auth→ca bridges by convention only). Nullable; existing orgs keep NULL.
 *
 * Note (platform): the sync-based `db:migrate` (scripts/migrate-sync.js) creates
 * NEW tables but NEVER ALTERs an existing one — so this migration's up() must be
 * run directly against the DB (schema-qualified to `auth`, so it does not leak
 * into `public`; STATUS #1), and `npm run db:check` must be clean afterward or
 * every query on `organizations` 500s (model column with no DB column). Example:
 *
 *   node -e "const {sequelize}=require('./services/auth/src/models'); \
 *     const m=require('./services/auth/migrations/20260710000001-add-ca-group-id-to-organizations'); \
 *     m.up(sequelize.getQueryInterface(), require('sequelize')).then(()=>process.exit(0))"
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = { tableName: 'organizations', schema: 'auth' };

    const columns = await queryInterface.describeTable(table);
    if (!columns.ca_group_id) {
      await queryInterface.addColumn(table, 'ca_group_id', {
        type: Sequelize.UUID,
        allowNull: true
      });
    }
    // Index creation is guarded SEPARATELY from the column so that a re-run after
    // a mid-migration failure (column added, index not) still creates the index.
    const indexes = await queryInterface.showIndex(table).catch(() => []);
    const hasIndex = indexes.some((ix) => ix.name === 'organizations_ca_group_id_idx');
    if (!hasIndex) {
      await queryInterface.addIndex(table, ['ca_group_id'], {
        name: 'organizations_ca_group_id_idx'
      });
    }
  },

  down: async (queryInterface) => {
    const table = { tableName: 'organizations', schema: 'auth' };
    await queryInterface.removeIndex(table, 'organizations_ca_group_id_idx').catch(() => {});
    await queryInterface.removeColumn(table, 'ca_group_id').catch(() => {});
  }
};
