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
// Fix: never let the seek key touch a JS Date. Select (and seek on) a
// fixed-width, UTC, microsecond-precision TEXT projection of the timestamp
// instead — `to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')`
// — which sorts identically to the underlying timestamp (fixed width, same
// format, same zone) and is compared as plain TEXT end to end: in Postgres
// (the seek WHERE + the ORDER BY use the exact same expression) and in
// Node (the cursor just carries the string through, untouched).

const { Op, where: sequelizeWhere, literal } = require('sequelize');

const CREATED_AT_US_ALIAS = '__createdAtUs';
const CREATED_AT_US_EXPR = `to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')`;

/** Spread into a Sequelize `attributes: { include: [...] }` array so the
 * query also selects the raw µs-precision sort key alongside the model's
 * normal (Date-typed, ms-precision) `createdAt` attribute. */
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
    return { createdAtUs: payload.createdAtUs, id: payload.id };
  } catch (err) {
    return null;
  }
}

/**
 * WHERE fragment that seeks strictly past `cursor`, matching `direction`
 * ('desc' = newest-first, e.g. session lists; 'asc' = oldest-first, e.g.
 * message history). Compares the SAME raw µs-precision expression the query
 * orders by (`keysetOrder`) — never the plain (ms-precision) `createdAt`
 * attribute. Must be combined (Op.and) with the query's own filters —
 * combining via a plain object spread would silently drop one side's Op.or.
 */
function seekWhere(cursor, direction) {
  if (!cursor) return null;
  const cmp = direction === 'asc' ? Op.gt : Op.lt;
  const usExpr = literal(CREATED_AT_US_EXPR);
  return {
    [Op.or]: [
      sequelizeWhere(usExpr, { [cmp]: cursor.createdAtUs }),
      {
        [Op.and]: [
          sequelizeWhere(usExpr, cursor.createdAtUs),
          { id: { [cmp]: cursor.id } },
        ],
      },
    ],
  };
}

/** ORDER clause matching seekWhere's key exactly — the same expression
 * drives both, so paging can never disagree with display order. */
function keysetOrder(direction) {
  const dir = direction === 'asc' ? 'ASC' : 'DESC';
  return [[literal(CREATED_AT_US_EXPR), dir], ['id', dir]];
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
async function fetchKeysetPage({ cursor, limit, direction, baseWhere, findAll }) {
  const seek = seekWhere(cursor, direction);
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
  CREATED_AT_US_ALIAS,
  CREATED_AT_US_EXPR,
};
