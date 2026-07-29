'use strict';

/**
 * FEAT-090 — POST /api/v1/chat streaming branch.
 *
 * The two properties that matter here:
 *   1. streaming is OPT-IN and the buffered path is untouched (regression
 *      guard — the AC requires non-streaming behavior to be unchanged);
 *   2. the SSE response carries the headers that actually defeat the three
 *      buffering layers (gateway compression, nginx, node), because getting
 *      those wrong produces a stream that "works" in tests and buffers in
 *      production.
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

jest.mock('../../src/engine/jobs', () => ({ assistantChatTurn: jest.fn() }));

const express = require('express');
const request = require('supertest');
const { assistantChatTurn } = require('../../src/engine/jobs');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/chat', require('../../src/routes/chat'));
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    res.status(err.statusCode || 500).json({ error: err.message });
  });
  return app;
}

/** Split a raw SSE body into [{event, data}] */
function parseSSE(body) {
  return body
    .split('\n\n')
    .map((b) => b.trim())
    .filter((b) => b && !b.startsWith(':'))
    .map((block) => {
      const event = (block.match(/^event: (.+)$/m) || [])[1];
      const dataLine = (block.match(/^data: (.+)$/m) || [])[1];
      return { event, data: dataLine ? JSON.parse(dataLine) : null };
    })
    .filter((e) => e.event);
}

const TURN = {
  session_id: 'asst-1', reply: 'hello there', status: 'sent',
  skills: null, guardrails: {},
};

beforeEach(() => jest.clearAllMocks());

describe('non-streaming path is unchanged', () => {
  it('returns the turn result as plain JSON when stream is absent', async () => {
    assistantChatTurn.mockResolvedValue(TURN);
    const res = await request(buildApp()).post('/api/v1/chat').send({ message: 'hi' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual(TURN);
    // the sixth arg is the stream sink — null on this path
    expect(assistantChatTurn.mock.calls[0][5]).toBeNull();
  });

  it('treats a non-true stream value as non-streaming (no truthy coercion)', async () => {
    assistantChatTurn.mockResolvedValue(TURN);
    for (const stream of ['true', 1, {}]) {
      const res = await request(buildApp()).post('/api/v1/chat').send({ message: 'hi', stream });
      expect(res.headers['content-type']).toMatch(/application\/json/);
    }
  });

  it('still rejects an empty message and a bad session_id before streaming', async () => {
    const app = buildApp();
    expect((await request(app).post('/api/v1/chat').send({ message: '  ', stream: true })).status).toBe(400);
    expect((await request(app).post('/api/v1/chat').send({ message: 'x', session_id: 'bad id!', stream: true })).status)
      .toBe(400);
    expect(assistantChatTurn).not.toHaveBeenCalled();
  });
});

describe('streaming path', () => {
  it('sends SSE headers that defeat compression, nginx and node buffering', async () => {
    assistantChatTurn.mockResolvedValue(TURN);
    const res = await request(buildApp()).post('/api/v1/chat').send({ message: 'hi', stream: true });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    // no-transform is what tells an intermediary not to gzip the stream
    expect(res.headers['cache-control']).toMatch(/no-transform/);
    // nginx proxy buffering off
    expect(res.headers['x-accel-buffering']).toBe('no');
  });

  it('emits start, then screened tokens, then done carrying the turn result', async () => {
    assistantChatTurn.mockImplementation(async (sid, msg, model, skills, userId, stream) => {
      stream.onChunk('hello ');
      stream.onChunk('there');
      return TURN;
    });
    const res = await request(buildApp()).post('/api/v1/chat').send({ message: 'hi', stream: true });
    const events = parseSSE(res.text);
    expect(events.map((e) => e.event)).toEqual(['start', 'token', 'token', 'done']);
    expect(events[1].data.text).toBe('hello ');
    expect(events[2].data.text).toBe('there');
    expect(events[3].data).toEqual(TURN);
  });

  it('forwards a reset so the client drops superseded provisional text', async () => {
    assistantChatTurn.mockImplementation(async (sid, msg, model, skills, userId, stream) => {
      stream.onChunk('draft that gets blocked. ');
      stream.onReset();
      return { ...TURN, reply: 'Sorry — I can\'t help with that request.', status: 'blocked_output' };
    });
    const res = await request(buildApp()).post('/api/v1/chat').send({ message: 'hi', stream: true });
    const events = parseSSE(res.text);
    expect(events.map((e) => e.event)).toEqual(['start', 'token', 'reset', 'done']);
    // the authoritative reply is the canned one, never the retracted draft
    expect(events[3].data.status).toBe('blocked_output');
    expect(events[3].data.reply).not.toContain('draft that gets blocked');
  });

  it('keeps streaming after the POST body has been consumed', async () => {
    // Regression guard: SSE liveness must be tracked on the RESPONSE, not the
    // request. `req`'s 'close' fires as soon as a POST body is fully read —
    // wiring cleanup to it marks the stream dead before the first token and the
    // response never ends. Emitting asynchronously (as a real generation does)
    // is what exposes it; a synchronous emit would pass either way.
    assistantChatTurn.mockImplementation(async (sid, msg, model, skills, userId, stream) => {
      await new Promise((r) => setImmediate(r));
      stream.onChunk('late token');
      await new Promise((r) => setImmediate(r));
      return TURN;
    });
    const res = await request(buildApp()).post('/api/v1/chat').send({ message: 'hi', stream: true });
    const events = parseSSE(res.text);
    expect(events.map((e) => e.event)).toEqual(['start', 'token', 'done']);
    expect(events[1].data.text).toBe('late token');
  });

  it('does not abort the generation just because the request body ended', async () => {
    let sink = null;
    assistantChatTurn.mockImplementation(async (sid, msg, model, skills, userId, stream) => {
      sink = stream;
      await new Promise((r) => setImmediate(r));
      return TURN;
    });
    await request(buildApp()).post('/api/v1/chat').send({ message: 'hi', stream: true });
    // the signal stayed live for the whole turn
    expect(sink.signal.aborted).toBe(false);
  });

  it('passes a live AbortSignal and an abort() to the turn', async () => {
    let sink = null;
    assistantChatTurn.mockImplementation(async (sid, msg, model, skills, userId, stream) => {
      sink = stream;
      return TURN;
    });
    await request(buildApp()).post('/api/v1/chat').send({ message: 'hi', stream: true });
    expect(sink.signal).toBeInstanceOf(AbortSignal);
    expect(sink.signal.aborted).toBe(false);
    expect(typeof sink.abort).toBe('function');
    sink.abort();
    expect(sink.signal.aborted).toBe(true);
  });

  it('reports a generation failure as a terminal error event, not a 500 body', async () => {
    assistantChatTurn.mockRejectedValue(
      Object.assign(new Error('LLM router unreachable'), { code: 'LLM_UNAVAILABLE' }));
    const res = await request(buildApp()).post('/api/v1/chat').send({ message: 'hi', stream: true });
    // headers already went out with 200 — the failure has to travel in-band
    expect(res.status).toBe(200);
    const events = parseSSE(res.text);
    expect(events[events.length - 1].event).toBe('error');
    expect(events[events.length - 1].data.error).toBe('LLM_UNAVAILABLE');
  });

  it('reports a cancelled generation as cancelled, not error', async () => {
    assistantChatTurn.mockImplementation(async (sid, msg, model, skills, userId, stream) => {
      stream.abort();
      throw Object.assign(new Error('generation cancelled'), { name: 'AbortError' });
    });
    const res = await request(buildApp()).post('/api/v1/chat').send({ message: 'hi', stream: true });
    const events = parseSSE(res.text);
    expect(events[events.length - 1].event).toBe('cancelled');
  });

  it('reuses the caller-supplied session_id and passes the model/skills through', async () => {
    ({}); // no-op to keep the arrange/act/assert shape obvious
    const { ChatSession } = require('../../src/models');
    ChatSession.findByPk.mockResolvedValue({ id: 'asst-x', channel: 'assistant', userId: USER });
    assistantChatTurn.mockResolvedValue(TURN);
    await request(buildApp()).post('/api/v1/chat')
      .send({ message: 'hi', session_id: 'asst-x', model: 'm1', skills: ['s'], stream: true });
    const call = assistantChatTurn.mock.calls[0];
    expect(call[0]).toBe('asst-x');
    expect(call[2]).toBe('m1');
    expect(call[3]).toEqual(['s']);
  });
});
