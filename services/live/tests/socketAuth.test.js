/**
 * SP-7 / STATUS #11 — `/live` publish & WebRTC signaling auth.
 *
 * The /live namespace is open to anonymous stream VIEWERS (HLS playback + viewer
 * tracking carry no privilege), but every publish/host action — `join-room`,
 * `update-participant-state`, and all WebRTC signaling (`signal`/`offer`/`answer`/
 * `ice-candidate`) — must be gated on a validated CA bearer. These tests drive the
 * accept/reject path for each of those events plus the optional-auth handshake.
 */

jest.mock('axios');
jest.mock('../src/models', () => ({
  Participant: { findOne: jest.fn(), update: jest.fn() }
}));
// Imported by the socket module but unused there — stub to avoid require-time side effects.
jest.mock('../src/services/stream', () => ({}));
jest.mock('../src/services/room', () => ({}));

const axios = require('axios');
const { Participant } = require('../src/models');
const SocketHandler = require('../src/sockets');

/** A minimal stand-in for the gateway-owned /live namespace. */
function createMockIo() {
  let connectionHandler = null;
  const middleware = [];
  return {
    use: (fn) => middleware.push(fn),
    on: (event, fn) => { if (event === 'connection') connectionHandler = fn; },
    to: jest.fn(() => ({ emit: jest.fn() })),
    emit: jest.fn(),
    sockets: new Map(),
    _handshake: (socket, next = () => {}) => middleware[0](socket, next),
    _connect: (socket) => connectionHandler(socket)
  };
}

/** A fake client socket that records the event handlers the module registers. */
function createMockSocket({ authenticated = false, userId = null } = {}) {
  const handlers = {};
  const toEmitters = [];
  return {
    id: `sock-${Math.random().toString(36).slice(2)}`,
    authenticated,
    userId,
    userEmail: null,
    handshake: { auth: {}, headers: {} },
    on: (event, fn) => { handlers[event] = fn; },
    emit: jest.fn(),
    join: jest.fn(),
    to: jest.fn(() => {
      const emitter = { emit: jest.fn() };
      toEmitters.push(emitter);
      return emitter;
    }),
    _handlers: handlers,
    _toEmitters: toEmitters
  };
}

describe('live socket auth (SP-7 / STATUS #11)', () => {
  let io;

  beforeEach(() => {
    jest.clearAllMocks();
    io = createMockIo();
    // eslint-disable-next-line no-new -- constructor wires use()/on() onto the mock io
    new SocketHandler(io);
  });

  describe('optional-auth handshake', () => {
    it('stamps identity from a valid CA bearer', async () => {
      axios.post.mockResolvedValue({
        data: { valid: true, userId: 'u1', tokenData: { email: 'host@exprsn.test' } }
      });
      const socket = createMockSocket();
      socket.handshake.auth.token = 'good-token';
      const next = jest.fn();

      await io._handshake(socket, next);

      expect(next).toHaveBeenCalled();
      expect(socket.authenticated).toBe(true);
      expect(socket.userId).toBe('u1');
      expect(socket.userEmail).toBe('host@exprsn.test');
    });

    it('admits an anonymous viewer (no token) without blocking', async () => {
      const socket = createMockSocket();
      const next = jest.fn();

      await io._handshake(socket, next);

      expect(next).toHaveBeenCalled();
      expect(axios.post).not.toHaveBeenCalled();
      expect(socket.authenticated).toBe(false);
      expect(socket.userId).toBeNull();
    });

    it('never blocks a viewer when CA validation fails', async () => {
      axios.post.mockRejectedValue(new Error('CA unreachable'));
      const socket = createMockSocket();
      socket.handshake.auth.token = 'whatever';
      const next = jest.fn();

      await io._handshake(socket, next);

      expect(next).toHaveBeenCalled();
      expect(socket.authenticated).toBe(false);
    });

    it('treats an invalid token as anonymous', async () => {
      axios.post.mockResolvedValue({ data: { valid: false } });
      const socket = createMockSocket();
      socket.handshake.auth.token = 'expired';
      const next = jest.fn();

      await io._handshake(socket, next);

      expect(next).toHaveBeenCalled();
      expect(socket.authenticated).toBe(false);
      expect(socket.userId).toBeNull();
    });
  });

  describe('WebRTC signaling guards', () => {
    const SIGNALING = ['signal', 'offer', 'answer', 'ice-candidate'];

    SIGNALING.forEach((event) => {
      it(`rejects "${event}" from an unauthenticated socket`, () => {
        const socket = createMockSocket({ authenticated: false });
        io._connect(socket);

        socket._handlers[event]({ to: 'peer-1', signal: {}, offer: {}, answer: {}, candidate: {} });

        expect(socket.emit).toHaveBeenCalledWith(
          'error',
          expect.objectContaining({ event, code: 'UNAUTHENTICATED' })
        );
        expect(socket.to).not.toHaveBeenCalled();
      });

      it(`forwards "${event}" from an authenticated socket`, () => {
        const socket = createMockSocket({ authenticated: true, userId: 'u1' });
        io._connect(socket);

        socket._handlers[event]({ to: 'peer-1', signal: { x: 1 }, offer: { x: 1 }, answer: { x: 1 }, candidate: { x: 1 } });

        expect(socket.to).toHaveBeenCalledWith('peer-1');
        expect(socket._toEmitters[0].emit).toHaveBeenCalledWith(
          event,
          expect.objectContaining({ from: socket.id })
        );
        expect(socket.emit).not.toHaveBeenCalledWith('error', expect.anything());
      });
    });
  });

  describe('join-room guard', () => {
    it('rejects join-room from an unauthenticated socket (no DB lookup)', async () => {
      const socket = createMockSocket({ authenticated: false });
      io._connect(socket);

      await socket._handlers['join-room']({ roomId: 'room-1' });

      expect(socket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ event: 'join-room', code: 'UNAUTHENTICATED' })
      );
      expect(Participant.findOne).not.toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('binds the participant by the validated userId for an authed socket', async () => {
      Participant.findOne.mockResolvedValue({
        id: 'p1',
        user_id: 'u1',
        room_id: 'room-1',
        display_name: 'Alice',
        role: 'host',
        socket_id: null,
        update: jest.fn().mockResolvedValue(undefined)
      });
      const socket = createMockSocket({ authenticated: true, userId: 'u1' });
      io._connect(socket);

      await socket._handlers['join-room']({ roomId: 'room-1' });

      // Looked up by the bearer identity, not client-supplied data.
      expect(Participant.findOne).toHaveBeenCalledWith({
        where: { user_id: 'u1', room_id: 'room-1', status: 'connected' }
      });
      expect(socket.join).toHaveBeenCalledWith('room-1');
      expect(socket.emit).not.toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ code: 'UNAUTHENTICATED' })
      );
    });
  });

  describe('update-participant-state guard', () => {
    it('rejects update-participant-state from an unauthenticated socket', () => {
      const socket = createMockSocket({ authenticated: false });
      io._connect(socket);

      socket._handlers['update-participant-state']({ roomId: 'room-1', state: { audioEnabled: false } });

      expect(socket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ event: 'update-participant-state', code: 'UNAUTHENTICATED' })
      );
    });

    it('passes the auth guard for an authed socket (missing slot is a safe no-op)', () => {
      const socket = createMockSocket({ authenticated: true, userId: 'u1' });
      io._connect(socket);

      // No participant slot has been registered for this socket, so the handler
      // returns without emitting state — but crucially it is NOT rejected as
      // unauthenticated, proving the guard admits a validated identity.
      socket._handlers['update-participant-state']({ roomId: 'room-1', state: { audioEnabled: false } });

      expect(socket.emit).not.toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ code: 'UNAUTHENTICATED' })
      );
    });
  });

  describe('viewer path stays open', () => {
    it('allows join-stream without authentication', async () => {
      const socket = createMockSocket({ authenticated: false });
      io._connect(socket);

      await socket._handlers['join-stream']({ streamId: 'stream-1' });

      expect(socket.join).toHaveBeenCalledWith('stream-1');
      expect(socket.emit).not.toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ code: 'UNAUTHENTICATED' })
      );
    });
  });
});
