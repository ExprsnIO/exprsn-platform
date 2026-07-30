'use strict';

/**
 * BUG-067 — composite indexes so keyset paging is index-ordered instead of
 * sorting the whole match set on every page.
 *
 * BUG-063 correctly fixed a µs-truncation bug by seeking and ordering on
 * `to_char(created_at AT TIME ZONE 'UTC', …)`. That expression is opaque to the
 * planner, so `chat_messages_session_id_created_at` could not serve the ordering
 * and each page materialised + sorted every row matching the base WHERE.
 * Measured before this change on a 250k-row benchmark: the message-history page
 * sorted 205 rows to return 51, and the session list sorted 533 to return 101 —
 * cost per MATCH SET, which is precisely what keyset pagination exists to avoid.
 *
 * The code half of the fix (see `lib/keysetPagination.js`) moves the seek and the
 * ORDER BY onto the physical `created_at` column, keeping the µs projection for
 * cursor EMISSION only. This migration supplies the indexes that then become
 * usable.
 *
 * ── Why `id` is in each index (dba, 2026-07-29) ────────────────────────────
 * Not decoration. The queries order by `(created_at, id)`; an index stopping at
 * `created_at` yields pathkeys one column short, and Postgres adds an
 * `Incremental Sort` node to every page. With `id` present the seek's row-wise
 * comparison becomes a full `Index Cond` over both columns.
 *
 * No DESC operator classes are needed: btree scans backward, so
 * `ORDER BY created_at DESC, id DESC` (both keys reversed uniformly) is served
 * by an `Index Only Scan Backward` / `Index Scan Backward`.
 *
 * The two dropped indexes are strict PREFIXES of new ones and therefore
 * redundant. `chat_sessions_user_id` is NOT a prefix of anything added here and
 * is deliberately kept.
 *
 * Accepted, recorded, not fixed: a session-list query with `user_id IS NULL`
 * still sorts — an `IS NULL` on a middle index column does not fix pathkeys for
 * the trailing ones. The scan is still index-bounded, and `caRead` means
 * `req.userId` is set in practice. A partial index `WHERE user_id IS NULL` is
 * the fix if that ever changes; deliberately not added now.
 *
 * Every identifier is schema-qualified rather than relying on `search_path` —
 * that is the STATUS.md #1 path by which objects leak into `public`.
 *
 * Cortex has no sequelize-cli wiring, so this runs via `up()` directly. Dev
 * tables are tiny, so plain `CREATE INDEX` is fine; a non-trivial deployment
 * should use `CREATE INDEX CONCURRENTLY` **outside** any transaction, which is
 * why nothing here opens one.
 *
 * Idempotent both ways (`IF NOT EXISTS` / `IF EXISTS`).
 *
 * ── Notes on `down()` (dba, 2026-07-30) ───────────────────────────────────
 * It recreates the two prefix indexes BEFORE dropping the composites, so a
 * rollback never leaves paging with no usable index. Two caveats:
 *
 *   - On a FRESH database the prefixes never existed — sync creates only the
 *     composites from the model definitions — so `down()` there CREATES two
 *     indexes that were never present. Harmless, but it means `down()` is not a
 *     strict inverse on that path.
 *   - **Correctness never depended on these indexes.** A DB-only rollback
 *     against the new code still returns correct pages; it just reintroduces an
 *     `Incremental Sort`. Stated explicitly so a failed rollback is not
 *     misread as a data-integrity event.
 */

const SCHEMA = 'cortex';

const CREATE = [
  // message history: filter session_id, order (created_at, id) ASC
  `CREATE INDEX IF NOT EXISTS "chat_messages_session_id_created_at_id"
     ON "${SCHEMA}"."chat_messages" ("session_id", "created_at", "id")`,
  // session list, admin path: filter channel, order (created_at, id) DESC
  `CREATE INDEX IF NOT EXISTS "chat_sessions_channel_created_at_id"
     ON "${SCHEMA}"."chat_sessions" ("channel", "created_at", "id")`,
  // session list, owner path: filter channel + user_id, order (created_at, id) DESC
  `CREATE INDEX IF NOT EXISTS "chat_sessions_channel_user_id_created_at_id"
     ON "${SCHEMA}"."chat_sessions" ("channel", "user_id", "created_at", "id")`,
];

// Strict prefixes of the above — redundant once the composites exist.
const DROP_REDUNDANT = [
  `DROP INDEX IF EXISTS "${SCHEMA}"."chat_messages_session_id_created_at"`,
  `DROP INDEX IF EXISTS "${SCHEMA}"."chat_sessions_channel"`,
];

module.exports = {
  up: async (queryInterface) => {
    const { sequelize } = queryInterface;
    for (const sql of CREATE) {
      // eslint-disable-next-line no-await-in-loop
      await sequelize.query(sql);
    }
    for (const sql of DROP_REDUNDANT) {
      // eslint-disable-next-line no-await-in-loop
      await sequelize.query(sql);
    }
    const [rows] = await sequelize.query(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname = '${SCHEMA}'
          AND tablename IN ('chat_messages', 'chat_sessions')
        ORDER BY indexname`,
    );
    // eslint-disable-next-line no-console
    console.log(`[BUG-067] ${SCHEMA} chat indexes now: ${rows.map((r) => r.indexname).join(', ')}`);
  },

  down: async (queryInterface) => {
    const { sequelize } = queryInterface;
    // Restore the prefixes first so paging is never left with no usable index.
    await sequelize.query(`CREATE INDEX IF NOT EXISTS "chat_messages_session_id_created_at"
       ON "${SCHEMA}"."chat_messages" ("session_id", "created_at")`);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS "chat_sessions_channel"
       ON "${SCHEMA}"."chat_sessions" ("channel")`);
    for (const name of ['chat_messages_session_id_created_at_id',
      'chat_sessions_channel_created_at_id',
      'chat_sessions_channel_user_id_created_at_id']) {
      // eslint-disable-next-line no-await-in-loop
      await sequelize.query(`DROP INDEX IF EXISTS "${SCHEMA}"."${name}"`);
    }
  },
};
