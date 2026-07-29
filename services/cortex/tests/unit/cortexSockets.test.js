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
