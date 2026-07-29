'use strict';

/**
 * TASK-063 — keyset pagination helper: cursor encode/decode round-trip,
 * seek-where direction correctness, and the "walk the whole set with no
 * dupes/gaps across a concurrent insert" property fetchKeysetPage exists for.
 *
 * BUG-063 regression coverage: the original cursor round-tripped `createdAt`
 * through a JS `Date` (millisecond-only) while Postgres `timestamptz` carries
 * MICROSECONDS — same-millisecond/different-microsecond rows silently
 * dropped (DESC) or duplicated (ASC). The fix seeks on a raw µs-precision
 * TEXT projection instead of ever touching a Date. A pure in-memory unit test
 * can't reproduce a live Postgres driver's Date-parsing truncation directly,
 * but it CAN — and does, below — prove the two things that actually matter:
 * (1) the cursor/seek logic operates on the µs string byte-for-byte, never
 * coercing it through `new Date(...)` anywhere (the class of regression this
 * guards against), and (2) two rows that share an identical millisecond but
 * differ at the microsecond are walked exactly once each, in both directions.
 * The live-Postgres side of this (real `timestamptz` columns, real driver)
 * is verified separately against the dev DB — see BUG-063's resolution note
 * in sprints/BACKLOG.md for that walk's seeded rows/results.
 */

const { Op } = require('sequelize');
const {
  clampLimit, encodeCursor, decodeCursor, seekWhere, keysetOrder, fetchKeysetPage,
  CREATED_AT_US_ALIAS, CREATED_AT_US_EXPR,
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
  test('round-trips createdAtUs (a plain string) + id', () => {
    const row = { [CREATED_AT_US_ALIAS]: '2026-07-28T12:00:00.000123', id: 'chat-123-abc' };
    const cursor = encodeCursor(row);
    expect(typeof cursor).toBe('string');
    const decoded = decodeCursor(cursor);
    expect(decoded.id).toBe('chat-123-abc');
    expect(decoded.createdAtUs).toBe('2026-07-28T12:00:00.000123');
  });

  test('BUG-063 regression: microsecond precision is preserved exactly — never coerced through a JS Date', () => {
    // A value that a `new Date(...)` round-trip would silently collapse
    // (Date.toISOString() truncates to 3 fractional digits): if this ever
    // got wrapped in a Date anywhere in the encode/decode path, the assertion
    // below would fail because '.123456' would come back as '.123'.
    const usValue = '2026-07-28T23:41:07.123456';
    const row = { [CREATED_AT_US_ALIAS]: usValue, id: 'row-x' };
    const decoded = decodeCursor(encodeCursor(row));
    expect(decoded.createdAtUs).toBe(usValue);
    expect(typeof decoded.createdAtUs).toBe('string');
  });

  test('works off a Sequelize-instance-shaped row too (.get(alias) instead of a plain property)', () => {
    const usValue = '2026-07-28T23:41:07.999999';
    const row = { id: 'row-y', get: (key) => (key === CREATED_AT_US_ALIAS ? usValue : undefined) };
    const decoded = decodeCursor(encodeCursor(row));
    expect(decoded.createdAtUs).toBe(usValue);
  });

  test('decodeCursor(null/undefined/"") -> null (treated as "no cursor")', () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor('')).toBeNull();
  });

  test('decodeCursor rejects malformed/tampered/pre-BUG-063 input instead of throwing (200 page 1)', () => {
    expect(decodeCursor('not-base64url-json')).toBeNull();
    expect(decodeCursor(Buffer.from('{}').toString('base64url'))).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify({ id: 'x', createdAtUs: '' })).toString('base64url'))).toBeNull();
    // A cursor from the pre-fix (`createdAt`, not `createdAtUs`) encoding —
    // must degrade gracefully to "no cursor", not throw.
    expect(decodeCursor(Buffer.from(JSON.stringify({ id: 'x', createdAt: '2026-01-01T00:00:00.000Z' })).toString('base64url'))).toBeNull();
  });
});

describe('seekWhere / keysetOrder', () => {
  test('null cursor -> null (no seek fragment)', () => {
    expect(seekWhere(null, 'desc')).toBeNull();
  });

  test('desc direction seeks strictly BEFORE the cursor on the raw µs expression (Op.lt), tie-broken by id', () => {
    const cursor = { createdAtUs: '2026-07-28T12:00:00.500000', id: 'c2' };
    const where = seekWhere(cursor, 'desc');
    const [strict, tie] = where[Op.or];
    expect(strict.attribute.val).toBe(CREATED_AT_US_EXPR); // compares the µs expr, not the ms-precision `createdAt` attribute
    const [ltSym] = Object.getOwnPropertySymbols(strict.logic);
    expect(ltSym).toBe(Op.lt);
    expect(strict.logic[Op.lt]).toBe('2026-07-28T12:00:00.500000');
    const [eqClause, idClause] = tie[Op.and];
    expect(eqClause.logic).toBe('2026-07-28T12:00:00.500000'); // exact equality, still on the raw µs expr
    expect(idClause.id[Op.lt]).toBe('c2');
  });

  test('asc direction seeks strictly AFTER the cursor on the raw µs expression (Op.gt), tie-broken by id', () => {
    const cursor = { createdAtUs: '2026-07-28T12:00:00.500000', id: 'm2' };
    const where = seekWhere(cursor, 'asc');
    const [strict, tie] = where[Op.or];
    const [gtSym] = Object.getOwnPropertySymbols(strict.logic);
    expect(gtSym).toBe(Op.gt);
    expect(strict.logic[Op.gt]).toBe('2026-07-28T12:00:00.500000');
    const [, idClause] = tie[Op.and];
    expect(idClause.id[Op.gt]).toBe('m2');
  });

  test('keysetOrder sorts on the SAME raw µs expression as seekWhere, never the plain createdAt attribute', () => {
    const [first, second] = keysetOrder('desc');
    expect(first[0].val).toBe(CREATED_AT_US_EXPR);
    expect(first[1]).toBe('DESC');
    expect(second).toEqual(['id', 'DESC']);
  });
});

describe('fetchKeysetPage', () => {
  // A tiny in-memory "table" standing in for Sequelize/Postgres — findAll
  // receives (where, order, limit) and filters/sorts on the raw createdAtUs
  // STRING exactly the way Postgres would compare the real µs-precision TEXT
  // expression, so this exercises the real seek semantics (string
  // comparison), not just a canned response.
  function evalCond(row, cond) {
    if (cond == null) return true;
    if (cond[Op.and]) return cond[Op.and].every((c) => evalCond(row, c));
    if (cond[Op.or]) return cond[Op.or].some((c) => evalCond(row, c));
    if (cond.attribute && cond.attribute.val === CREATED_AT_US_EXPR) {
      const { logic } = cond;
      if (logic && typeof logic === 'object') {
        const [sym] = Object.getOwnPropertySymbols(logic);
        if (sym === Op.gt) return row[CREATED_AT_US_ALIAS] > logic[Op.gt];
        if (sym === Op.lt) return row[CREATED_AT_US_ALIAS] < logic[Op.lt];
        throw new Error(`unsupported comparator in test mock: ${String(sym)}`);
      }
      return row[CREATED_AT_US_ALIAS] === logic;
    }
    return Object.entries(cond).every(([k, v]) => {
      if (v && typeof v === 'object') {
        const [sym] = Object.getOwnPropertySymbols(v);
        if (sym === Op.lt) return row[k] < v[sym];
        if (sym === Op.gt) return row[k] > v[sym];
        return true;
      }
      return row[k] === v;
    });
  }

  function makeStore(rows) {
    return async (where, order, limit) => {
      const filtered = rows.filter((r) => evalCond(r, where));
      const desc = order[0][1] === 'DESC';
      const sorted = [...filtered].sort((a, b) => {
        if (a[CREATED_AT_US_ALIAS] !== b[CREATED_AT_US_ALIAS]) {
          const cmp = a[CREATED_AT_US_ALIAS] < b[CREATED_AT_US_ALIAS] ? -1 : 1;
          return desc ? -cmp : cmp;
        }
        const cmp = a.id < b.id ? -1 : 1;
        return desc ? -cmp : cmp;
      });
      return sorted.slice(0, limit);
    };
  }

  function usAt(seconds, micros = 0) {
    // Fixed-width µs-precision string, matching to_char's 'YYYY-MM-DD"T"HH24:MI:SS.US'.
    const d = new Date(2026, 0, 1, 0, 0, seconds);
    const iso = d.toISOString().replace('Z', '').replace(/\.\d+$/, '');
    return `${iso}.${String(micros).padStart(6, '0')}`;
  }

  function seedRows(n) {
    return Array.from({ length: n }, (_, i) => ({
      id: `row-${String(i).padStart(3, '0')}`,
      [CREATED_AT_US_ALIAS]: usAt(i),
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
        cursor, limit: 10, direction: 'desc', baseWhere: {}, findAll,
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
    expect(seen).toEqual([...rows].reverse().map((r) => r.id)); // newest-first, preserved end to end
  });

  test('walks the full asc set with no dupes/gaps across pages', async () => {
    const rows = seedRows(23);
    const findAll = makeStore(rows);

    const seen = [];
    let cursor = null;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const { rows: page, nextCursor } = await fetchKeysetPage({
        cursor, limit: 7, direction: 'asc', baseWhere: {}, findAll,
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
      cursor: null, limit: 2, direction: 'desc', baseWhere: {}, findAll,
    });
    expect(page1.rows.map((r) => r.id)).toEqual(['row-004', 'row-003']);

    // Concurrent insert: a brand-new row NEWER than everything already seen.
    rows.push({ id: 'row-005', [CREATED_AT_US_ALIAS]: usAt(99) });

    const cursor = decodeCursor(page1.nextCursor);
    const page2 = await fetchKeysetPage({
      cursor, limit: 2, direction: 'desc', baseWhere: {}, findAll,
    });
    expect(page2.rows.map((r) => r.id)).toEqual(['row-002', 'row-001']);
  });

  // ── BUG-063: the actual regression scenario ────────────────────────────
  // Two pairs of rows that share an identical MILLISECOND but differ at the
  // MICROSECOND — exactly QA's live repro shape. The pre-fix cursor (a JS
  // Date) would have collapsed each pair to one indistinguishable value:
  // DESC would silently drop one of each pair (gap), ASC would re-serve the
  // page-boundary row on the next page (duplicate). Because this suite's
  // rows/comparisons live entirely on the `createdAtUs` STRING (never a
  // Date), a walk here proves both members of every same-ms pair survive
  // exactly once in each direction.
  function seedSameMsPairs() {
    // 6 distinct seconds, each holding TWO rows at different microseconds
    // within the SAME millisecond (123).
    const rows = [];
    for (let s = 0; s < 6; s += 1) {
      rows.push({ id: `row-${s}-a`, [CREATED_AT_US_ALIAS]: usAt(s, 123001) });
      rows.push({ id: `row-${s}-b`, [CREATED_AT_US_ALIAS]: usAt(s, 123999) });
    }
    return rows; // 12 rows total, 6 same-ms pairs
  }

  test('DESC walk over same-millisecond/different-microsecond pairs drops nothing', async () => {
    const rows = seedSameMsPairs();
    const findAll = makeStore(rows);

    const seen = [];
    let cursor = null;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const { rows: page, nextCursor } = await fetchKeysetPage({
        cursor, limit: 5, direction: 'desc', baseWhere: {}, findAll,
      });
      seen.push(...page.map((r) => r.id));
      if (!nextCursor) break;
      cursor = decodeCursor(nextCursor);
    }

    expect(seen).toHaveLength(12);
    expect(new Set(seen).size).toBe(12); // no gaps — every row present exactly once
    expect(seen).toEqual([...rows].reverse().map((r) => r.id));
  });

  test('ASC walk over same-millisecond/different-microsecond pairs never repeats the boundary row', async () => {
    const rows = seedSameMsPairs();
    const findAll = makeStore(rows);

    const seen = [];
    let cursor = null;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const { rows: page, nextCursor } = await fetchKeysetPage({
        cursor, limit: 5, direction: 'asc', baseWhere: {}, findAll,
      });
      seen.push(...page.map((r) => r.id));
      if (!nextCursor) break;
      cursor = decodeCursor(nextCursor);
    }

    expect(seen).toHaveLength(12);
    expect(new Set(seen).size).toBe(12); // no dupes — boundary row never re-served
    expect(seen).toEqual(rows.map((r) => r.id));
  });
});
