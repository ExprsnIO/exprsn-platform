'use strict';

/**
 * BUG-064 — sweep the duplicate UNIQUE/FK constraints that dev-boot alter-sync
 * accreted on the `cortex` schema.
 *
 * `services/cortex/src/index.js` used to run `sequelize.sync({ alter: true })`
 * on every development boot. Alter-sync cannot match an existing constraint by
 * name, so each start re-added it and Postgres suffixed the duplicate:
 * `agents_name_key` → `agents_name_key1` → `…2` → …, and the same for the
 * chat_messages/agent_runs FKs. Measured live before this ran: **110 redundant
 * constraints across 6 groups** — 21 identical `UNIQUE(name)` on each of
 * `guardrails`, `skills` and `tools`; 21 identical FKs on `chat_messages`;
 * 16 each on `agents` and `agent_runs`.
 *
 * The real cost is not disk. Each duplicate FK carries its own pair of
 * referential-integrity triggers on BOTH ends, so 21 duplicates means ~21× the
 * RI trigger work on every insert/update of `chat_messages` and every
 * delete/update of `chat_sessions`. Each duplicate UNIQUE is an index Postgres
 * maintains on every write.
 *
 * The accretion is stopped at the source in the same commit (plain `sync()`).
 * This migration cleans up what already accumulated.
 *
 * ── How it decides what to drop (dba-reviewed, 2026-07-29) ─────────────────
 * Two independent conditions must BOTH hold before anything is dropped:
 *
 *   1. Byte-identical DEFINITION. Constraints are grouped by
 *      `(conrelid, contype, pg_get_constraintdef(oid))`, which renders the
 *      fully normalized definition — column list and order, ON UPDATE/ON DELETE
 *      actions, MATCH, DEFERRABLE, NOT VALID, NULLS NOT DISTINCT, INCLUDE — and
 *      schema-qualifies referenced relations. So a NOT-VALID or deferrable
 *      variant lands in its own group and survives, and an FK to
 *      `cortex.chat_sessions` can never group with one to `public.chat_sessions`.
 *
 *   2. A Postgres-GENERATED name. Only names matching `_(key|fkey)\d+$` whose
 *      base matches the keeper's are dropped. Definition-identity alone is NOT
 *      enough: a deliberately named constraint (`uniq_agents_name`) can be
 *      definition-identical to a generated one, and "shortest name wins" would
 *      silently drop the intentional one — breaking anything doing
 *      `ON CONFLICT ON CONSTRAINT`. Anything that fails this test is logged and
 *      left alone, which also makes this migration safe to reuse verbatim on
 *      schemas whose constraint names have not been audited (BUG-071).
 *
 * ── Locking ────────────────────────────────────────────────────────────────
 * `ALTER TABLE … DROP CONSTRAINT` takes ACCESS EXCLUSIVE — it blocks readers,
 * not just writers — and an FK drop takes it on BOTH ends. All of it is
 * catalog-only (no rewrite, no scan, no validation), so each statement is
 * sub-millisecond regardless of row count; the cost is lock acquisition, not
 * work. On a single-instance dev DB that is free, so this runs as one
 * transaction with a `lock_timeout` so a dependency error rolls the whole sweep
 * back rather than leaving the schema half-swept.
 *
 * PRODUCTION CAVEAT (record before ever running this outside dev): one
 * transaction would hold ACCESS EXCLUSIVE on chat_messages, chat_sessions,
 * agent_runs, agents, guardrails, skills and tools for its whole duration, and
 * an ACCESS EXCLUSIVE request queues behind any in-flight long read while
 * itself blocking everything behind it — the classic lock-queue stall. In
 * production: go per-table in separate transactions, keep the lock_timeout, and
 * retry on timeout.
 *
 * Idempotent: after one pass every group has a single member, so a re-run is a
 * no-op.
 *
 * NOT reversible, deliberately — `down()` would mean re-creating redundant
 * constraints, which is the bug.
 *
 * Cortex has no sequelize-cli wiring and no `SequelizeMeta` table, so this is
 * applied by running `up()` directly against the cortex connection (the
 * documented ALTER path for this repo), and nothing in the DB will record that
 * it ran — the applied timestamp and before/after counts go on the ticket.
 */

const SCHEMA = 'cortex';

/** PG-generated duplicate suffix, e.g. `agents_name_key12`. */
const GENERATED_SUFFIX = /_(key|fkey)\d+$/;
const baseName = (n) => n.replace(/\d+$/, '');

/**
 * Constraint groups with more than one member sharing an identical definition.
 *
 * The `::text` cast on conname is REQUIRED, not cosmetic: conname is the `name`
 * type, so array_agg yields name[] (OID 1003), for which node-postgres has no
 * array parser — the driver hands back the raw '{a,b,c}' literal as a STRING,
 * and destructuring that walks characters instead of names. Casting to text[]
 * (OID 1009) gets a real JS array. The Array.isArray guard in up() is there so
 * this can never regress silently.
 */
const FIND_DUPES = `
  SELECT t.relname                          AS table_name,
         pg_get_constraintdef(c.oid)        AS def,
         c.contype                          AS kind,
         -- ::text is REQUIRED, not cosmetic -- see the note above FIND_DUPES.
         array_agg(c.conname::text ORDER BY length(c.conname), c.conname) AS names
    FROM pg_constraint c
    JOIN pg_class     t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
   WHERE n.nspname = :schema
     AND c.contype IN ('u', 'f')
   GROUP BY c.conrelid, t.relname, pg_get_constraintdef(c.oid), c.contype
  HAVING count(*) > 1
`;

/**
 * Indexes that LOOK like generated duplicates but are NOT owned by a
 * constraint. A constraint-backed index cannot be dropped directly — Postgres
 * errors with "cannot drop index … because constraint … requires it" — and
 * `pg_indexes` happily lists them, so the ownership guard is what keeps this
 * pass from aborting the migration. Primary/replica-identity indexes are
 * excluded belt-and-braces.
 */
const FIND_ORPHAN_INDEXES = `
  SELECT i.relname AS indexname
    FROM pg_class     i
    JOIN pg_namespace n ON n.oid = i.relnamespace
   WHERE n.nspname = :schema
     AND i.relkind IN ('i', 'I')
     AND i.relname ~ '_(key|fkey)[0-9]+$'
     AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.oid)
     AND NOT EXISTS (
       SELECT 1 FROM pg_index x
        WHERE x.indexrelid = i.oid AND (x.indisprimary OR x.indisreplident)
     )
`;

module.exports = {
  up: async (queryInterface) => {
    const { sequelize } = queryInterface;

    await sequelize.transaction(async (transaction) => {
      // Bounded wait: fail fast rather than joining a lock queue.
      await sequelize.query("SET LOCAL lock_timeout = '5s'", { transaction });

      const groups = await sequelize.query(FIND_DUPES, {
        replacements: { schema: SCHEMA },
        type: sequelize.QueryTypes.SELECT,
        transaction,
      });

      let dropped = 0;
      let skipped = 0;
      for (const g of groups) {
        if (!Array.isArray(g.names)) {
          // Guard the driver-parsing assumption above rather than silently
          // mis-walking a string.
          throw new Error(`[BUG-064] expected names[] to be an array, got ${typeof g.names}`);
        }
        const [keep, ...rest] = g.names;
        // Both conditions: generated-looking AND the same base name as the keeper.
        const extras = rest.filter(
          (n) => GENERATED_SUFFIX.test(n) && baseName(n) === baseName(keep));
        const notDropped = rest.filter((n) => !extras.includes(n));

        for (const name of extras) {
          // eslint-disable-next-line no-await-in-loop
          await sequelize.query(
            `ALTER TABLE "${SCHEMA}"."${g.table_name}" DROP CONSTRAINT IF EXISTS "${name}";`,
            { transaction },
          );
          dropped += 1;
        }
        if (notDropped.length) {
          skipped += notDropped.length;
          // A definition-identical constraint with a name we did not generate is
          // somebody's deliberate choice. Never silently removed.
          // eslint-disable-next-line no-console
          console.warn(`[BUG-064] ${SCHEMA}.${g.table_name}: NOT dropping non-generated `
            + `duplicate(s): ${notDropped.join(', ')}`);
        }
        // eslint-disable-next-line no-console
        console.log(`[BUG-064] ${SCHEMA}.${g.table_name}: kept ${keep}, `
          + `dropped ${extras.length} generated duplicate(s)`);
      }

      // Dropping a UNIQUE constraint takes its backing index with it, so this
      // pass is not load-bearing for the sweep above — it only catches residue
      // from constraints dropped by hand at some point.
      const orphans = await sequelize.query(FIND_ORPHAN_INDEXES, {
        replacements: { schema: SCHEMA },
        type: sequelize.QueryTypes.SELECT,
        transaction,
      });
      for (const o of orphans) {
        // eslint-disable-next-line no-console
        console.log(`[BUG-064] dropping orphaned index ${SCHEMA}.${o.indexname}`);
        // eslint-disable-next-line no-await-in-loop
        await sequelize.query(`DROP INDEX IF EXISTS "${SCHEMA}"."${o.indexname}";`, { transaction });
        dropped += 1;
      }

      // eslint-disable-next-line no-console
      console.log(`[BUG-064] swept ${dropped} redundant constraint(s)/index(es) from `
        + `${SCHEMA}${skipped ? `; left ${skipped} non-generated duplicate(s) in place` : ''}`);
    });
  },

  down: async () => {
    // Intentionally a no-op: reversing this would mean re-creating duplicate
    // constraints, which is precisely the defect. The forward state (exactly one
    // constraint per definition) is the correct one.
  },
};
