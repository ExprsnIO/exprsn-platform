/**
 * Live stream chat — ephemeral, in-memory chat over the `/live` namespace.
 *
 * Reading chat is open to anonymous viewers (they receive `chat-history` on
 * join and `stream-chat-message` broadcasts), but POSTING a message requires a
 * validated CA identity and that the sender has joined the stream. The author is
 * bound to the validated `userId` (never client data); the display name is a
 * cosmetic, capped, client-supplied label. Messages are trimmed/truncated and
 * rate-limited per socket, with a capped per-stream history replayed to late
 * joiners.
 */

jest.mock('axios');
jest.mock('../src/models', () => ({
  Participant: { findOne: jest.fn(), update: jest.fn() }
}));
// Imported by the socket module but unused there — stub to avoid require-time side effects.
jest.mock('../src/services/stream', () => ({}));
jest.mock('../src/services/room', () => ({}));

const SocketHandler = require('../src/sockets');

/**
 * A minimal stand-in for the gateway-owned /live namespace that records every
 * `io.to(room).emit(event, payload)` so room broadcasts can be asserted.
 */
function createMockIo() {
  let connectionHandler = null;
  const middleware = [];
  const roomEmits = [];
  return {
    use: (fn) => middleware.push(fn),
    on: (event, fn) => { if (event === 'connection') connectionHandler = fn; },
    to: jest.fn((room) => ({
      emit: (event, payload) => roomEmits.push({ room, event, payload })
    })),
    emit: jest.fn(),
    sockets: new Map(),
    _roomEmits: roomEmits,
    _chatBroadcasts: (room) =>
      roomEmits.filter((e) => e.event === 'stream-chat-message' && e.room === room),
    _connect: (socket) => connectionHandler(socket)
  };
}

function createMockSocket({ authenticated = false, userId = null, email = null } = {}) {
  const handlers = {};
  return {
    id: `sock-${Math.random().toString(36).slice(2)}`,
    authenticated,
    userId,
    userEmail: email,
    handshake: { auth: {}, headers: {} },
    on: (event, fn) => { handlers[event] = fn; },
    emit: jest.fn(),
    join: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() })),
    _handlers: handlers
  };
}

/** Find the last payload a socket.emit received for a given event. */
function lastEmit(socket, event) {
  const calls = socket.emit.mock.calls.filter((c) => c[0] === event);
  return calls.length ? calls[calls.length - 1][1] : undefined;
}

const STREAM = 'stream-1';

describe('live stream chat', () => {
  let io;
  let handler;

  beforeEach(() => {
    jest.clearAllMocks();
    io = createMockIo();
    handler = new SocketHandler(io);
  });

  /** Connect a socket and (optionally) join it to the stream as a viewer. */
  async function connectAndJoin(socket, { join = true } = {}) {
    io._connect(socket);
    if (join) await socket._handlers['join-stream']({ streamId: STREAM });
    return socket;
  }

  describe('send authorization', () => {
    it('rejects a message from an unauthenticated viewer', async () => {
      const socket = createMockSocket({ authenticated: false });
      await connectAndJoin(socket);

      socket._handlers['stream-chat-message']({ streamId: STREAM, message: 'hello' });

      expect(socket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ event: 'stream-chat-message', code: 'UNAUTHENTICATED' })
      );
      expect(io._chatBroadcasts(STREAM)).toHaveLength(0);
    });

    it('rejects a message from an authed socket that has not joined the stream', async () => {
      const socket = createMockSocket({ authenticated: true, userId: 'u1' });
      await connectAndJoin(socket, { join: false });

      socket._handlers['stream-chat-message']({ streamId: STREAM, message: 'hello' });

      expect(socket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ event: 'stream-chat-message', code: 'NOT_IN_STREAM' })
      );
      expect(io._chatBroadcasts(STREAM)).toHaveLength(0);
    });

    it('broadcasts a message from an authed viewer who has joined', async () => {
      const socket = createMockSocket({ authenticated: true, userId: 'u1' });
      await connectAndJoin(socket);

      socket._handlers['stream-chat-message']({
        streamId: STREAM,
        message: 'hi there',
        displayName: 'Alice'
      });

      const broadcasts = io._chatBroadcasts(STREAM);
      expect(broadcasts).toHaveLength(1);
      expect(broadcasts[0].payload).toMatchObject({
        streamId: STREAM,
        userId: 'u1',
        displayName: 'Alice',
        message: 'hi there'
      });
      expect(typeof broadcasts[0].payload.id).toBe('string');
      expect(typeof broadcasts[0].payload.ts).toBe('number');
    });
  });

  describe('author binding & sanitization', () => {
    it('binds userId to the validated identity, not client data', async () => {
      const socket = createMockSocket({ authenticated: true, userId: 'real-user' });
      await connectAndJoin(socket);

      socket._handlers['stream-chat-message']({
        streamId: STREAM,
        message: 'spoof?',
        userId: 'attacker',
        displayName: 'Bob'
      });

      expect(io._chatBroadcasts(STREAM)[0].payload.userId).toBe('real-user');
    });

    it('falls back to a derived display name when none is supplied', async () => {
      const socket = createMockSocket({ authenticated: true, userId: 'abcdef1234' });
      await connectAndJoin(socket);

      socket._handlers['stream-chat-message']({ streamId: STREAM, message: 'hi' });

      expect(io._chatBroadcasts(STREAM)[0].payload.displayName).toBe('user-abcdef12');
    });

    it('trims whitespace and drops empty messages', async () => {
      const socket = createMockSocket({ authenticated: true, userId: 'u1' });
      await connectAndJoin(socket);

      socket._handlers['stream-chat-message']({ streamId: STREAM, message: '   ' });
      expect(io._chatBroadcasts(STREAM)).toHaveLength(0);

      socket._handlers['stream-chat-message']({ streamId: STREAM, message: '  padded  ' });
      expect(io._chatBroadcasts(STREAM)[0].payload.message).toBe('padded');
    });

    it('truncates an over-long message', async () => {
      const socket = createMockSocket({ authenticated: true, userId: 'u1' });
      await connectAndJoin(socket);

      socket._handlers['stream-chat-message']({ streamId: STREAM, message: 'x'.repeat(1000) });

      expect(io._chatBroadcasts(STREAM)[0].payload.message).toHaveLength(500);
    });
  });

  describe('history replay', () => {
    it('replays recent chat to a late joiner', async () => {
      const author = createMockSocket({ authenticated: true, userId: 'u1' });
      await connectAndJoin(author);
      author._handlers['stream-chat-message']({ streamId: STREAM, message: 'first!', displayName: 'A' });

      const latecomer = createMockSocket({ authenticated: false });
      await connectAndJoin(latecomer);

      const history = lastEmit(latecomer, 'chat-history');
      expect(history).toBeDefined();
      expect(history.streamId).toBe(STREAM);
      expect(history.messages.map((m) => m.message)).toContain('first!');
    });

    it('does not emit chat-history when there is no chat yet', async () => {
      const viewer = createMockSocket({ authenticated: false });
      await connectAndJoin(viewer);

      expect(lastEmit(viewer, 'chat-history')).toBeUndefined();
    });

    it('clears chat history when the stream is deleted', async () => {
      const author = createMockSocket({ authenticated: true, userId: 'u1' });
      await connectAndJoin(author);
      author._handlers['stream-chat-message']({ streamId: STREAM, message: 'gone soon' });

      handler.broadcastStreamDeleted(STREAM);

      const latecomer = createMockSocket({ authenticated: false });
      await connectAndJoin(latecomer);
      expect(lastEmit(latecomer, 'chat-history')).toBeUndefined();
    });
  });

  describe('rate limiting', () => {
    it('throttles a socket that exceeds the send rate', async () => {
      const socket = createMockSocket({ authenticated: true, userId: 'u1' });
      await connectAndJoin(socket);

      // CHAT_RATE_MAX is 8 within the window; the 9th should be throttled.
      for (let i = 0; i < 8; i++) {
        socket._handlers['stream-chat-message']({ streamId: STREAM, message: `m${i}` });
      }
      expect(io._chatBroadcasts(STREAM)).toHaveLength(8);

      socket._handlers['stream-chat-message']({ streamId: STREAM, message: 'over the limit' });

      expect(io._chatBroadcasts(STREAM)).toHaveLength(8);
      expect(socket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ event: 'stream-chat-message', code: 'RATE_LIMITED' })
      );
    });
  });
});
