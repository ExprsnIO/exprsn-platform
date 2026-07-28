'use strict';

// TASK-063 — keyset ("seek") pagination shared by the cortex sessions/message
// list endpoints (chat.js, cs.js). Cursor-based paging avoids the classic
// OFFSET-page problem (dupes/gaps across a concurrent insert) — each page
// seeks strictly past the last row of the previous one, keyed on
// (createdAt, id) for a total, stable order (createdAt alone isn't unique
// enough to guarantee no ties).

const { Op } = require('sequelize');

/** Clamp a caller-supplied limit to (0, max], defaulting to `def` if absent/invalid. */
function clampLimit(raw, { max, def }) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(n, max);
}

/** Opaque cursor = base64url(JSON({createdAt, id})) of the last row on a page. */
function encodeCursor(row) {
  const payload = JSON.stringify({
    createdAt: new Date(row.createdAt).toISOString(),
    id: row.id,
  });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

/** Returns null on any malformed/tampered cursor (treated as "no cursor"). */
function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const payload = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    if (!payload || typeof payload.id === 'undefined' || !payload.createdAt) return null;
    const createdAt = new Date(payload.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: payload.id };
  } catch (err) {
    return null;
  }
}

/**
 * WHERE fragment that seeks strictly past `cursor`, matching `direction`
 * ('desc' = newest-first, e.g. session lists; 'asc' = oldest-first, e.g.
 * message history). Must be combined (Op.and) with the query's own filters —
 * combining via a plain object spread would silently drop one side's Op.or.
 */
function seekWhere(cursor, direction) {
  if (!cursor) return null;
  const cmp = direction === 'asc' ? Op.gt : Op.lt;
  return {
    [Op.or]: [
      { createdAt: { [cmp]: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { [cmp]: cursor.id } },
    ],
  };
}

/**
 * Fetch one page via keyset pagination: queries `limit + 1` rows to detect a
 * next page, trims back to `limit`, and returns `{ rows, nextCursor }`.
 *
 * `findAll(where, order, limit)` must return an array of already-ordered rows
 * (each with `createdAt` + `id`) — model-agnostic on purpose so ChatSession
 * and ChatMessage (different id types: string vs UUID) share this helper.
 */
async function fetchKeysetPage({ cursor, limit, direction, baseWhere, order, findAll }) {
  const seek = seekWhere(cursor, direction);
  const where = seek ? { [Op.and]: [baseWhere, seek] } : baseWhere;
  const rows = await findAll(where, order, limit + 1);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? encodeCursor(page[page.length - 1]) : null;
  return { rows: page, nextCursor };
}

module.exports = { clampLimit, encodeCursor, decodeCursor, seekWhere, fetchKeysetPage };
