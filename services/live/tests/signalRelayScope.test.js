/**
 * BUG-003 — `/live` WebRTC relay shared-room scoping.
 *
 * Namespace auth (SP-7 / STATUS #11) already gates signaling on a validated CA
 * identity; this suite covers the scoping layer on top of it: a relay to a
 * client-supplied `to` socket id must be DROPPED unless the target socket is a
 * participant of the sender's own room. Exercised for every relay path that
 * trusts a client-supplied target (`signal`, `offer`, `answer`, `ice-candidate`).
 */

jest.mock('axios');
jest.mock('../src/models', () => ({
  Participant: { findOne: jest.fn(), update: jest.fn() }
}));
// Imported by the socket module but unused there — stub to avoid require-time side effects.
jest.mock('../src/services/stream', () => ({}));
jest.mock('../src/services/room', () => ({}));

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
    _connect: (socket) => connectionHandler(socket)
  };
}

/** A fake client socket that records the event handlers the module registers. */
function createMockSocket(id, { authenticated = true, userId = 'u1' } = {}) {
  const handlers = {};
  const toEmitters = [];
  return {
    id,
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

const RELAY_EVENTS = ['signal', 'offer', 'answer', 'ice-candidate'];
const RELAY_PAYLOAD = { signal: { x: 1 }, offer: { x: 1 }, answer: { x: 1 }, candidate: { x: 1 } };

describe('live WebRTC relay shared-room scoping (BUG-003)', () => {
  let io;
  let handler;

  beforeEach(() => {
    jest.clearAllMocks();
    io = createMockIo();
    handler = new SocketHandler(io);
  });

  /** Register `socketId` as a tracked participant of `roomId` on the handler. */
  function putInRoom(socket, roomId) {
    const conn = handler.connections.get(socket.id);
    conn.roomId = roomId;
    if (!handler.roomParticipants.has(roomId)) {
      handler.roomParticipants.set(roomId, new Map());
    }
    handler.roomParticipants.get(roomId).set(socket.id, { userId: socket.userId });
  }

  function expectDropped(socket, event) {
    expect(socket.to).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ event, code: 'NOT_IN_SHARED_ROOM' })
    );
  }

  RELAY_EVENTS.forEach((event) => {
    describe(`"${event}"`, () => {
      it('drops a relay to a socket in a DIFFERENT room', () => {
        const sender = createMockSocket('sock-a', { userId: 'u1' });
        const target = createMockSocket('sock-b', { userId: 'u2' });
        io._connect(sender);
        io._connect(target);
        putInRoom(sender, 'room-1');
        putInRoom(target, 'room-2');

        sender._handlers[event]({ to: target.id, ...RELAY_PAYLOAD });

        expectDropped(sender, event);
      });

      it('drops a relay when the sender has not joined any room', () => {
        const sender = createMockSocket('sock-a', { userId: 'u1' });
        io._connect(sender);

        sender._handlers[event]({ to: 'sock-anywhere', ...RELAY_PAYLOAD });

        expectDropped(sender, event);
      });

      it('drops a relay to a target that is not a participant anywhere (e.g. an anonymous viewer)', () => {
        const sender = createMockSocket('sock-a', { userId: 'u1' });
        io._connect(sender);
        putInRoom(sender, 'room-1');

        sender._handlers[event]({ to: 'sock-viewer', ...RELAY_PAYLOAD });

        expectDropped(sender, event);
      });

      it('drops a relay with a missing/non-string `to`', () => {
        const sender = createMockSocket('sock-a', { userId: 'u1' });
        io._connect(sender);
        putInRoom(sender, 'room-1');

        sender._handlers[event]({ ...RELAY_PAYLOAD });
        sender._handlers[event]({ to: { nested: 'room-1' }, ...RELAY_PAYLOAD });

        expect(sender.to).not.toHaveBeenCalled();
        expect(sender.emit).toHaveBeenCalledWith(
          'error',
          expect.objectContaining({ event, code: 'NOT_IN_SHARED_ROOM' })
        );
      });

      it('forwards a relay when sender and target share a room', () => {
        const sender = createMockSocket('sock-a', { userId: 'u1' });
        const target = createMockSocket('sock-b', { userId: 'u2' });
        io._connect(sender);
        io._connect(target);
        putInRoom(sender, 'room-1');
        putInRoom(target, 'room-1');

        sender._handlers[event]({ to: target.id, ...RELAY_PAYLOAD });

        expect(sender.to).toHaveBeenCalledWith(target.id);
        expect(sender._toEmitters[0].emit).toHaveBeenCalledWith(
          event,
          expect.objectContaining({ from: sender.id })
        );
        expect(sender.emit).not.toHaveBeenCalledWith('error', expect.anything());
      });
    });
  });

  it('stops relaying to a peer after that peer leaves the shared room', async () => {
    const sender = createMockSocket('sock-a', { userId: 'u1' });
    const target = createMockSocket('sock-b', { userId: 'u2' });
    io._connect(sender);
    io._connect(target);
    putInRoom(sender, 'room-1');
    putInRoom(target, 'room-1');

    // Peer departs — the tracked participant entry goes away with it.
    handler.roomParticipants.get('room-1').delete(target.id);

    sender._handlers['offer']({ to: target.id, offer: { x: 1 } });

    expectDropped(sender, 'offer');
  });
});
