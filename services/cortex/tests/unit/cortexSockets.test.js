'use strict';

/**
 * FEAT-090 — `/cortex` Socket.IO namespace.
 *
 * Covers the AC directly ("unauthenticated socket connects are rejected") plus
 * the cancel/disconnect semantics that are the reason the namespace exists at
 * all alongside SSE.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

// `mock`-prefixed so jest's module factory may reference it.
const mockAuthenticateSocket = jest.fn(() => (socket, next) => {
  if (!socket.handshake.auth?.token) return next(new Error('MISSING_TOKEN'));
  socket.userId = 'user-1';
  return next();
});

jest.mock('@exprsn/shared/middleware/socketAuth', () => ({
  authenticateSocket: (...args) => mockAuthenticateSocket(...args),
}));

jest.mock('../../src/engine/jobs', () => ({ assistantChatTurn: jest.fn() }));

jest.mock('../../src/models', () => ({ ChatSession: { findByPk: jest.fn(async () => null) } }));

const mockIsPlatformAdmin = jest.fn(() => false);
jest.mock('@exprsn/shared/utils/platformAdmin', () => ({
  isPlatformAdmin: (...a) => mockIsPlatformAdmin(...a),
}));

const config = require('../../src/config');
const { assistantChatTurn } = require('../../src/engine/jobs');
const { registerSockets, NAMESPACE } = require('../../src/sockets');

/** Minimal io/namespace/socket doubles. */
function fakeIo() {
  const middlewares = [];
  let onConnection = null;
  const nsp = {
    use: (fn) => middlewares.push(fn),
    on: (evt, fn) => { if (evt === 'connection') onConnection = fn; },
  };
  return {
    ofCalls: [],
    of(name) { this.ofCalls.push(name); return nsp; },
    middlewares,
    connect(socket) { onConnection(socket); return socket; },
  };
}

function fakeSocket(auth = { token: 't' }) {
  const handlers = {};
  const emitted = [];
  return {
    id: 's1',
    handshake: { auth, headers: {} },
    on: (evt, fn) => { handlers[evt] = fn; },
    emit: (evt, data) => emitted.push({ evt, data }),
    fire: (evt, payload) => handlers[evt](payload),
    has: (evt) => typeof handlers[evt] === 'function',
    emitted,
    events: () => emitted.map((e) => e.evt),
    last: () => emitted[emitted.length - 1],
  };
}

/** Run the namespace middleware chain against a socket; resolve to the error (or null). */
async function runMiddleware(io, socket) {
  for (const mw of io.middlewares) {
    // eslint-disable-next-line no-await-in-loop
    const err = await new Promise((resolve) => mw(socket, resolve));
    if (err) return err;
  }
  return null;
}

// `features.cortexEnabled` is a plain resolved value, so the flag is toggled by
// assignment rather than a getter spy.
const REAL_ENABLED = config.features.cortexEnabled;
beforeEach(() => {
  jest.clearAllMocks();
  config.features.cortexEnabled = true;
});
afterEach(() => { config.features.cortexEnabled = REAL_ENABLED; });

describe('namespace registration', () => {
  it('registers on /cortex', () => {
    const io = fakeIo();
    registerSockets(io);
    expect(io.ofCalls).toEqual([NAMESPACE]);
    expect(NAMESPACE).toBe('/cortex');
  });

  it('requires a CA token with write permission on the handshake', () => {
    registerSockets(fakeIo());
    expect(mockAuthenticateSocket).toHaveBeenCalledWith({ requiredPermissions: ['write'] });
  });
});

describe('handshake gating', () => {
  it('rejects an unauthenticated connect', async () => {
    const io = fakeIo();
    registerSockets(io);
    const err = await runMiddleware(io, fakeSocket({}));
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('MISSING_TOKEN');
  });

  it('accepts an authenticated connect', async () => {
    const io = fakeIo();
    registerSockets(io);
    expect(await runMiddleware(io, fakeSocket())).toBeNull();
  });

  it('rejects when the module is flag-disabled — after auth, not before', async () => {
    config.features.cortexEnabled = false;
    const io = fakeIo();
    registerSockets(io);

    // an unauthenticated socket still fails on auth first, so a disabled module
    // is not an unauthenticated probe for whether cortex exists
    expect((await runMiddleware(io, fakeSocket({}))).message).toBe('MISSING_TOKEN');
    expect((await runMiddleware(io, fakeSocket())).message).toBe('CORTEX_DISABLED');
  });
});

describe('chat:send', () => {
  function connected() {
    const io = fakeIo();
    registerSockets(io);
    const socket = fakeSocket();
    socket.userId = 'user-1';
    io.connect(socket);
    return socket;
  }

  it('validates the message and the session id before generating', async () => {
    const socket = connected();
    await socket.fire('chat:send', { message: '   ' });
    expect(socket.last().evt).toBe('chat:error');
    expect(socket.last().data.error).toBe('BAD_REQUEST');

    await socket.fire('chat:send', { message: 'hi', session_id: 'bad id!' });
    expect(socket.last().data.error).toBe('BAD_REQUEST');
    expect(assistantChatTurn).not.toHaveBeenCalled();
  });

  it('emits start, screened tokens and done', async () => {
    assistantChatTurn.mockImplementation(async (sid, m, model, skills, userId, stream) => {
      stream.onChunk('part one. ');
      return { session_id: sid, reply: 'part one.', status: 'sent' };
    });
    const socket = connected();
    await socket.fire('chat:send', { message: 'hi' });
    expect(socket.events()).toEqual(['chat:start', 'chat:token', 'chat:done']);
    expect(socket.emitted[1].data.text).toBe('part one. ');
  });

  it('forwards a reset so the client drops superseded text', async () => {
    assistantChatTurn.mockImplementation(async (sid, m, model, skills, userId, stream) => {
      stream.onChunk('draft. ');
      stream.onReset();
      return { session_id: sid, reply: 'canned', status: 'blocked_output' };
    });
    const socket = connected();
    await socket.fire('chat:send', { message: 'hi' });
    expect(socket.events()).toEqual(['chat:start', 'chat:token', 'chat:reset', 'chat:done']);
  });

  it('refuses attachments, matching the HTTP twin', async () => {
    const socket = connected();
    await socket.fire('chat:send', { message: 'hi', attachments: [{ id: 'x' }] });
    expect(socket.last().data.message).toMatch(/attachments not supported/);
    expect(assistantChatTurn).not.toHaveBeenCalled();
  });

  it('refuses a session_id owned by a different user', async () => {
    // The gap the architect gate caught: assistantChatTurn loads the session's
    // full history into the prompt and never re-checks ownership, so without
    // this any authenticated write principal could read another user's
    // transcript through an enumerable session id.
    const { ChatSession } = require('../../src/models');
    ChatSession.findByPk.mockResolvedValueOnce({
      id: 'asst-someone-else', channel: 'assistant', userId: 'user-2',
    });
    const socket = connected();
    await socket.fire('chat:send', { message: 'hi', session_id: 'asst-someone-else' });
    expect(socket.last().evt).toBe('chat:error');
    expect(socket.last().data.error).toBe('NOT_FOUND');
    expect(assistantChatTurn).not.toHaveBeenCalled();
  });

  it('allows a session_id the caller owns', async () => {
    const { ChatSession } = require('../../src/models');
    ChatSession.findByPk.mockResolvedValueOnce({
      id: 'asst-mine', channel: 'assistant', userId: 'user-1',
    });
    assistantChatTurn.mockResolvedValue({ status: 'sent' });
    const socket = connected();
    await socket.fire('chat:send', { message: 'hi', session_id: 'asst-mine' });
    expect(assistantChatTurn).toHaveBeenCalledTimes(1);
  });

  it('allows a platform admin into any session, matching isAdminReq on HTTP', async () => {
    const { ChatSession } = require('../../src/models');
    ChatSession.findByPk.mockResolvedValueOnce({
      id: 'asst-other', channel: 'assistant', userId: 'user-2',
    });
    mockIsPlatformAdmin.mockReturnValueOnce(true);
    assistantChatTurn.mockResolvedValue({ status: 'sent' });
    const socket = connected();
    await socket.fire('chat:send', { message: 'hi', session_id: 'asst-other' });
    expect(assistantChatTurn).toHaveBeenCalledTimes(1);
  });

  it('refuses a cs-channel session on the assistant namespace', async () => {
    const { ChatSession } = require('../../src/models');
    ChatSession.findByPk.mockResolvedValueOnce({
      id: 'asst-cs', channel: 'cs', userId: 'user-1',
    });
    const socket = connected();
    await socket.fire('chat:send', { message: 'hi', session_id: 'asst-cs' });
    expect(socket.last().data.error).toBe('NOT_FOUND');
    expect(assistantChatTurn).not.toHaveBeenCalled();
  });

  it('refuses a session_id with no row — parity with the HTTP 404', async () => {
    // Adopting an unknown id would let a client choose its own ChatSession
    // primary key, which is the session-id squat described in the architect
    // re-verify. A legitimate client omits session_id and is handed one back.
    const { ChatSession } = require('../../src/models');
    ChatSession.findByPk.mockResolvedValueOnce(null);
    const socket = connected();
    await socket.fire('chat:send', { message: 'hi', session_id: 'asst-guessed' });
    expect(socket.last().data.error).toBe('NOT_FOUND');
    expect(assistantChatTurn).not.toHaveBeenCalled();
  });

  it('still starts a new session when session_id is omitted', async () => {
    assistantChatTurn.mockResolvedValue({ status: 'sent' });
    const socket = connected();
    await socket.fire('chat:send', { message: 'hi' });
    expect(assistantChatTurn).toHaveBeenCalledTimes(1);
    expect(socket.emitted[0].evt).toBe('chat:start');
    expect(socket.emitted[0].data.session_id).toMatch(/^asst-/);
  });

  it('refuses a null-owner row for a caller with no userId (strict comparison)', async () => {
    const { ChatSession } = require('../../src/models');
    ChatSession.findByPk.mockResolvedValueOnce({ id: 'asst-orphan', channel: 'assistant', userId: null });
    const socket = connected();
    delete socket.userId;
    await socket.fire('chat:send', { message: 'hi', session_id: 'asst-orphan' });
    expect(socket.last().data.error).toBe('NOT_FOUND');
    expect(assistantChatTurn).not.toHaveBeenCalled();
  });

  it('fails closed when the ownership lookup throws', async () => {
    const { ChatSession } = require('../../src/models');
    ChatSession.findByPk.mockRejectedValueOnce(new Error('db down'));
    const socket = connected();
    await socket.fire('chat:send', { message: 'hi', session_id: 'asst-x' });
    expect(socket.last().data.error).toBe('NOT_FOUND');
    expect(assistantChatTurn).not.toHaveBeenCalled();
  });

  it('passes the authenticated userId, never a client-supplied one', async () => {
    assistantChatTurn.mockResolvedValue({ status: 'sent' });
    const socket = connected();
    await socket.fire('chat:send', { message: 'hi', userId: 'attacker' });
    expect(assistantChatTurn.mock.calls[0][4]).toBe('user-1');
  });

  it('refuses a second concurrent generation on the same socket', async () => {
    let release;
    assistantChatTurn.mockImplementation(() => new Promise((r) => { release = () => r({ status: 'sent' }); }));
    const socket = connected();
    const first = socket.fire('chat:send', { message: 'one' });
    await socket.fire('chat:send', { message: 'two' });
    expect(socket.last().data.error).toBe('BUSY');
    release();
    await first;
    expect(assistantChatTurn).toHaveBeenCalledTimes(1);
  });

  it('reports a failure as chat:error', async () => {
    assistantChatTurn.mockRejectedValue(Object.assign(new Error('boom'), { code: 'LLM_UNAVAILABLE' }));
    const socket = connected();
    await socket.fire('chat:send', { message: 'hi' });
    expect(socket.last().evt).toBe('chat:error');
    expect(socket.last().data.error).toBe('LLM_UNAVAILABLE');
  });
});

describe('cancellation', () => {
  function connected() {
    const io = fakeIo();
    registerSockets(io);
    const socket = fakeSocket();
    io.connect(socket);
    return socket;
  }

  it('chat:cancel aborts the in-flight generation and reports cancelled', async () => {
    let sink = null;
    assistantChatTurn.mockImplementation(async (sid, m, model, skills, userId, stream) => {
      sink = stream;
      await new Promise((r) => setImmediate(r));
      if (stream.signal.aborted) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
      return { status: 'sent' };
    });
    const socket = connected();
    // The send handler installs its AbortController synchronously, so a cancel
    // issued before the first await still reaches the in-flight generation.
    const done = socket.fire('chat:send', { message: 'hi' });
    socket.fire('chat:cancel');
    await done;
    expect(sink.signal.aborted).toBe(true);
    expect(socket.last().evt).toBe('chat:cancelled');
  });

  it('disconnect aborts the in-flight generation so it stops burning a slot', async () => {
    let sink = null;
    assistantChatTurn.mockImplementation(async (sid, m, model, skills, userId, stream) => {
      sink = stream;
      await new Promise((r) => setImmediate(r));
      return { status: 'sent' };
    });
    const socket = connected();
    const done = socket.fire('chat:send', { message: 'hi' });
    socket.fire('disconnect');
    await done;
    expect(sink.signal.aborted).toBe(true);
  });

  it('allows a new generation after the previous one finished', async () => {
    assistantChatTurn.mockResolvedValue({ status: 'sent' });
    const socket = connected();
    await socket.fire('chat:send', { message: 'one' });
    await socket.fire('chat:send', { message: 'two' });
    expect(assistantChatTurn).toHaveBeenCalledTimes(2);
  });
});
