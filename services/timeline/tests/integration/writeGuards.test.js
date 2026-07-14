/**
 * ═══════════════════════════════════════════════════════════
 * FEAT-011 write-path contact rejection (W1 like, W2 comment, W4 follow)
 * A blocked user (either direction) is rejected with 403 before the mutation.
 * Models, auth, and the relationship façade are mocked; DB-free.
 * ═══════════════════════════════════════════════════════════
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const request = require('supertest');

const mockMakeModel = () => ({
  findAll: jest.fn(),
  findOne: jest.fn(),
  findByPk: jest.fn(),
  findOrCreate: jest.fn(),
  count: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  destroy: jest.fn()
});

jest.mock('../../src/models', () => ({
  Post: mockMakeModel(),
  Like: mockMakeModel(),
  Follow: mockMakeModel(),
  UserRelationship: mockMakeModel(),
  Comment: mockMakeModel(),
  Repost: mockMakeModel(),
  Bookmark: mockMakeModel(),
  List: mockMakeModel(),
  ListMember: mockMakeModel(),
  Trending: mockMakeModel(),
  Attachment: mockMakeModel()
}));

// Block/mute façade — the write-path primitive under test.
jest.mock('../../src/services/relationshipService', () => ({
  isBlockedEitherWay: jest.fn(),
  getSuppressedIds: jest.fn().mockResolvedValue([])
}));

// Auth: inject an authenticated user; every guard passes.
jest.mock('../../src/middleware/auth', () => {
  const actual = jest.requireActual('../../src/middleware/auth');
  const inject = () => (req, res, next) => { req.userId = 'viewer-1'; next(); };
  return {
    ...actual,
    requireToken: inject,
    optionalToken: inject,
    requireWrite: inject,
    requireUpdate: inject,
    requireDelete: inject,
    requireAdmin: inject
  };
});

const { app } = require('../../src/index');
const { Post, Follow, Like, Comment } = require('../../src/models');
const relationshipService = require('../../src/services/relationshipService');

const POST_ID = '11111111-1111-1111-1111-111111111111';
const AUTHOR = 'author-9';

describe('FEAT-011 write-path contact rejection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    relationshipService.getSuppressedIds.mockResolvedValue([]);
  });

  describe('W2 comment', () => {
    beforeEach(() => {
      Post.findOne.mockResolvedValue({ id: POST_ID, userId: AUTHOR, commentCount: 0, save: jest.fn() });
    });

    it('rejects with 403 when blocked either way', async () => {
      relationshipService.isBlockedEitherWay.mockResolvedValue(true);

      const res = await request(app)
        .post(`/api/posts/${POST_ID}/comments`)
        .send({ content: 'hi' });

      expect(res.status).toBe(403);
      expect(Comment.create).not.toHaveBeenCalled();
      expect(relationshipService.isBlockedEitherWay).toHaveBeenCalledWith('viewer-1', AUTHOR);
    });

    it('allows the comment when not blocked', async () => {
      relationshipService.isBlockedEitherWay.mockResolvedValue(false);
      Comment.create.mockResolvedValue({ id: 'c1', toJSON: () => ({ id: 'c1' }) });

      const res = await request(app)
        .post(`/api/posts/${POST_ID}/comments`)
        .send({ content: 'hi' });

      expect(res.status).toBe(201);
      expect(Comment.create).toHaveBeenCalled();
    });
  });

  describe('W1 like', () => {
    beforeEach(() => {
      Post.findOne.mockResolvedValue({ id: POST_ID, userId: AUTHOR, likeCount: 0, save: jest.fn() });
    });

    it('rejects with 403 when blocked either way', async () => {
      relationshipService.isBlockedEitherWay.mockResolvedValue(true);

      const res = await request(app).post(`/api/posts/${POST_ID}/like`).send({});

      expect(res.status).toBe(403);
      expect(Like.findOrCreate).not.toHaveBeenCalled();
    });
  });

  describe('W4 follow', () => {
    it('rejects with 403 when blocked either way', async () => {
      relationshipService.isBlockedEitherWay.mockResolvedValue(true);

      const res = await request(app).post(`/api/interactions/users/${AUTHOR}/follow`).send({});

      expect(res.status).toBe(403);
      expect(Follow.create).not.toHaveBeenCalled();
      expect(relationshipService.isBlockedEitherWay).toHaveBeenCalledWith('viewer-1', AUTHOR);
    });

    it('allows the follow when not blocked', async () => {
      relationshipService.isBlockedEitherWay.mockResolvedValue(false);
      Follow.findOne.mockResolvedValue(null);
      Follow.create.mockResolvedValue({ id: 'f1' });

      const res = await request(app).post(`/api/interactions/users/${AUTHOR}/follow`).send({});

      expect(res.status).toBe(201);
      expect(Follow.create).toHaveBeenCalled();
    });
  });

  // R15-shape: hashtag search is a public content-surfacing read path; a
  // blocked/muted author's post must not surface. One set-returning query,
  // applied as [Op.notIn] on the author id.
  describe('hashtag search suppression (R15-shape)', () => {
    const { Op } = require('sequelize');

    it('excludes suppressed authors via [Op.notIn]', async () => {
      relationshipService.getSuppressedIds.mockResolvedValue([AUTHOR]);
      Post.findAll.mockResolvedValue([]);

      const res = await request(app).get('/api/search/hashtags?q=coffee');

      expect(res.status).toBe(200);
      expect(relationshipService.getSuppressedIds).toHaveBeenCalledWith('viewer-1');
      const where = Post.findAll.mock.calls[0][0].where;
      expect(where.userId).toEqual({ [Op.notIn]: [AUTHOR] });
    });

    it('adds NO author filter when nothing is suppressed', async () => {
      relationshipService.getSuppressedIds.mockResolvedValue([]);
      Post.findAll.mockResolvedValue([]);

      const res = await request(app).get('/api/search/hashtags?q=coffee');

      expect(res.status).toBe(200);
      const where = Post.findAll.mock.calls[0][0].where;
      expect(where.userId).toBeUndefined();
    });
  });
});
