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
  CREATED_AT_US_ALIAS,
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

// A stand-in for the connection escaper. Single-quotes and doubles embedded
// quotes, which is what pg does — so a test can prove escaping actually happens.
const fakeEscape = (v) => `'${String(v).replace(/'/g, "''")}'`;

describe('BUG-067 — decodeCursor structurally validates the µs field', () => {
  // The seek interpolates this value into a SQL literal (escaped). The regex is
  // defence-in-depth on top of the escaper: a validated cursor is incapable of
  // carrying anything but a fixed-width UTC µs timestamp, so a tampered one
  // restarts at page 1 and never reaches a query.
  const enc = (payload) => Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

  it.each([
    ['SQL metacharacters',   "2026-07-29T03:00:01.000011'; DROP TABLE x;--"],
    ['wrong precision (ms)', '2026-07-29T03:00:01.000'],
    ['offset already present', '2026-07-29T03:00:01.000011Z'],
    ['explicit +00 offset',  '2026-07-29T03:00:01.000011+00'],
    ['a bare date',          '2026-07-29'],
    ['space instead of T',   '2026-07-29 03:00:01.000011'],
    ['empty',                ''],
  ])('rejects %s', (_label, createdAtUs) => {
    expect(decodeCursor(enc({ createdAtUs, id: 'm-1' }))).toBeNull();
  });

  test('accepts exactly the format the projection emits', () => {
    const good = { createdAtUs: '2026-07-29T03:00:01.000011', id: 'm-1' };
    expect(decodeCursor(enc(good))).toEqual(good);
  });

  test('a rejected cursor means page 1, never a query with a tampered key', async () => {
    const findAll = jest.fn(async () => []);
    const bad = decodeCursor(enc({ createdAtUs: "x'--", id: 'm-1' }));
    expect(bad).toBeNull();
    await fetchKeysetPage({
      cursor: bad, limit: 5, direction: 'asc', baseWhere: { sessionId: 's' },
      findAll, escape: (v) => `'${v}'`,
    });
    // no seek fragment at all — the base filter only
    expect(JSON.stringify(findAll.mock.calls[0][0])).not.toContain('created_at');
  });
});

describe('seekWhere / keysetOrder (BUG-067 row-wise form)', () => {
  const cursor = { createdAtUs: '2026-07-29T03:00:01.000011', id: 'm-7' };

  test('asc seeks strictly AFTER the cursor, row-wise on (created_at, id)', () => {
    const w = seekWhere(cursor, 'asc', fakeEscape);
    expect(w.val).toBe(
      `("created_at", "id") > ('2026-07-29T03:00:01.000011Z'::timestamptz, 'm-7')`);
  });

  test('desc seeks strictly BEFORE the cursor, row-wise', () => {
    expect(seekWhere(cursor, 'desc', fakeEscape).val).toBe(
      `("created_at", "id") < ('2026-07-29T03:00:01.000011Z'::timestamptz, 'm-7')`);
  });

  test('the cursor literal ALWAYS carries an explicit Z', () => {
    // Load-bearing. Without the offset Postgres reads the string in the SESSION
    // TimeZone, not UTC, so on a non-UTC connection the seek key silently skews
    // (measured: 4h under America/New_York). This test is what fails if the
    // append is ever dropped, and it is the amendment the ticket's original
    // version of this fix would have gotten wrong.
    for (const dir of ['asc', 'desc']) {
      expect(seekWhere(cursor, dir, fakeEscape).val).toContain("000011Z'::timestamptz");
    }
  });

  test('is row-wise, NOT the OR form — the OR form gets no index bound', () => {
    // Measured: the OR shape leaves the whole seek in a Filter: and uses the
    // index for the equality prefix only, i.e. BUG-067 unfixed.
    const val = seekWhere(cursor, 'asc', fakeEscape).val;
    expect(val).not.toMatch(/\bOR\b/i);
    expect(val.startsWith('("created_at", "id")')).toBe(true);
  });

  test('escapes both cursor components through the supplied escaper', () => {
    const nasty = { createdAtUs: "2026-07-29T03:00:01.000011", id: "m'); DROP TABLE x;--" };
    const val = seekWhere(nasty, 'asc', fakeEscape).val;
    expect(val).toContain("'m''); DROP TABLE x;--'");   // doubled quote, inert
  });

  test('REFUSES to build without an escaper rather than falling back', () => {
    // literal() does not bind, so an optional escaper would be an invitation to
    // inline unvalidated input here later.
    expect(() => seekWhere(cursor, 'asc')).toThrow(/requires an escape function/);
    expect(() => seekWhere(cursor, 'asc', 'not-a-fn')).toThrow(/requires an escape function/);
  });

  test('returns null without a cursor (page 1)', () => {
    expect(seekWhere(null, 'asc', fakeEscape)).toBeNull();
  });

  test('keysetOrder sorts on the PLAIN createdAt attribute, not the µs expression', () => {
    // This is what makes the composite index usable — ordering by the to_char
    // expression is exactly what produced BUG-067's per-match-set Sort.
    expect(keysetOrder('asc')).toEqual([['createdAt', 'ASC'], ['id', 'ASC']]);
    expect(keysetOrder('desc')).toEqual([['createdAt', 'DESC'], ['id', 'DESC']]);
    expect(JSON.stringify(keysetOrder('asc'))).not.toContain('to_char');
  });
});

describe('fetchKeysetPage', () => {
  // A tiny in-memory "table" standing in for Sequelize/Postgres — findAll
  // receives (where, order, limit) and filters/sorts on the raw createdAtUs
  // STRING exactly the way Postgres would compare the real µs-precision TEXT
  // expression, so this exercises the real seek semantics (string
  // comparison), not just a canned response.
  // A tiny in-memory "table" standing in for Sequelize/Postgres. `seekWhere`
  // now emits a row-wise SQL literal, so the harness parses it and applies the
  // SAME semantics Postgres would: compare the first column, and only on a tie
  // compare the second. Comparing the fixed-width µs strings is equivalent to
  // comparing the timestamps they render.
  const ROWWISE = /^\("created_at", "id"\) ([<>]) \('([^']+)'::timestamptz, '(.*)'\)$/;

  function evalCond(row, cond) {
    if (cond == null) return true;
    if (cond[Op.and]) return cond[Op.and].every((c) => evalCond(row, c));
    if (cond.val && typeof cond.val === 'string') {
      const m = ROWWISE.exec(cond.val);
      if (!m) throw new Error(`test harness cannot evaluate literal: ${cond.val}`);
      const [, cmp, ts, id] = m;
      const rowKey = [`${row[CREATED_AT_US_ALIAS]}Z`, String(row.id)];
      const curKey = [ts, id.replace(/''/g, "'")];
      const c = rowKey[0] < curKey[0] ? -1 : rowKey[0] > curKey[0] ? 1
        : rowKey[1] < curKey[1] ? -1 : rowKey[1] > curKey[1] ? 1 : 0;
      return cmp === '>' ? c > 0 : c < 0;
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
      // Hand back COPIES, as a real query does. fetchKeysetPage strips the µs
      // alias from the rows it returns (BUG-066), so a harness that reused the
      // same objects would see them already stripped on the next page and the
      // walk would never advance — an artifact of the double, not of the code.
      const filtered = rows.filter((r) => evalCond(r, where)).map((r) => ({ ...r }));
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
        cursor, limit: 10, direction: 'desc', baseWhere: {}, findAll, escape: fakeEscape,
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
        cursor, limit: 7, direction: 'asc', baseWhere: {}, findAll, escape: fakeEscape,
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
      cursor: null, limit: 2, direction: 'desc', baseWhere: {}, findAll, escape: fakeEscape,
    });
    expect(page1.rows.map((r) => r.id)).toEqual(['row-004', 'row-003']);

    // Concurrent insert: a brand-new row NEWER than everything already seen.
    rows.push({ id: 'row-005', [CREATED_AT_US_ALIAS]: usAt(99) });

    const cursor = decodeCursor(page1.nextCursor);
    const page2 = await fetchKeysetPage({
      cursor, limit: 2, direction: 'desc', baseWhere: {}, findAll, escape: fakeEscape,
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
        cursor, limit: 5, direction: 'desc', baseWhere: {}, findAll, escape: fakeEscape,
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
        cursor, limit: 5, direction: 'asc', baseWhere: {}, findAll, escape: fakeEscape,
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

describe('BUG-066 — the internal keyset alias never reaches a client', () => {
  const { stripKeysetAlias, CREATED_AT_US_ALIAS } = require('../../src/lib/keysetPagination');

  /** A stand-in for a Sequelize instance: the alias lives in dataValues and
   * res.json() serializes from there. */
  function fakeInstance(id, us) {
    const dataValues = { id, content: 'hi', [CREATED_AT_US_ALIAS]: us };
    return {
      dataValues,
      id,
      get(k) { return k === undefined ? dataValues : dataValues[k]; },
      toJSON() { return { ...dataValues }; },
    };
  }

  it('strips the alias from a Sequelize-shaped row so toJSON() omits it', () => {
    const row = fakeInstance('m1', '2026-07-29T03:00:01.000011');
    expect(row.toJSON()).toHaveProperty(CREATED_AT_US_ALIAS);
    stripKeysetAlias(row);
    expect(row.toJSON()).not.toHaveProperty(CREATED_AT_US_ALIAS);
  });

  it('strips the alias from a plain object row', () => {
    const row = { id: 'm1', [CREATED_AT_US_ALIAS]: 'x' };
    stripKeysetAlias(row);
    expect(row).not.toHaveProperty(CREATED_AT_US_ALIAS);
  });

  it('is a no-op on a row that never carried the alias, and on null', () => {
    const row = { id: 'm1' };
    expect(stripKeysetAlias(row)).toEqual({ id: 'm1' });
    expect(stripKeysetAlias(null)).toBeNull();
  });

  it('fetchKeysetPage returns rows with the alias already gone', async () => {
    const rows = [
      fakeInstance('m1', '2026-07-29T03:00:01.000011'),
      fakeInstance('m2', '2026-07-29T03:00:01.000022'),
    ];
    const { rows: page } = await fetchKeysetPage({
      cursor: null, limit: 5, direction: 'asc', baseWhere: {},
      findAll: async () => rows, escape: fakeEscape,
    });
    for (const r of page) {
      expect(JSON.parse(JSON.stringify(r.toJSON()))).not.toHaveProperty(CREATED_AT_US_ALIAS);
    }
  });

  it('still produces a correct nextCursor — stripping happens AFTER encoding', async () => {
    // The ordering matters: encodeCursor is the last reader of the alias, so
    // stripping too early would silently break paging instead of leaking.
    const rows = [
      fakeInstance('m1', '2026-07-29T03:00:01.000011'),
      fakeInstance('m2', '2026-07-29T03:00:01.000022'),
      fakeInstance('m3', '2026-07-29T03:00:01.000033'),
    ];
    const { rows: page, nextCursor } = await fetchKeysetPage({
      cursor: null, limit: 2, direction: 'asc', baseWhere: {},
      findAll: async () => rows, escape: fakeEscape,
    });
    expect(page).toHaveLength(2);
    expect(nextCursor).toBeTruthy();
    const payload = JSON.parse(Buffer.from(nextCursor, 'base64url').toString('utf8'));
    expect(payload).toEqual({ createdAtUs: '2026-07-29T03:00:01.000022', id: 'm2' });
  });
});
