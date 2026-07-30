'use strict';

// TASK-063 — keyset ("seek") pagination shared by the cortex sessions/message
// list endpoints (chat.js, cs.js). Cursor-based paging avoids the classic
// OFFSET-page problem (dupes/gaps across a concurrent insert) — each page
// seeks strictly past the last row of the previous one, keyed on
// (createdAt, id) for a total, stable order (createdAt alone isn't unique
// enough to guarantee no ties).
//
// BUG-063: the first cut of this file built the cursor from
// `new Date(row.createdAt).toISOString()`. That's millisecond precision, but
// Postgres `timestamptz` carries MICROSECONDS — and the truncation doesn't
// happen in that `new Date(...)` call, it already happened earlier: as soon
// as a plain Sequelize `createdAt` attribute is SELECTED, node-postgres's
// type parser materializes it as a JS `Date`, which is architecturally
// incapable of storing sub-millisecond precision. No amount of re-encoding
// that Date recovers the lost microseconds. Live symptom: ASC walks
// re-matched the page-boundary row on every subsequent page (the seek
// couldn't tell "the boundary row itself" from "a same-millisecond,
// different-microsecond sibling" — both looked >= the ms-truncated cursor);
// DESC walks silently dropped same-millisecond siblings the same way.
//
// BUG-067 amended how that fix works, without weakening it: the µs projection
// is now EMISSION-ONLY (it builds the cursor), while the seek and the ORDER BY
// both run on the physical `created_at` column. Ordering by the expression made
// the composite index unusable, so every page sorted the entire match set. The
// invariant is now structural — one column, referenced once in `seekWhere` and
// once in `keysetOrder` — rather than one long expression duplicated in two
// places where a one-character divergence would silently resurrect BUG-063.
//
// Original BUG-063 fix: never let the seek key touch a JS Date. Select a
// fixed-width, UTC, microsecond-precision TEXT projection of the timestamp
// instead — `to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')`
// — which sorts identically to the underlying timestamp (fixed width, same
// format, same zone) and is compared as plain TEXT end to end: in Postgres
// (the seek WHERE + the ORDER BY use the exact same expression) and in
// Node (the cursor just carries the string through, untouched).

const { Op, literal } = require('sequelize');

const CREATED_AT_US_ALIAS = '__createdAtUs';
// Exactly what CREATED_AT_US_EXPR emits: 'YYYY-MM-DDTHH:MI:SS.uuuuuu', no offset.
const CREATED_AT_US_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/;
const CREATED_AT_US_EXPR = `to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')`;

/**
 * Spread into a Sequelize `attributes: { include: [...] }` array so the query
 * also selects the raw µs-precision key alongside the model's normal
 * (Date-typed, ms-precision) `createdAt` attribute.
 *
 * **EMISSION ONLY** (BUG-067). This projection exists solely to get a
 * µs-precision value out of Postgres and into the cursor without it passing
 * through a JS `Date` — which is what silently truncated it and caused BUG-063.
 * It is NOT used for comparison: `seekWhere` and `keysetOrder` both work on the
 * physical `created_at` column, because `to_char(timestamptz, text)` is only
 * STABLE, not IMMUTABLE, and therefore cannot be indexed at all (an expression
 * index on it errors with "functions in index expression must be marked
 * IMMUTABLE"). Ordering by it was what produced BUG-067's per-match-set `Sort`.
 */
function createdAtUsAttribute() {
  return [literal(CREATED_AT_US_EXPR), CREATED_AT_US_ALIAS];
}

/** Clamp a caller-supplied limit to (0, max], defaulting to `def` if absent/invalid. */
function clampLimit(raw, { max, def }) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(n, max);
}

/** Pull the (createdAtUs, id) seek key off a fetched row/instance. Works for
 * both real Sequelize instances (`.get(alias)`) and plain test fixtures
 * (`row[alias]`) — deliberately framework-light so it's unit-testable
 * without a live Postgres connection. */
function keyOf(row) {
  const createdAtUs = typeof row.get === 'function' ? row.get(CREATED_AT_US_ALIAS) : row[CREATED_AT_US_ALIAS];
  return { createdAtUs, id: row.id };
}

/** Opaque cursor = base64url(JSON({createdAtUs, id})) of the last row on a
 * page. `createdAtUs` is the raw µs-precision sort key — a plain string,
 * NEVER a JS Date (BUG-063) — carried through byte-for-byte. */
function encodeCursor(row) {
  const { createdAtUs, id } = keyOf(row);
  return Buffer.from(JSON.stringify({ createdAtUs, id }), 'utf8').toString('base64url');
}

/** Returns null on any malformed/tampered/pre-BUG-063 cursor (treated as "no
 * cursor" — same fail-safe as before; the field rename from `createdAt` to
 * `createdAtUs` means any cursor issued before this fix simply restarts at
 * page 1 rather than erroring, which is fine — the format is opaque). */
function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const payload = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    if (!payload || typeof payload.id === 'undefined'
      || typeof payload.createdAtUs !== 'string' || !payload.createdAtUs) {
      return null;
    }
    // BUG-067: the seek interpolates this value into a literal (escaped), so a
    // validated cursor must be structurally incapable of carrying anything but
    // a fixed-width UTC µs timestamp — wrong precision, an offset already
    // present, or any SQL metacharacter all fail here and restart at page 1.
    if (!CREATED_AT_US_RE.test(payload.createdAtUs)) return null;
    return { createdAtUs: payload.createdAtUs, id: payload.id };
  } catch (err) {
    return null;
  }
}

/**
 * WHERE fragment that seeks strictly past `cursor` (BUG-067).
 *
 * ── Why this is row-wise, and why the `Z` matters ──────────────────────────
 * Two things here are load-bearing; both were established by measurement, not
 * taste (dba ruling, 2026-07-29).
 *
 * 1. **Row-wise, not OR-form.** The previous
 *    `(key > c) OR (key = c AND id > c.id)` shape gets **no index bound at
 *    all**: Postgres uses the index only for the `session_id` equality prefix
 *    and drops the entire seek into a `Filter:`, so every page re-walked the
 *    whole session history. `(created_at, id) > (…, …)` produces a real
 *    `Index Cond` over both columns.
 *
 * 2. **The cursor literal MUST carry `Z`.** The emitted cursor is UTC
 *    wall-clock (the projection is `AT TIME ZONE 'UTC'`). An offset-less cast
 *    is interpreted in the SESSION's TimeZone, so on a non-UTC connection the
 *    seek key silently skews — verified: under `America/New_York`,
 *    `'…T03:00:01.000011'::timestamptz` lands 4 hours off, while the `Z` form
 *    is correct. It survives review only because the dev box happens to be
 *    `Etc/UTC`. The `Z` is appended HERE, at seek-build time, rather than at
 *    emission, so cursors issued before this change keep working byte-identically
 *    instead of becoming zone-skewed.
 *
 * The comparison is now on the physical `created_at` column — the same column
 * `keysetOrder` sorts by — so BUG-063's "seek and sort must use the identical
 * key" invariant is structural rather than a matter of keeping two copies of a
 * 60-character expression in sync.
 *
 * `escape` is REQUIRED: `literal` does not bind parameters, so the caller must
 * supply the connection's escaper. The `CREATED_AT_US_RE` check in
 * `decodeCursor` is defence-in-depth on top of that, never a substitute.
 */
function seekWhere(cursor, direction, escape) {
  if (!cursor) return null;
  if (typeof escape !== 'function') {
    // Deliberately a throw, not a silent fallback: an optional escaper is an
    // invitation to inline unvalidated input here later.
    throw new Error('seekWhere requires an escape function');
  }
  const cmp = direction === 'asc' ? '>' : '<';
  const ts = escape(`${cursor.createdAtUs}Z`);
  const id = escape(String(cursor.id));
  return literal(`("created_at", "id") ${cmp} (${ts}::timestamptz, ${id})`);
}

/**
 * ORDER clause matching `seekWhere`'s key exactly — both now reference the
 * plain `created_at` column, so the composite indexes
 * `(session_id, created_at, id)` / `(channel[, user_id], created_at, id)` can
 * serve the ordering and no `Sort` node is produced. `id` must be in the index
 * too: without it the pathkeys stop one column short and Postgres adds an
 * `Incremental Sort` on every page.
 */
function keysetOrder(direction) {
  const dir = direction === 'asc' ? 'ASC' : 'DESC';
  // NOTE (dba, verified 2026-07-30): Sequelize renders these as
  // `ORDER BY "createdAt" ASC, "ChatMessage"."id" ASC` — the first term as the
  // output ALIAS, the second as the qualified physical column — while the seek
  // in `seekWhere` uses `("created_at", "id")`. That asymmetry is real but
  // BENIGN: the alias projects the raw column, all four spellings
  // ('createdAt', 'created_at', col(), literal()) produce identical plans, and
  // any future divergence (e.g. a join projecting a second `createdAt`) would be
  // a hard Postgres ambiguity ERROR, not silent wrongness. Left as-is
  // deliberately — it looks like a bug at review and is not one, so do not
  // "fix" it blind.
  return [['createdAt', dir], ['id', dir]];
}

/**
 * Remove the internal µs sort key from a fetched row (BUG-066).
 *
 * Works for both real Sequelize instances (delete from `dataValues`, so
 * `toJSON()`/`res.json()` no longer emit it) and the plain objects the unit
 * tests use. Returns the row for convenience.
 */
function stripKeysetAlias(row) {
  if (!row) return row;
  if (row.dataValues && Object.prototype.hasOwnProperty.call(row.dataValues, CREATED_AT_US_ALIAS)) {
    delete row.dataValues[CREATED_AT_US_ALIAS];
  } else if (Object.prototype.hasOwnProperty.call(row, CREATED_AT_US_ALIAS)) {
    delete row[CREATED_AT_US_ALIAS];
  }
  return row;
}

/**
 * Fetch one page via keyset pagination: queries `limit + 1` rows to detect a
 * next page, trims back to `limit`, and returns `{ rows, nextCursor }`.
 *
 * `findAll(where, order, limit)` must return an array of already-ordered rows
 * (each exposing `id` and the `createdAtUsAttribute()` alias) — model-agnostic
 * on purpose so ChatSession and ChatMessage (different id types: string vs
 * UUID) share this helper.
 */
async function fetchKeysetPage({ cursor, limit, direction, baseWhere, findAll, escape }) {
  const seek = seekWhere(cursor, direction, escape);
  const where = seek ? { [Op.and]: [baseWhere, seek] } : baseWhere;
  const order = keysetOrder(direction);
  const rows = await findAll(where, order, limit + 1);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? encodeCursor(page[page.length - 1]) : null;
  // BUG-066: the µs sort key is an INTERNAL paging detail. It has to be
  // SELECTed (Postgres does the comparison), but it must not ride out to
  // clients — handlers that serialize rows directly (the message-history
  // routes) would otherwise expose `__createdAtUs` as an accidental API field.
  // Stripping here rather than in each route makes every consumer clean by
  // construction, including ones written later. Done AFTER encodeCursor, which
  // is the last reader of the alias.
  page.forEach(stripKeysetAlias);
  return { rows: page, nextCursor };
}

module.exports = {
  clampLimit,
  encodeCursor,
  decodeCursor,
  seekWhere,
  keysetOrder,
  fetchKeysetPage,
  stripKeysetAlias,
  createdAtUsAttribute,
  CREATED_AT_US_RE,
  CREATED_AT_US_ALIAS,
  CREATED_AT_US_EXPR,
};
