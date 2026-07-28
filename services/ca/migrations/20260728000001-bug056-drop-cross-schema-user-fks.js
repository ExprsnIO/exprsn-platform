'use strict';

/**
 * BUG-056: drop every FK that points a "user id" column at ca.users.
 *
 * The user ids stored in these columns are PLATFORM (auth.users) ids —
 * ca.users is a separate, vestigial identity store (see drift-allow.json's
 * "ca cross-schema user refs" entries and the Token.userId model comment).
 * A cross-schema FK to auth.users would violate per-schema isolation, and an
 * FK to ca.users rejects every insert (token mint, audit log, org-provisioning
 * membership) on any DB where the constraints exist.
 *
 * The legacy dev DB never had these constraints (which is why this never
 * fired), but model sync CREATED them on fresh bootstraps from the models'
 * attribute-level `references` and the User-side associations — both removed
 * in this same change (`constraints: false` in models/index.js). This
 * migration cleans up any DB that synced before the model fix.
 *
 * Idempotent and name-agnostic: it discovers whatever FK constraints exist on
 * the listed (table, column) pairs that reference ca.users and drops them; a
 * second run is a no-op. Schema-qualified to `ca` (STATUS.md #1). Sync-based
 * db:migrate never ALTERs an existing table, so apply by running up() directly
 * against the ca Sequelize connection (memory: db-migrate-cannot-add-columns),
 * or run the equivalent DO block via psql.
 *
 * down() is intentionally a no-op: re-adding FKs to ca.users would reinstate
 * the platform-wide issuance failure — the constraints are wrong by design.
 */

const SCHEMA = 'ca';

// Every (table, column) that holds a platform/auth user id. Matches the
// drift-allow.json "ca cross-schema user refs" set, plus UserGroups.user_id
// (invisible to db:check — BelongsToMany junctions are skipped — but written
// with auth ids by services/ca/services/directory.js).
const CROSS_SCHEMA_USER_COLUMNS = [
  ['profiles', 'user_id'],
  ['certificates', 'user_id'],
  ['tokens', 'user_id'],
  ['tickets', 'user_id'],
  ['audit_logs', 'user_id'],
  ['password_resets', 'user_id'],
  ['password_resets', 'initiated_by'],
  ['rate_limits', 'target_id'],
  ['UserGroups', 'user_id'],
];

const DROP_SQL = `
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT rel.relname AS tbl, con.conname AS con
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      JOIN pg_class frel ON frel.oid = con.confrelid
      JOIN pg_namespace fnsp ON fnsp.oid = frel.relnamespace
      JOIN LATERAL unnest(con.conkey) k(attnum) ON true
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = k.attnum
     WHERE con.contype = 'f'
       AND nsp.nspname = '${SCHEMA}'
       AND fnsp.nspname = '${SCHEMA}'
       AND frel.relname = 'users'
       AND (rel.relname, att.attname) IN (
${CROSS_SCHEMA_USER_COLUMNS.map(([t, c]) => `         ('${t}', '${c}')`).join(',\n')}
       )
  LOOP
    EXECUTE format('ALTER TABLE "${SCHEMA}".%I DROP CONSTRAINT %I', r.tbl, r.con);
    RAISE NOTICE 'dropped %.% (cross-schema user FK)', r.tbl, r.con;
  END LOOP;
END $$;
`;

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(DROP_SQL);
  },

  down: async () => {
    // Intentional no-op — see header. The dropped FKs are wrong by design and
    // must not come back.
  },
};
