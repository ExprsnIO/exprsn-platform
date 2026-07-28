/**
 * FEAT-070 — socket-path block enforcement (DB-free).
 *
 * Drives the real socket handler module with a fake io/socket pair:
 *   - send:message into a frozen direct 1:1 → generic socket error, no
 *     Message.create, no "block" oracle
 *   - group-bound conversation exempt (ADR §3)
 *   - N2: notification fan-out drops recipients whose suppression set
 *     contains the sender (bell never lights)
 *   - typing:start does not broadcast into a frozen 1:1
 */

jest.mock('axios');

jest.mock('../../src/models', () => ({
  Message: { create: jest.fn(), findByPk: jest.fn() },
  Conversation: { findByPk: jest.fn(), update: jest.fn() },
  Participant: { findOne: jest.fn(), findAll: jest.fn() },
  MessageKey: { destroy: jest.fn() },
  Reaction: { findOrCreate: jest.fn() }
}));

jest.mock('../../src/services/messageModeration', () => ({
  moderateMessage: jest.fn()
}));

jest.mock('../../src/services/encryptionService', () => ({
  storeMessageKeys: jest.fn()
}));

jest.mock('../../src/services/groupChannelService', () => ({
  authorizeConversationAccess: jest.fn(),
  ensureParticipant: jest.fn()
}));

jest.mock('../../../timeline/src/services/relationshipService', () => ({
  getSuppressedIds: jest.fn(),
  getBlockedIds: jest.fn(),
  getBlockedByIds: jest.fn(),
  isBlockedEitherWay: jest.fn(),
  canContact: jest.fn()
}));

// BUG-061: send:message's plugin-hook fan-out (src/socket/index.js) lazily
// requires the REAL plugins module and fires `pluginHost.emit(...)` without
// awaiting it. With PLUGINS_ENABLED=true (this repo's dev .env), the real
// pluginHost opens a genuine Sequelize connection to query PluginInstallation
// — an unmocked, un-awaited DB call that outlives the test run and leaves an
// undetectable open TCP handle (`--detectOpenHandles` reports nothing because
// the handle is created after the test's own assertions complete). Mock it
// like every other lazily-required service in this file so the suite never
// touches live infra.
jest.mock('../../../plugins/src/services/pluginHost', () => ({
  emit: jest.fn().mockResolvedValue(undefined)
}));

const axios = require('axios');
const { Message, Conversation, Participant } = require('../../src/models');
const { authorizeConversationAccess, ensureParticipant } =
  require('../../src/services/groupChannelService');
const relationshipService = require('../../../timeline/src/services/relationshipService');
const registerSocketHandlers = require('../../src/socket');

const SENDER = 'aaaaaaaa-0000-0000-0000-000000000001';
const OTHER = 'bbbbbbbb-0000-0000-0000-000000000002';

/** Flush the microtask queue so fire-and-forget chains settle. */
async function flush(times = 5) {
  for (let i = 0; i < times; i++) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function buildHarness() {
  let connectionHandler;
  const roomEmit = jest.fn();
  const io = {
    use: jest.fn(),
    on: jest.fn((event, cb) => {
      if (event === 'connection') connectionHandler = cb;
    }),
    to: jest.fn(() => ({ emit: roomEmit }))
  };

  registerSocketHandlers(io);

  const handlers = {};
  const socketRoomEmit = jest.fn();
  const socket = {
    id: 'sock-1',
    userId: SENDER,
    permissions: { write: true, read: true },
    tokenData: { displayName: 'Sender' },
    on: jest.fn((event, cb) => {
      handlers[event] = cb;
    }),
    emit: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    to: jest.fn(() => ({ emit: socketRoomEmit }))
  };

  connectionHandler(socket);
  return { io, socket, handlers, roomEmit, socketRoomEmit };
}

describe('FEAT-070 socket enforcement', () => {
  beforeEach(() => {
    relationshipService.isBlockedEitherWay.mockResolvedValue(false);
    relationshipService.getSuppressedIds.mockResolvedValue([]);
    axios.post.mockResolvedValue({ data: { ok: true } });
    Conversation.findByPk.mockResolvedValue({ id: 'c1', type: 'direct', groupId: null });
    Conversation.update.mockResolvedValue([1]);
    Participant.findOne.mockResolvedValue({ userId: SENDER, active: true });
    Participant.findAll.mockResolvedValue([
      { userId: SENDER, muted: false, active: true },
      { userId: OTHER, muted: false, active: true }
    ]);
    Message.create.mockResolvedValue({
      id: 'm1',
      conversationId: 'c1',
      senderId: SENDER,
      encrypted: false,
      content: 'hello',
      contentType: 'text',
      toJSON: () => ({ id: 'm1', conversationId: 'c1', senderId: SENDER, content: 'hello' })
    });
  });

  describe('send:message (S2)', () => {
    it('rejects a send into a frozen direct 1:1 with a generic socket error and no Message row', async () => {
      relationshipService.isBlockedEitherWay.mockResolvedValue(true);
      const { socket, handlers } = buildHarness();

      await handlers['send:message']({ conversationId: 'c1', content: 'hi' });

      expect(Message.create).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith('error', {
        event: 'send:message',
        message: 'You cannot send messages to this conversation'
      });
      const emitted = JSON.stringify(socket.emit.mock.calls);
      expect(emitted).not.toMatch(/block/i);
    });

    it('FAIL-CLOSED: façade failure rejects the send with the plain generic failure', async () => {
      relationshipService.isBlockedEitherWay.mockRejectedValue(new Error('timeline down'));
      const { socket, handlers } = buildHarness();

      await handlers['send:message']({ conversationId: 'c1', content: 'hi' });

      expect(Message.create).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith('error', {
        event: 'send:message',
        message: 'Failed to send message'
      });
    });

    it('delivers normally when not blocked', async () => {
      const { io, handlers } = buildHarness();

      await handlers['send:message']({ conversationId: 'c1', content: 'hi' });

      expect(Message.create).toHaveBeenCalled();
      expect(io.to).toHaveBeenCalledWith('conversation:c1');
    });

    it('exempts nexus group-bound conversations even when the pair is blocked (ADR §3)', async () => {
      Conversation.findByPk.mockResolvedValue({ id: 'c2', type: 'group', groupId: 'nexus-g1' });
      authorizeConversationAccess.mockResolvedValue({ ok: true, role: 'member' });
      ensureParticipant.mockResolvedValue({});
      relationshipService.isBlockedEitherWay.mockResolvedValue(true);
      const { handlers } = buildHarness();

      await handlers['send:message']({ conversationId: 'c2', content: 'hi' });

      expect(Message.create).toHaveBeenCalled();
      expect(relationshipService.isBlockedEitherWay).not.toHaveBeenCalled();
    });
  });

  describe('notification fan-in (N2)', () => {
    it('drops the bell notification for a recipient whose suppression set contains the sender', async () => {
      // Recipient OTHER has blocked (or muted) SENDER.
      relationshipService.getSuppressedIds.mockImplementation(async (viewerId) =>
        (viewerId === OTHER ? [SENDER] : [])
      );
      const { handlers } = buildHarness();

      await handlers['send:message']({ conversationId: 'c1', content: 'hi' });
      await flush();

      // Message still delivered to the room, but no ingest POST for OTHER.
      expect(Message.create).toHaveBeenCalled();
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('still notifies untouched recipients', async () => {
      const { handlers } = buildHarness();

      await handlers['send:message']({ conversationId: 'c1', content: 'hi' });
      await flush();

      expect(axios.post).toHaveBeenCalledTimes(1);
      const [, body] = axios.post.mock.calls[0];
      expect(body.userId).toBe(OTHER);
    });
  });

  describe('typing indicator gate', () => {
    it('does not broadcast typing into a frozen 1:1 (silent no-op)', async () => {
      relationshipService.isBlockedEitherWay.mockResolvedValue(true);
      const { socket, handlers, socketRoomEmit } = buildHarness();

      await handlers['typing:start']('c1');

      expect(socket.to).not.toHaveBeenCalled();
      expect(socketRoomEmit).not.toHaveBeenCalled();
      // And no error is surfaced — nothing reveals the relationship.
      expect(socket.emit).not.toHaveBeenCalledWith('error', expect.anything());
    });

    it('broadcasts typing normally when not blocked', async () => {
      const { socket, handlers } = buildHarness();

      await handlers['typing:start']('c1');

      expect(socket.to).toHaveBeenCalledWith('conversation:c1');
    });
  });
});
