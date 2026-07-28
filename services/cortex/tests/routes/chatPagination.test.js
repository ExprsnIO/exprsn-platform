'use strict';

/**
 * TASK-063 — keyset pagination on GET /api/v1/chat (session list) and
 * GET /api/v1/chat/:id (message history). DB-free: mocks ../models and the
 * CA auth middleware, matching spark's routes-test pattern.
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
const { ChatSession, ChatMessage } = require('../../src/models');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/chat', require('../../src/routes/chat'));
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    res.status(err.statusCode || 500).json({ error: err.message });
  });
  return app;
}

function session(id, createdAt, messages = []) {
  const plain = { id, createdAt, channel: 'assistant', userId: USER, skills: null, model: null };
  return { ...plain, messages, get: () => plain };
}

describe('GET /api/v1/chat (session list) — TASK-063 keyset pagination', () => {
  let app;
  beforeEach(() => { app = buildApp(); jest.clearAllMocks(); });

  test('default call (no cursor/limit) is unchanged: limit 100, DESC order, no cursor filter', async () => {
    ChatSession.findAll.mockResolvedValue([]);

    await request(app).get('/api/v1/chat');

    expect(ChatSession.findAll).toHaveBeenCalledTimes(1);
    const call = ChatSession.findAll.mock.calls[0][0];
    expect(call.limit).toBe(101); // fetch limit+1 to detect a next page
    expect(call.order).toEqual([['createdAt', 'DESC'], ['id', 'DESC']]);
    expect(call.where).toEqual({ channel: 'assistant', userId: USER });
  });

  test('returns nextCursor when there are more rows than the page limit', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => session(
      `s-${i}`, new Date(2026, 0, 1, 0, 0, 10 - i), [],
    ));
    ChatSession.findAll.mockResolvedValue(rows); // 3 rows returned for limit=2 -> hasMore

    const res = await request(app).get('/api/v1/chat').query({ limit: 2 });

    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(2);
    expect(res.body.sessions.map((s) => s.id)).toEqual(['s-0', 's-1']);
    expect(res.body.nextCursor).toEqual(expect.any(String));
  });

  test('no nextCursor when the page exactly fills (no more rows)', async () => {
    ChatSession.findAll.mockResolvedValue([session('s-0', new Date(), [])]);

    const res = await request(app).get('/api/v1/chat').query({ limit: 5 });

    expect(res.body.nextCursor).toBeNull();
  });

  test('a supplied cursor is threaded into the where clause as a seek fragment', async () => {
    ChatSession.findAll.mockResolvedValue([]);
    const cursor = Buffer.from(JSON.stringify({
      createdAt: '2026-07-28T12:00:00.000Z', id: 's-5',
    })).toString('base64url');

    await request(app).get('/api/v1/chat').query({ cursor });

    const call = ChatSession.findAll.mock.calls[0][0];
    const { Op } = require('sequelize');
    expect(call.where[Op.and]).toBeDefined();
    const [base, seek] = call.where[Op.and];
    expect(base).toEqual({ channel: 'assistant', userId: USER });
    expect(seek[Op.or][1].id[Op.lt]).toBe('s-5');
  });

  test('limit is clamped to the 100 cap', async () => {
    ChatSession.findAll.mockResolvedValue([]);

    await request(app).get('/api/v1/chat').query({ limit: 99999 });

    expect(ChatSession.findAll.mock.calls[0][0].limit).toBe(101); // 100 + 1
  });
});

describe('GET /api/v1/chat/:id (message history) — TASK-063 keyset pagination', () => {
  let app;
  beforeEach(() => { app = buildApp(); jest.clearAllMocks(); });

  test('default call (no cursor/limit): ASC order, 200 cap, no cursor filter', async () => {
    ChatSession.findByPk.mockResolvedValue(session('s-1', new Date()));
    ChatMessage.findAll.mockResolvedValue([]);

    await request(app).get('/api/v1/chat/s-1');

    const call = ChatMessage.findAll.mock.calls[0][0];
    expect(call.limit).toBe(201); // 200 + 1
    expect(call.order).toEqual([['createdAt', 'ASC'], ['id', 'ASC']]);
    expect(call.where).toEqual({ sessionId: 's-1' });
  });

  test('paginates forward with nextCursor across a full history walk (no dupes/gaps)', async () => {
    ChatSession.findByPk.mockResolvedValue(session('s-1', new Date()));

    const all = Array.from({ length: 5 }, (_, i) => ({
      id: `m-${i}`, sessionId: 's-1', role: 'user', content: `msg ${i}`,
      createdAt: new Date(2026, 0, 1, 0, 0, i),
    }));

    // Simulate real seek behavior: findAll's `where` narrows which of `all`
    // it should return, driven by the actual Op.and/Op.or seek fragment.
    ChatMessage.findAll.mockImplementation(async ({ where, limit }) => {
      const { Op } = require('sequelize');
      let rows = all;
      if (where[Op.and]) {
        const [, seek] = where[Op.and];
        const cutoff = seek[Op.or][1].id[Op.gt];
        rows = all.filter((r) => r.id > cutoff);
      }
      return rows.slice(0, limit);
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

  test('404s (no ChatMessage query at all) when the session is not the caller\'s own', async () => {
    ChatSession.findByPk.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/chat/not-mine');

    expect(res.status).toBe(404);
    expect(ChatMessage.findAll).not.toHaveBeenCalled();
  });
});
