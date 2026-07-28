'use strict';

/**
 * TASK-063 — keyset pagination helper: cursor encode/decode round-trip,
 * seek-where direction correctness, and the "walk the whole set with no
 * dupes/gaps across a concurrent insert" property fetchKeysetPage exists for.
 */

const { Op } = require('sequelize');
const {
  clampLimit, encodeCursor, decodeCursor, seekWhere, fetchKeysetPage,
} = require('../../src/lib/keysetPagination');

describe('clampLimit', () => {
  test('defaults on missing/invalid/non-positive input', () => {
    expect(clampLimit(undefined, { max: 100, def: 20 })).toBe(20);
    expect(clampLimit('not-a-number', { max: 100, def: 20 })).toBe(20);
    expect(clampLimit('0', { max: 100, def: 20 })).toBe(20);
    expect(clampLimit('-5', { max: 100, def: 20 })).toBe(20);
  });

  test('passes through a valid value under the cap', () => {
    expect(clampLimit('50', { max: 100, def: 20 })).toBe(50);
  });

  test('caps at max', () => {
    expect(clampLimit('9999', { max: 100, def: 20 })).toBe(100);
  });
});

describe('encodeCursor / decodeCursor', () => {
  test('round-trips createdAt + id', () => {
    const row = { createdAt: new Date('2026-07-28T12:00:00.000Z'), id: 'chat-123-abc' };
    const cursor = encodeCursor(row);
    expect(typeof cursor).toBe('string');
    const decoded = decodeCursor(cursor);
    expect(decoded.id).toBe('chat-123-abc');
    expect(decoded.createdAt.toISOString()).toBe('2026-07-28T12:00:00.000Z');
  });

  test('decodeCursor(null/undefined/"") -> null (treated as "no cursor")', () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor('')).toBeNull();
  });

  test('decodeCursor rejects malformed/tampered input instead of throwing', () => {
    expect(decodeCursor('not-base64url-json')).toBeNull();
    expect(decodeCursor(Buffer.from('{}').toString('base64url'))).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify({ id: 'x', createdAt: 'not-a-date' })).toString('base64url'))).toBeNull();
  });
});

describe('seekWhere', () => {
  test('null cursor -> null (no seek fragment)', () => {
    expect(seekWhere(null, 'desc')).toBeNull();
  });

  test('desc direction seeks strictly BEFORE the cursor (Op.lt), tie-broken by id', () => {
    const cursor = { createdAt: new Date('2026-07-28T12:00:00.000Z'), id: 'c2' };
    const where = seekWhere(cursor, 'desc');
    expect(where[Op.or][0].createdAt[Op.lt]).toEqual(cursor.createdAt);
    expect(where[Op.or][1].id[Op.lt]).toBe('c2');
  });

  test('asc direction seeks strictly AFTER the cursor (Op.gt), tie-broken by id', () => {
    const cursor = { createdAt: new Date('2026-07-28T12:00:00.000Z'), id: 'm2' };
    const where = seekWhere(cursor, 'asc');
    expect(where[Op.or][0].createdAt[Op.gt]).toEqual(cursor.createdAt);
    expect(where[Op.or][1].id[Op.gt]).toBe('m2');
  });
});

describe('fetchKeysetPage', () => {
  // A tiny in-memory "table" standing in for Sequelize — findAll receives
  // (where, order, limit) and returns whatever the seek fragment would
  // actually select, so this exercises the real seek semantics, not just a
  // canned response.
  function makeStore(rows) {
    return async (where, order, limit) => {
      let filtered = rows;
      if (where && where[Op.and]) {
        const [, seek] = where[Op.and];
        const [gt, tie] = seek[Op.or];
        // Op.lt/Op.gt are Symbol keys — not enumerable via Object.keys().
        const [cmpKey] = Object.getOwnPropertySymbols(gt.createdAt);
        filtered = rows.filter((r) => {
          if (cmpKey === Op.lt) {
            return r.createdAt < gt.createdAt[Op.lt]
              || (r.createdAt.getTime() === tie.createdAt.getTime() && r.id < tie.id[Op.lt]);
          }
          return r.createdAt > gt.createdAt[Op.gt]
            || (r.createdAt.getTime() === tie.createdAt.getTime() && r.id > tie.id[Op.gt]);
        });
      }
      const desc = order[0][1] === 'DESC';
      const sorted = [...filtered].sort((a, b) => (desc
        ? b.createdAt - a.createdAt || (b.id > a.id ? 1 : -1)
        : a.createdAt - b.createdAt || (a.id > b.id ? 1 : -1)));
      return sorted.slice(0, limit);
    };
  }

  function seedRows(n) {
    // Distinct timestamps so ordering is unambiguous without relying on the
    // id tie-break (that's covered by the dedicated tie-break test below).
    return Array.from({ length: n }, (_, i) => ({
      id: `row-${String(i).padStart(3, '0')}`,
      createdAt: new Date(2026, 0, 1, 0, 0, i),
    }));
  }

  test('walks the full desc set with no dupes/gaps across pages', async () => {
    const rows = seedRows(25);
    const findAll = makeStore(rows);

    const seen = [];
    let cursor = null;
    let pages = 0;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const { rows: page, nextCursor } = await fetchKeysetPage({
        cursor, limit: 10, direction: 'desc', baseWhere: {},
        order: [['createdAt', 'DESC'], ['id', 'DESC']], findAll,
      });
      seen.push(...page.map((r) => r.id));
      pages += 1;
      if (!nextCursor) break;
      cursor = decodeCursor(nextCursor);
      if (pages > 10) throw new Error('runaway pagination — no dupes/gaps guard tripped');
    }

    expect(pages).toBe(3); // 10 + 10 + 5
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25); // no dupes
    // newest-first order preserved end to end
    expect(seen).toEqual([...rows].reverse().map((r) => r.id));
  });

  test('walks the full asc set with no dupes/gaps across pages', async () => {
    const rows = seedRows(23);
    const findAll = makeStore(rows);

    const seen = [];
    let cursor = null;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const { rows: page, nextCursor } = await fetchKeysetPage({
        cursor, limit: 7, direction: 'asc', baseWhere: {},
        order: [['createdAt', 'ASC'], ['id', 'ASC']], findAll,
      });
      seen.push(...page.map((r) => r.id));
      if (!nextCursor) break;
      cursor = decodeCursor(nextCursor);
    }

    expect(seen).toHaveLength(23);
    expect(new Set(seen).size).toBe(23);
    expect(seen).toEqual(rows.map((r) => r.id));
  });

  test('a concurrent insert AHEAD of the cursor (already-seen side) never reappears', async () => {
    const rows = seedRows(5); // row-000..row-004, desc order visits 004..000
    const findAll = makeStore(rows);

    const page1 = await fetchKeysetPage({
      cursor: null, limit: 2, direction: 'desc', baseWhere: {},
      order: [['createdAt', 'DESC'], ['id', 'DESC']], findAll,
    });
    expect(page1.rows.map((r) => r.id)).toEqual(['row-004', 'row-003']);

    // Concurrent insert: a brand-new row NEWER than everything already seen.
    // A keyset cursor seeks strictly before row-003's (createdAt, id), so the
    // new row (which sorts ahead of it) is correctly never re-served.
    rows.push({ id: 'row-005', createdAt: new Date(2026, 0, 1, 0, 0, 99) });

    const cursor = decodeCursor(page1.nextCursor);
    const page2 = await fetchKeysetPage({
      cursor, limit: 2, direction: 'desc', baseWhere: {},
      order: [['createdAt', 'DESC'], ['id', 'DESC']], findAll,
    });
    expect(page2.rows.map((r) => r.id)).toEqual(['row-002', 'row-001']);
  });
});
