/**
 * FEAT-070 — REST-path block enforcement (DB-free, supertest).
 *
 * Covers the acceptance-criteria REST surfaces:
 *   - POST /api/conversations             (S1 create-direct → 403; group exempt)
 *   - POST /api/conversations/:id/participants (S3 → 403)
 *   - GET  /api/conversations             (S4 frozen 1:1 hidden)
 *   - GET  /api/messages/:conversationId  (S5 suppressed-sender filter)
 *   - GET  /api/messages/:conversationId/search (TASK-060 — S5 extended to search)
 *   - GET  /api/:id/thread                (TASK-060 — S5 extended to enhanced thread-read)
 *   - POST /api/messages/:id/reply        (S2 continue-a-DM → 403)
 *   - POST /api/messages/:id/forward      (S2 frozen target skipped)
 * plus the no-leak assertion: no 403/skip response ever says "block".
 */

jest.mock('../../src/models', () => ({
  Message: { create: jest.fn(), findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn() },
  Conversation: { create: jest.fn(), findByPk: jest.fn(), update: jest.fn() },
  Participant: { create: jest.fn(), findOne: jest.fn(), findAll: jest.fn(), count: jest.fn() },
  Reaction: {}
}));

jest.mock('../../src/services/messageModeration', () => ({
  moderateMessage: jest.fn()
}));

// Auth: stamp the caller from a test header, keep everything else out of scope.
jest.mock('../../src/middleware/auth', () => ({
  validateCAToken: (req, res, next) => {
    req.user = { id: req.headers['x-user-id'] || 'u1' };
    req.userId = req.user.id;
    next();
  },
  optionalAuth: (req, res, next) => next(),
  requireAuth: (req, res, next) => {
    req.user = { id: req.headers['x-user-id'] || 'u1' };
    req.userId = req.user.id;
    next();
  }
}));

jest.mock('@exprsn/shared', () => {
  const actual = jest.requireActual('@exprsn/shared');
  return {
    ...actual,
    validateCAToken: () => (req, res, next) => {
      req.userId = req.headers['x-user-id'] || 'u1';
      next();
    }
  };
});

jest.mock('../../../timeline/src/services/relationshipService', () => ({
  getSuppressedIds: jest.fn(),
  getBlockedIds: jest.fn(),
  getBlockedByIds: jest.fn(),
  isBlockedEitherWay: jest.fn(),
  canContact: jest.fn()
}));

const express = require('express');
const request = require('supertest');
const { Op } = require('sequelize');
const { errorHandler } = require('@exprsn/shared');
const { Message, Conversation, Participant } = require('../../src/models');
const relationshipService = require('../../../timeline/src/services/relationshipService');

const SENDER = 'aaaaaaaa-0000-0000-0000-000000000001';
const OTHER = 'bbbbbbbb-0000-0000-0000-000000000002';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/conversations', require('../../src/routes/conversations'));
  app.use('/api/messages', require('../../src/routes/messages'));
  app.use('/api', require('../../src/routes/enhanced'));
  app.use(errorHandler);
  return app;
}

/** No response on a guarded surface may reveal the block relationship. */
function expectNoBlockOracle(res) {
  expect(JSON.stringify(res.body)).not.toMatch(/block/i);
}

describe('FEAT-070 REST enforcement', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
    relationshipService.isBlockedEitherWay.mockResolvedValue(false);
    relationshipService.getSuppressedIds.mockResolvedValue([]);
    Message.create.mockResolvedValue({ id: 'm-new' });
    Message.findAll.mockResolvedValue([]);
    Conversation.create.mockResolvedValue({ id: 'c-new' });
    Conversation.findByPk.mockResolvedValue({ id: 'c1', type: 'direct', groupId: null });
    Participant.create.mockResolvedValue({});
    Participant.findOne.mockResolvedValue({ userId: SENDER, active: true, role: 'owner' });
    Participant.findAll.mockResolvedValue([
      { userId: SENDER, active: true },
      { userId: OTHER, active: true }
    ]);
  });

  describe('POST /api/conversations (S1)', () => {
    it('403s a direct conversation with a blocked pair — on the create AND reuse path', async () => {
      relationshipService.isBlockedEitherWay.mockResolvedValue(true);

      const res = await request(app)
        .post('/api/conversations')
        .set('x-user-id', SENDER)
        .send({ type: 'direct', participantIds: [OTHER] });

      expect(res.status).toBe(403);
      expect(res.body.message).toBe('You cannot interact with this user');
      expectNoBlockOracle(res);
      expect(Conversation.create).not.toHaveBeenCalled();
    });

    it('creates a group conversation regardless of relationships (ADR §3 exemption)', async () => {
      relationshipService.isBlockedEitherWay.mockResolvedValue(true);

      const res = await request(app)
        .post('/api/conversations')
        .set('x-user-id', SENDER)
        .send({ type: 'group', name: 'g', participantIds: [OTHER] });

      expect(res.status).toBe(201);
      expect(relationshipService.isBlockedEitherWay).not.toHaveBeenCalled();
    });

    it('creates a direct conversation normally when not blocked', async () => {
      Participant.findAll.mockResolvedValue([]); // no prior conversations
      const res = await request(app)
        .post('/api/conversations')
        .set('x-user-id', SENDER)
        .send({ type: 'direct', participantIds: [OTHER] });

      expect(res.status).toBe(201);
    });
  });

  describe('POST /api/conversations/:id/participants (S3)', () => {
    it('403s adding a user the adder is in a blocked pair with', async () => {
      relationshipService.isBlockedEitherWay.mockResolvedValue(true);
      Participant.findOne
        .mockResolvedValueOnce({ userId: SENDER, role: 'owner', active: true }) // requester
        .mockResolvedValueOnce(null); // not already a participant

      const res = await request(app)
        .post('/api/conversations/c1/participants')
        .set('x-user-id', SENDER)
        .send({ userId: OTHER });

      expect(res.status).toBe(403);
      expectNoBlockOracle(res);
      expect(Participant.create).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/conversations (S4)', () => {
    it('hides a frozen direct 1:1 from the list', async () => {
      const frozen = {
        id: 'c-frozen', type: 'direct', groupId: null,
        toJSON: () => ({ id: 'c-frozen', type: 'direct' })
      };
      const healthy = {
        id: 'c-ok', type: 'group', groupId: null,
        toJSON: () => ({ id: 'c-ok', type: 'group' })
      };
      Participant.findAll
        .mockResolvedValueOnce([
          { conversation: frozen, role: 'member' },
          { conversation: healthy, role: 'member' }
        ]) // list query
        .mockResolvedValueOnce([{ conversationId: 'c-frozen' }]); // counterpart lookup
      relationshipService.getSuppressedIds.mockResolvedValue([OTHER]);

      const res = await request(app)
        .get('/api/conversations')
        .set('x-user-id', SENDER);

      expect(res.status).toBe(200);
      expect(res.body.conversations.map((c) => c.id)).toEqual(['c-ok']);
    });
  });

  describe('GET /api/messages/:conversationId (S5)', () => {
    it('filters suppressed senders with [Op.notIn]', async () => {
      relationshipService.getSuppressedIds.mockResolvedValue([OTHER]);

      const res = await request(app)
        .get('/api/messages/c1')
        .set('x-user-id', SENDER);

      expect(res.status).toBe(200);
      const where = Message.findAll.mock.calls[0][0].where;
      expect(where.senderId[Op.notIn]).toEqual([OTHER]);
    });

    it('404s a single message from a suppressed sender (no oracle)', async () => {
      relationshipService.getSuppressedIds.mockResolvedValue([OTHER]);
      Message.findOne.mockResolvedValue({ id: 'm1', senderId: OTHER });

      const res = await request(app)
        .get('/api/messages/c1/m1')
        .set('x-user-id', SENDER);

      expect(res.status).toBe(404);
      expectNoBlockOracle(res);
    });
  });

  describe('GET /api/messages/:conversationId/search (TASK-060)', () => {
    it('filters suppressed senders with [Op.notIn]', async () => {
      relationshipService.getSuppressedIds.mockResolvedValue([OTHER]);

      const res = await request(app)
        .get('/api/messages/c1/search')
        .query({ q: 'hello' })
        .set('x-user-id', SENDER);

      expect(res.status).toBe(200);
      const where = Message.findAll.mock.calls[0][0].where;
      expect(where.senderId[Op.notIn]).toEqual([OTHER]);
    });

    it('does not filter by senderId when nothing is suppressed', async () => {
      relationshipService.getSuppressedIds.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/messages/c1/search')
        .query({ q: 'hello' })
        .set('x-user-id', SENDER);

      expect(res.status).toBe(200);
      const where = Message.findAll.mock.calls[0][0].where;
      expect(where.senderId).toBeUndefined();
    });
  });

  describe('GET /api/:id/thread (TASK-060 — enhanced thread-read)', () => {
    it('404s a thread rooted on a suppressed sender (no oracle)', async () => {
      relationshipService.getSuppressedIds.mockResolvedValue([OTHER]);
      Message.findByPk.mockResolvedValue({
        id: 'm1', conversationId: 'c1', senderId: OTHER, replyCount: 0
      });

      const res = await request(app)
        .get('/api/m1/thread')
        .set('x-user-id', SENDER);

      expect(res.status).toBe(404);
      expectNoBlockOracle(res);
    });

    it('filters replies from a suppressed sender with [Op.notIn]', async () => {
      relationshipService.getSuppressedIds.mockResolvedValue([OTHER]);
      Message.findByPk.mockResolvedValue({
        id: 'm1', conversationId: 'c1', senderId: SENDER, replyCount: 2
      });

      const res = await request(app)
        .get('/api/m1/thread')
        .set('x-user-id', SENDER);

      expect(res.status).toBe(200);
      const where = Message.findAll.mock.calls[0][0].where;
      expect(where.senderId[Op.notIn]).toEqual([OTHER]);
    });
  });

  describe('POST /api/messages/:id/reply (S2 — continue a DM)', () => {
    it('403s a reply into a frozen direct 1:1 and never creates the message', async () => {
      relationshipService.isBlockedEitherWay.mockResolvedValue(true);
      Message.findByPk.mockResolvedValue({ id: 'm1', conversationId: 'c1', threadId: null });

      const res = await request(app)
        .post('/api/m1/reply')
        .set('x-user-id', SENDER)
        .send({ content: 'hi' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('You cannot send messages to this conversation');
      expectNoBlockOracle(res);
      expect(Message.create).not.toHaveBeenCalled();
    });

    it('FAIL-CLOSED: façade failure → generic 500, message never created', async () => {
      relationshipService.isBlockedEitherWay.mockRejectedValue(new Error('timeline down'));
      Message.findByPk.mockResolvedValue({ id: 'm1', conversationId: 'c1', threadId: null });

      const res = await request(app)
        .post('/api/m1/reply')
        .set('x-user-id', SENDER)
        .send({ content: 'hi' });

      expect(res.status).toBe(500);
      expectNoBlockOracle(res);
      expect(Message.create).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/messages/:id/forward (S2 — forward site)', () => {
    it('skips a frozen direct target (forwardedCount 0, no oracle)', async () => {
      relationshipService.isBlockedEitherWay.mockResolvedValue(true);
      Message.findByPk.mockResolvedValue({
        id: 'm1', conversationId: 'c-src', content: 'x', contentType: 'text',
        attachments: [], metadata: {}, senderId: OTHER
      });

      const res = await request(app)
        .post('/api/m1/forward')
        .set('x-user-id', SENDER)
        .send({ conversationIds: ['c1'] });

      expect(res.status).toBe(200);
      expect(res.body.forwardedCount).toBe(0);
      expectNoBlockOracle(res);
      expect(Message.create).not.toHaveBeenCalled();
    });

    it('forwards normally when the target is not frozen', async () => {
      Message.findByPk.mockResolvedValue({
        id: 'm1', conversationId: 'c-src', content: 'x', contentType: 'text',
        attachments: [], metadata: {}, senderId: OTHER
      });

      const res = await request(app)
        .post('/api/m1/forward')
        .set('x-user-id', SENDER)
        .send({ conversationIds: ['c1'] });

      expect(res.status).toBe(200);
      expect(res.body.forwardedCount).toBe(1);
    });
  });
});
