'use strict';

/**
 * TASK-063 — keyset pagination on GET /api/v1/chat (session list) and
 * GET /api/v1/chat/:id (message history). DB-free: mocks ../models and the
 * CA auth middleware, matching spark's routes-test pattern.
 *
 * BUG-063: the seek/order now runs on the raw µs-precision expression
 * (`createdAtUsAttribute()`/`CREATED_AT_US_ALIAS`), never the plain
 * `createdAt` Sequelize attribute — these assertions check for that
 * expression shape specifically so a regression back to the ms-precision
 * Date attribute would fail this suite, not just the live DB walk.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const USER = 'aaaaaaaa-0000-0000-0000-000000000001';

jest.mock('../../src/models', () => ({
  ChatSession: { findAll: jest.fn(), findByPk: jest.fn() },
  ChatMessage: { findAll: jest.fn() },
}));

jest.mock('../../src/middleware/auth', () => ({
  caRead: (req, res, next) => { req.userId = USER; next(); },
  caWrite: (req, res, next) => { req.userId = USER; next(); },
  isAdminReq: () => false,
}));

const express = require('express');
const request = require('supertest');
const { Op } = require('sequelize');
const { ChatSession, ChatMessage } = require('../../src/models');
const { CREATED_AT_US_ALIAS, CREATED_AT_US_EXPR } = require('../../src/lib/keysetPagination');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/chat', require('../../src/routes/chat'));
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    res.status(err.statusCode || 500).json({ error: err.message });
  });
  return app;
}

/** A row exposing both plain enumerable props (for res.json) and a
 * Sequelize-instance-shaped `.get(key)` (for keysetPagination's `keyOf`/
 * `session.get({ plain: true })`), including the raw µs alias. */
function makeRow(dataValues, createdAtUs) {
  return {
    ...dataValues,
    get(keyOrOpts) {
      if (keyOrOpts === CREATED_AT_US_ALIAS) return createdAtUs;
      if (typeof keyOrOpts === 'string') return dataValues[keyOrOpts];
      return { ...dataValues };
    },
  };
}

function sessionRow(id, createdAtUs, messages = []) {
  return { ...makeRow({ id, createdAt: new Date(createdAtUs), channel: 'assistant', userId: USER, skills: null, model: null }, createdAtUs), messages };
}

function messageRow(id, createdAtUs, content = 'hi') {
  return makeRow({ id, sessionId: 's-1', role: 'user', content, createdAt: new Date(createdAtUs) }, createdAtUs);
}

/** Evaluate a fetchKeysetPage `where` fragment against a row the same way
 * Postgres would — used to simulate real seek behavior in mocked findAlls. */
function evalCond(row, cond) {
  if (cond == null) return true;
  if (cond[Op.and]) return cond[Op.and].every((c) => evalCond(row, c));
  if (cond[Op.or]) return cond[Op.or].some((c) => evalCond(row, c));
  if (cond.attribute && cond.attribute.val === CREATED_AT_US_EXPR) {
    const { logic } = cond;
    const rowUs = row.get(CREATED_AT_US_ALIAS);
    if (logic && typeof logic === 'object') {
      const [sym] = Object.getOwnPropertySymbols(logic);
      if (sym === Op.gt) return rowUs > logic[Op.gt];
      if (sym === Op.lt) return rowUs < logic[Op.lt];
      return true;
    }
    return rowUs === logic;
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

describe('GET /api/v1/chat (session list) — TASK-063 keyset pagination', () => {
  let app;
  beforeEach(() => { app = buildApp(); jest.clearAllMocks(); });

  test('default call (no cursor/limit) is unchanged: limit 100, DESC on the µs expr, no cursor filter', async () => {
    ChatSession.findAll.mockResolvedValue([]);

    await request(app).get('/api/v1/chat');

    expect(ChatSession.findAll).toHaveBeenCalledTimes(1);
    const call = ChatSession.findAll.mock.calls[0][0];
    expect(call.limit).toBe(101); // fetch limit+1 to detect a next page
    expect(call.order[0][0].val).toBe(CREATED_AT_US_EXPR); // BUG-063: not the plain `createdAt` attribute
    expect(call.order[0][1]).toBe('DESC');
    expect(call.order[1]).toEqual(['id', 'DESC']);
    expect(call.where).toEqual({ channel: 'assistant', userId: USER });
    expect(call.attributes.include[0][1]).toBe(CREATED_AT_US_ALIAS);
  });

  test('returns nextCursor when there are more rows than the page limit', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => sessionRow(
      `s-${i}`, `2026-01-01T00:00:${String(10 - i).padStart(2, '0')}.000000`,
    ));
    ChatSession.findAll.mockResolvedValue(rows); // 3 rows returned for limit=2 -> hasMore

    const res = await request(app).get('/api/v1/chat').query({ limit: 2 });

    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(2);
    expect(res.body.sessions.map((s) => s.id)).toEqual(['s-0', 's-1']);
    expect(res.body.nextCursor).toEqual(expect.any(String));
  });

  test('no nextCursor when the page exactly fills (no more rows)', async () => {
    ChatSession.findAll.mockResolvedValue([sessionRow('s-0', '2026-01-01T00:00:00.000000')]);

    const res = await request(app).get('/api/v1/chat').query({ limit: 5 });

    expect(res.body.nextCursor).toBeNull();
  });

  test('a supplied cursor is threaded into the where clause as a seek fragment on the µs expr', async () => {
    ChatSession.findAll.mockResolvedValue([]);
    const cursor = Buffer.from(JSON.stringify({
      createdAtUs: '2026-07-28T12:00:00.123456', id: 's-5',
    })).toString('base64url');

    await request(app).get('/api/v1/chat').query({ cursor });

    const call = ChatSession.findAll.mock.calls[0][0];
    expect(call.where[Op.and]).toBeDefined();
    const [base, seek] = call.where[Op.and];
    expect(base).toEqual({ channel: 'assistant', userId: USER });
    const [strict, tie] = seek[Op.or];
    expect(strict.attribute.val).toBe(CREATED_AT_US_EXPR);
    expect(strict.logic[Op.lt]).toBe('2026-07-28T12:00:00.123456');
    expect(tie[Op.and][1].id[Op.lt]).toBe('s-5');
  });

  test('limit is clamped to the 100 cap', async () => {
    ChatSession.findAll.mockResolvedValue([]);

    await request(app).get('/api/v1/chat').query({ limit: 99999 });

    expect(ChatSession.findAll.mock.calls[0][0].limit).toBe(101); // 100 + 1
  });

  test('BUG-063: a full DESC walk over same-millisecond/different-microsecond sessions drops nothing', async () => {
    // 3 pairs sharing a millisecond (123), differing only at the microsecond
    // — the exact live QA repro shape (see BUG-063 resolution note).
    const rows = [];
    for (let s = 0; s < 3; s += 1) {
      rows.push(sessionRow(`s-${s}-a`, `2026-01-01T00:00:0${s}.123001`));
      rows.push(sessionRow(`s-${s}-b`, `2026-01-01T00:00:0${s}.123999`));
    }
    ChatSession.findAll.mockImplementation(async ({ where, order, limit }) => {
      const filtered = rows.filter((r) => evalCond(r, where));
      const desc = order[0][1] === 'DESC';
      const sorted = [...filtered].sort((a, b) => {
        const au = a.get(CREATED_AT_US_ALIAS);
        const bu = b.get(CREATED_AT_US_ALIAS);
        if (au !== bu) { const c = au < bu ? -1 : 1; return desc ? -c : c; }
        const c = a.id < b.id ? -1 : 1;
        return desc ? -c : c;
      });
      return sorted.slice(0, limit);
    });

    const seen = [];
    let cursor;
    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).get('/api/v1/chat').query({ limit: 2, ...(cursor ? { cursor } : {}) });
      seen.push(...res.body.sessions.map((s) => s.id));
      if (!res.body.nextCursor) break;
      cursor = res.body.nextCursor;
    }

    expect(seen).toHaveLength(6);
    expect(new Set(seen).size).toBe(6); // no gaps
    expect(seen).toEqual([...rows].reverse().map((r) => r.id));
  });
});

describe('GET /api/v1/chat/:id (message history) — TASK-063 keyset pagination', () => {
  let app;
  beforeEach(() => { app = buildApp(); jest.clearAllMocks(); });

  test('default call (no cursor/limit): ASC on the µs expr, 200 cap, no cursor filter', async () => {
    ChatSession.findByPk.mockResolvedValue(sessionRow('s-1', '2026-01-01T00:00:00.000000'));
    ChatMessage.findAll.mockResolvedValue([]);

    await request(app).get('/api/v1/chat/s-1');

    const call = ChatMessage.findAll.mock.calls[0][0];
    expect(call.limit).toBe(201); // 200 + 1
    expect(call.order[0][0].val).toBe(CREATED_AT_US_EXPR);
    expect(call.order[0][1]).toBe('ASC');
    expect(call.order[1]).toEqual(['id', 'ASC']);
    expect(call.where).toEqual({ sessionId: 's-1' });
    expect(call.attributes.include[0][1]).toBe(CREATED_AT_US_ALIAS);
  });

  test('paginates forward with nextCursor across a full history walk (no dupes/gaps)', async () => {
    ChatSession.findByPk.mockResolvedValue(sessionRow('s-1', '2026-01-01T00:00:00.000000'));

    const all = Array.from({ length: 5 }, (_, i) => messageRow(
      `m-${i}`, `2026-01-01T00:00:0${i}.000000`,
    ));

    ChatMessage.findAll.mockImplementation(async ({ where, order, limit }) => {
      const filtered = all.filter((r) => evalCond(r, where));
      const sorted = [...filtered].sort((a, b) => {
        const au = a.get(CREATED_AT_US_ALIAS);
        const bu = b.get(CREATED_AT_US_ALIAS);
        if (au !== bu) return au < bu ? -1 : 1;
        return a.id < b.id ? -1 : 1;
      });
      return sorted.slice(0, limit);
    });

    const seen = [];
    let cursor;
    for (let i = 0; i < 10; i += 1) {
      const query = { limit: 2, ...(cursor ? { cursor } : {}) };
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).get('/api/v1/chat/s-1').query(query);
      seen.push(...res.body.messages.map((m) => m.id));
      if (!res.body.nextCursor) break;
      cursor = res.body.nextCursor;
    }

    expect(seen).toEqual(['m-0', 'm-1', 'm-2', 'm-3', 'm-4']);
    expect(new Set(seen).size).toBe(5);
  });

  test('BUG-063: a full ASC walk over same-millisecond/different-microsecond messages never repeats the boundary row', async () => {
    const all = [];
    for (let s = 0; s < 3; s += 1) {
      all.push(messageRow(`m-${s}-a`, `2026-01-01T00:00:0${s}.123001`));
      all.push(messageRow(`m-${s}-b`, `2026-01-01T00:00:0${s}.123999`));
    }
    ChatSession.findByPk.mockResolvedValue(sessionRow('s-1', '2026-01-01T00:00:00.000000'));
    ChatMessage.findAll.mockImplementation(async ({ where, limit }) => {
      const filtered = all.filter((r) => evalCond(r, where));
      const sorted = [...filtered].sort((a, b) => {
        const au = a.get(CREATED_AT_US_ALIAS);
        const bu = b.get(CREATED_AT_US_ALIAS);
        if (au !== bu) return au < bu ? -1 : 1;
        return a.id < b.id ? -1 : 1;
      });
      return sorted.slice(0, limit);
    });

    const seen = [];
    let cursor;
    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).get('/api/v1/chat/s-1').query({ limit: 2, ...(cursor ? { cursor } : {}) });
      seen.push(...res.body.messages.map((m) => m.id));
      if (!res.body.nextCursor) break;
      cursor = res.body.nextCursor;
    }

    expect(seen).toHaveLength(6);
    expect(new Set(seen).size).toBe(6); // no dupes
    expect(seen).toEqual(all.map((r) => r.id));
  });

  test('404s (no ChatMessage query at all) when the session is not the caller\'s own', async () => {
    ChatSession.findByPk.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/chat/not-mine');

    expect(res.status).toBe(404);
    expect(ChatMessage.findAll).not.toHaveBeenCalled();
  });
});
