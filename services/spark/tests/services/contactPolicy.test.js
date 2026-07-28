/**
 * FEAT-070 — contactPolicy unit tests (DB-free).
 *
 * The single audited guard for spark's block enforcement (S1–S5 + N2).
 * Models and the timeline relationship façade are mocked (same pattern as
 * timeline's tests/unit/enforcement.test.js). Proves:
 *   - direct (1:1) blocked pair → generic 403, no "block" oracle
 *   - group / group-bound conversations exempt (façade never consulted)
 *   - FAIL-CLOSED: façade failure rejects the write (ContactCheckError),
 *     and never with the 403 contact message
 *   - S4 hidden-conversation set and N2 recipient filtering semantics
 */

jest.mock('../../src/models', () => ({
  Conversation: { findByPk: jest.fn() },
  Participant: { findAll: jest.fn() }
}));

jest.mock('../../../timeline/src/services/relationshipService', () => ({
  getSuppressedIds: jest.fn(),
  getBlockedIds: jest.fn(),
  getBlockedByIds: jest.fn(),
  isBlockedEitherWay: jest.fn(),
  canContact: jest.fn()
}));

const { Conversation, Participant } = require('../../src/models');
const relationshipService = require('../../../timeline/src/services/relationshipService');
const contactPolicy = require('../../src/services/contactPolicy');

const SENDER = 'aaaaaaaa-0000-0000-0000-000000000001';
const OTHER = 'bbbbbbbb-0000-0000-0000-000000000002';

const directConv = { id: 'c-direct', type: 'direct', groupId: null };
const groupConv = { id: 'c-group', type: 'group', groupId: null };
const groupBoundConv = { id: 'c-nexus', type: 'group', groupId: 'nexus-g1' };

describe('contactPolicy (FEAT-070)', () => {
  beforeEach(() => {
    relationshipService.isBlockedEitherWay.mockResolvedValue(false);
    relationshipService.getSuppressedIds.mockResolvedValue([]);
    Conversation.findByPk.mockResolvedValue(null);
    Participant.findAll.mockResolvedValue([
      { userId: SENDER },
      { userId: OTHER }
    ]);
  });

  describe('assertCanContact (S2)', () => {
    it('rejects a send in a direct conversation when the pair is blocked either way', async () => {
      relationshipService.isBlockedEitherWay.mockResolvedValue(true);

      await expect(contactPolicy.assertCanContact(SENDER, directConv))
        .rejects.toThrow(contactPolicy.ContactForbiddenError);

      expect(relationshipService.isBlockedEitherWay).toHaveBeenCalledWith(SENDER, OTHER);
    });

    it('403 rejection is generic — it never says "block" (no-leak, FEAT-011 wording)', async () => {
      relationshipService.isBlockedEitherWay.mockResolvedValue(true);

      const err = await contactPolicy.assertCanContact(SENDER, directConv).catch((e) => e);
      expect(err.statusCode).toBe(403);
      expect(err.isOperational).toBe(true);
      expect(err.message).toBe('You cannot send messages to this conversation');
      expect(err.message).not.toMatch(/block/i);
    });

    it('allows a direct send when not blocked', async () => {
      await expect(contactPolicy.assertCanContact(SENDER, directConv)).resolves.toBeUndefined();
    });

    it('exempts spark group conversations — façade never consulted (ADR §3)', async () => {
      relationshipService.isBlockedEitherWay.mockResolvedValue(true);

      await expect(contactPolicy.assertCanContact(SENDER, groupConv)).resolves.toBeUndefined();
      expect(relationshipService.isBlockedEitherWay).not.toHaveBeenCalled();
      expect(Participant.findAll).not.toHaveBeenCalled();
    });

    it('exempts nexus group-bound conversations (conversation.groupId)', async () => {
      relationshipService.isBlockedEitherWay.mockResolvedValue(true);

      await expect(contactPolicy.assertCanContact(SENDER, groupBoundConv)).resolves.toBeUndefined();
      expect(relationshipService.isBlockedEitherWay).not.toHaveBeenCalled();
    });

    it('resolves a conversation id via the model when given an id', async () => {
      Conversation.findByPk.mockResolvedValue(directConv);
      relationshipService.isBlockedEitherWay.mockResolvedValue(true);

      await expect(contactPolicy.assertCanContact(SENDER, 'c-direct'))
        .rejects.toThrow(contactPolicy.ContactForbiddenError);
      expect(Conversation.findByPk).toHaveBeenCalledWith('c-direct');
    });

    it('FAIL-CLOSED: façade failure rejects the send — but NOT with the 403 contact message', async () => {
      relationshipService.isBlockedEitherWay.mockRejectedValue(new Error('timeline db down'));

      const err = await contactPolicy.assertCanContact(SENDER, directConv).catch((e) => e);
      expect(err).toBeInstanceOf(contactPolicy.ContactCheckError);
      expect(err).not.toBeInstanceOf(contactPolicy.ContactForbiddenError);
      // Non-operational: shared errorHandler masks it as a generic 500.
      expect(err.isOperational).not.toBe(true);
      expect(err.message).not.toMatch(/block/i);
      expect(err.message).not.toMatch(/cannot send/i);
    });
  });

  describe('assertCanContactUsers (S1/S3)', () => {
    it('rejects contact initiation toward a blocked user with the generic user message', async () => {
      relationshipService.isBlockedEitherWay.mockResolvedValue(true);

      const err = await contactPolicy.assertCanContactUsers(SENDER, [OTHER]).catch((e) => e);
      expect(err).toBeInstanceOf(contactPolicy.ContactForbiddenError);
      expect(err.message).toBe('You cannot interact with this user');
      expect(err.message).not.toMatch(/block/i);
    });

    it('allows when not blocked, and skips self/empty targets without consulting the façade', async () => {
      await expect(contactPolicy.assertCanContactUsers(SENDER, [OTHER])).resolves.toBeUndefined();

      relationshipService.isBlockedEitherWay.mockClear();
      await expect(contactPolicy.assertCanContactUsers(SENDER, [SENDER, null])).resolves.toBeUndefined();
      expect(relationshipService.isBlockedEitherWay).not.toHaveBeenCalled();
    });

    it('FAIL-CLOSED on façade failure', async () => {
      relationshipService.isBlockedEitherWay.mockRejectedValue(new Error('boom'));
      await expect(contactPolicy.assertCanContactUsers(SENDER, [OTHER]))
        .rejects.toThrow(contactPolicy.ContactCheckError);
    });
  });

  describe('canContactInConversation (forward targets / typing gate)', () => {
    it('true when contact is allowed', async () => {
      await expect(contactPolicy.canContactInConversation(SENDER, directConv)).resolves.toBe(true);
    });

    it('false when blocked', async () => {
      relationshipService.isBlockedEitherWay.mockResolvedValue(true);
      await expect(contactPolicy.canContactInConversation(SENDER, directConv)).resolves.toBe(false);
    });

    it('false (fail-closed) when the lookup fails — never throws', async () => {
      relationshipService.isBlockedEitherWay.mockRejectedValue(new Error('boom'));
      await expect(contactPolicy.canContactInConversation(SENDER, directConv)).resolves.toBe(false);
    });
  });

  describe('getHiddenConversationIds (S4)', () => {
    it('hides a direct conversation whose counterpart is suppressed', async () => {
      relationshipService.getSuppressedIds.mockResolvedValue([OTHER]);
      Participant.findAll.mockResolvedValue([{ conversationId: 'c-direct' }]);

      const hidden = await contactPolicy.getHiddenConversationIds(SENDER, [directConv, groupConv]);
      expect(hidden.has('c-direct')).toBe(true);
      expect(hidden.has('c-group')).toBe(false);
    });

    it('never hides group / group-bound conversations and short-circuits with no direct convs', async () => {
      const hidden = await contactPolicy.getHiddenConversationIds(SENDER, [groupConv, groupBoundConv]);
      expect(hidden.size).toBe(0);
      expect(relationshipService.getSuppressedIds).not.toHaveBeenCalled();
    });

    it('short-circuits without a participant query when nothing is suppressed', async () => {
      const hidden = await contactPolicy.getHiddenConversationIds(SENDER, [directConv]);
      expect(hidden.size).toBe(0);
      expect(Participant.findAll).not.toHaveBeenCalled();
    });
  });

  describe('filterNotifiableRecipients (N2)', () => {
    it('drops a recipient whose suppression set contains the sender (block either way / recipient muted sender)', async () => {
      relationshipService.getSuppressedIds.mockImplementation(async (viewerId) =>
        (viewerId === OTHER ? [SENDER] : [])
      );

      const out = await contactPolicy.filterNotifiableRecipients(SENDER, [OTHER, 'cccc']);
      expect(out).toEqual(['cccc']);
    });

    it('keeps recipients with no relationship to the sender and excludes the sender itself', async () => {
      const out = await contactPolicy.filterNotifiableRecipients(SENDER, [SENDER, OTHER]);
      expect(out).toEqual([OTHER]);
    });

    it('FAIL-CLOSED: a failed lookup drops that recipient, never throws', async () => {
      relationshipService.getSuppressedIds.mockImplementation(async (viewerId) => {
        if (viewerId === OTHER) throw new Error('boom');
        return [];
      });

      const out = await contactPolicy.filterNotifiableRecipients(SENDER, [OTHER, 'cccc']);
      expect(out).toEqual(['cccc']);
    });
  });
});
