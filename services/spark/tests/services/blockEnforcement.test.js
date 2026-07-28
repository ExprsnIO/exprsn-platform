/**
 * FEAT-070 — service-layer block enforcement (DB-free).
 *
 * messageService (S2 send + S5 history filter) and conversationService
 * (S1 create-direct + S3 add-participant + S4 list) with mocked models and a
 * mocked timeline relationship façade.
 */

jest.mock('../../src/models', () => ({
  Message: { create: jest.fn(), findAll: jest.fn() },
  Conversation: { create: jest.fn(), findByPk: jest.fn(), update: jest.fn() },
  Participant: { create: jest.fn(), findOne: jest.fn(), findAll: jest.fn() },
  Reaction: {}
}));

jest.mock('../../src/services/messageModeration', () => ({
  moderateMessage: jest.fn()
}));

jest.mock('../../../timeline/src/services/relationshipService', () => ({
  getSuppressedIds: jest.fn(),
  getBlockedIds: jest.fn(),
  getBlockedByIds: jest.fn(),
  isBlockedEitherWay: jest.fn(),
  canContact: jest.fn()
}));

const { Op } = require('sequelize');
const { Message, Conversation, Participant } = require('../../src/models');
const relationshipService = require('../../../timeline/src/services/relationshipService');
const contactPolicy = require('../../src/services/contactPolicy');
const messageService = require('../../src/services/messageService');
const conversationService = require('../../src/services/conversationService');

const SENDER = 'aaaaaaaa-0000-0000-0000-000000000001';
const OTHER = 'bbbbbbbb-0000-0000-0000-000000000002';

describe('FEAT-070 service-layer enforcement', () => {
  beforeEach(() => {
    relationshipService.isBlockedEitherWay.mockResolvedValue(false);
    relationshipService.getSuppressedIds.mockResolvedValue([]);
    Participant.findOne.mockResolvedValue({ userId: SENDER });
    Participant.findAll.mockResolvedValue([{ userId: SENDER }, { userId: OTHER }]);
    Participant.create.mockResolvedValue({ userId: OTHER });
    Conversation.findByPk.mockResolvedValue({ id: 'c1', type: 'direct', groupId: null });
    Conversation.create.mockResolvedValue({ id: 'c-new' });
    Conversation.update.mockResolvedValue([1]);
    Message.create.mockResolvedValue({ id: 'm1', senderId: SENDER });
    Message.findAll.mockResolvedValue([]);
  });

  describe('messageService.sendMessage (S2)', () => {
    it('rejects a blocked direct send with the generic 403 and never creates the message', async () => {
      relationshipService.isBlockedEitherWay.mockResolvedValue(true);

      const err = await messageService
        .sendMessage('c1', SENDER, 'hello')
        .catch((e) => e);

      expect(err).toBeInstanceOf(contactPolicy.ContactForbiddenError);
      expect(err.statusCode).toBe(403);
      expect(err.message).not.toMatch(/block/i);
      expect(Message.create).not.toHaveBeenCalled();
    });

    it('allows the send in a group conversation even when the pair is blocked (ADR §3 exemption)', async () => {
      Conversation.findByPk.mockResolvedValue({ id: 'c1', type: 'group', groupId: null });
      relationshipService.isBlockedEitherWay.mockResolvedValue(true);

      const message = await messageService.sendMessage('c1', SENDER, 'hello');
      expect(message).toBeTruthy();
      expect(Message.create).toHaveBeenCalled();
      expect(relationshipService.isBlockedEitherWay).not.toHaveBeenCalled();
    });

    it('FAIL-CLOSED: façade failure rejects the send without creating the message', async () => {
      relationshipService.isBlockedEitherWay.mockRejectedValue(new Error('timeline down'));

      await expect(messageService.sendMessage('c1', SENDER, 'hello'))
        .rejects.toThrow(contactPolicy.ContactCheckError);
      expect(Message.create).not.toHaveBeenCalled();
    });

    it('sends normally when not blocked', async () => {
      const message = await messageService.sendMessage('c1', SENDER, 'hello');
      expect(message.id).toBe('m1');
      expect(Message.create).toHaveBeenCalled();
    });
  });

  describe('messageService.getMessages (S5)', () => {
    it('filters suppressed senders with one set call + [Op.notIn]', async () => {
      relationshipService.getSuppressedIds.mockResolvedValue([OTHER]);

      await messageService.getMessages('c1', SENDER);

      expect(relationshipService.getSuppressedIds).toHaveBeenCalledTimes(1);
      const where = Message.findAll.mock.calls[0][0].where;
      expect(where.senderId[Op.notIn]).toEqual([OTHER]);
    });

    it('adds no sender filter when nothing is suppressed', async () => {
      await messageService.getMessages('c1', SENDER);
      const where = Message.findAll.mock.calls[0][0].where;
      expect(where.senderId).toBeUndefined();
    });
  });

  describe('conversationService.createConversation (S1)', () => {
    it('rejects creating a direct conversation with a blocked pair', async () => {
      relationshipService.isBlockedEitherWay.mockResolvedValue(true);

      await expect(conversationService.createConversation(SENDER, [OTHER], { type: 'direct' }))
        .rejects.toThrow(contactPolicy.ContactForbiddenError);
      expect(Conversation.create).not.toHaveBeenCalled();
    });

    it('allows group creation regardless of relationship (ADR §3)', async () => {
      relationshipService.isBlockedEitherWay.mockResolvedValue(true);

      const conv = await conversationService.createConversation(
        SENDER, [OTHER], { type: 'group', name: 'g' }
      );
      expect(conv.id).toBe('c-new');
      expect(relationshipService.isBlockedEitherWay).not.toHaveBeenCalled();
    });
  });

  describe('conversationService.addParticipant (S3)', () => {
    it('rejects adding a user the adder is in a blocked pair with', async () => {
      relationshipService.isBlockedEitherWay.mockResolvedValue(true);
      // getConversationById path: requester is a participant.
      Participant.findOne
        .mockResolvedValueOnce({ userId: SENDER }) // access check
        .mockResolvedValueOnce(null); // not already in conversation

      await expect(conversationService.addParticipant('c1', OTHER, SENDER))
        .rejects.toThrow(contactPolicy.ContactForbiddenError);
      expect(Participant.create).not.toHaveBeenCalled();
    });
  });

  describe('conversationService.getUserConversations (S4)', () => {
    it('hides frozen direct conversations from the list', async () => {
      const direct = { id: 'c-frozen', type: 'direct', groupId: null };
      const group = { id: 'c-group', type: 'group', groupId: null };
      Participant.findAll
        .mockResolvedValueOnce([{ Conversation: direct }, { Conversation: group }]) // list query
        .mockResolvedValueOnce([{ conversationId: 'c-frozen' }]); // suppressed counterpart lookup
      relationshipService.getSuppressedIds.mockResolvedValue([OTHER]);

      const out = await conversationService.getUserConversations(SENDER);
      expect(out.map((c) => c.id)).toEqual(['c-group']);
    });
  });
});
