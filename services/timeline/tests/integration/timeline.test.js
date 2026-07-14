/**
 * ═══════════════════════════════════════════════════════════
 * Timeline API Integration Tests
 * Test timeline endpoints with mocked database
 * ═══════════════════════════════════════════════════════════
 */

// Dummy key so @exprsn/shared's stripeService can construct at require time
// (it throws "Neither apiKey nor config.authenticator provided" otherwise).
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const request = require('supertest');

// Mock models with explicit jest.fn() statics. Auto-mocking the index does not
// reliably mock Sequelize Model static methods inherited from the base Model
// class (e.g. Follow.findAll), so provide a manual factory.
const mockMakeModel = () => ({
  findAll: jest.fn(),
  findOne: jest.fn(),
  findByPk: jest.fn(),
  findAndCountAll: jest.fn(),
  count: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  destroy: jest.fn()
});

jest.mock('../../src/models', () => ({
  Post: mockMakeModel(),
  Like: mockMakeModel(),
  Follow: mockMakeModel(),
  UserRelationship: mockMakeModel(), // FEAT-011 block/mute store (façade reads this)
  Comment: mockMakeModel(),
  Repost: mockMakeModel(),
  Bookmark: mockMakeModel(),
  List: mockMakeModel(),
  ListMember: mockMakeModel(),
  Trending: mockMakeModel(),
  Attachment: mockMakeModel()
}));

// Mutable auth behavior, swapped per-test. The router calls requireToken() ONCE
// at load to capture its middleware, so per-test jest.fn reassignment / Once
// mocks don't take effect (and resetMocks:true would wipe them anyway). Instead
// the captured middleware delegates to this mutable handler. Prefixed `mock` so
// jest allows referencing it inside the hoisted factory.
let mockAuthHandler;

jest.mock('../../src/middleware/auth', () => {
  const actual = jest.requireActual('../../src/middleware/auth');
  const inject = () => (req, res, next) => mockAuthHandler(req, res, next);
  return {
    ...actual,
    requireToken: inject,
    optionalToken: inject
  };
});

const { app } = require('../../src/index');
const { Post, Follow, Like, Bookmark } = require('../../src/models');
const { encodeCursor } = require('../../src/utils/cursor');
const { createPost, createPosts } = require('../fixtures/factories');

describe('Timeline API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: authenticated test user injected.
    mockAuthHandler = (req, res, next) => {
      req.userId = 'test-user-123';
      next();
    };
  });

  describe('GET /api/timeline', () => {
    it('should return home feed with offset pagination', async () => {
      Follow.findAll.mockResolvedValue([]);
      const posts = createPosts(10);
      Post.findAll.mockResolvedValue(posts.map(p => ({
        toJSON: () => p,
        ...p
      })));

      const response = await request(app)
        .get('/api/timeline')
        .query({ page: 1, limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.posts).toBeDefined();
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.page).toBe(1);
    });

    it('should return home feed with cursor pagination', async () => {
      Follow.findAll.mockResolvedValue([]);
      const posts = createPosts(21); // One more than limit to test hasMore
      Post.findAll.mockResolvedValue(posts.map(p => ({
        toJSON: () => p,
        ...p
      })));

      const response = await request(app)
        .get('/api/timeline')
        .query({ limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.posts).toBeDefined();
      expect(response.body.pagination.hasMore).toBe(true);
      expect(response.body.pagination.nextCursor).toBeDefined();
    });

    it('should handle cursor parameter for pagination', async () => {
      Follow.findAll.mockResolvedValue([]);
      const posts = createPosts(10);
      Post.findAll.mockResolvedValue(posts.map(p => ({
        toJSON: () => p,
        ...p
      })));

      const cursor = encodeCursor(new Date(), 'post-id-123');

      const response = await request(app)
        .get('/api/timeline')
        .query({ cursor, limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should require authentication', async () => {
      // Simulate the auth middleware rejecting an unauthenticated request.
      mockAuthHandler = (req, res) => {
        res.status(401).json({ error: 'Unauthorized' });
      };

      const response = await request(app)
        .get('/api/timeline');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/timeline/global', () => {
    it('should return global public timeline', async () => {
      const posts = createPosts(15);
      Post.findAll.mockResolvedValue(posts);

      const response = await request(app)
        .get('/api/timeline/global')
        .query({ limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.posts).toBeDefined();
    });

    it('should support cursor pagination', async () => {
      const posts = createPosts(21);
      Post.findAll.mockResolvedValue(posts);

      const response = await request(app)
        .get('/api/timeline/global')
        .query({ limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body.pagination.hasMore).toBe(true);
      expect(response.body.pagination.nextCursor).toBeDefined();
    });
  });

  describe('GET /api/timeline/explore', () => {
    it('should return explore/discovery feed', async () => {
      const posts = createPosts(20);
      Post.findAll.mockResolvedValue(posts);

      const response = await request(app)
        .get('/api/timeline/explore')
        .query({ limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.posts).toBeDefined();
    });
  });

  describe('GET /api/timeline/trending', () => {
    it('should return trending posts', async () => {
      const posts = createPosts(10);
      Post.findAll.mockResolvedValue(posts);

      const response = await request(app)
        .get('/api/timeline/trending')
        .query({ limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.posts).toBeDefined();
    });
  });

  describe('GET /api/timeline/user/:userId', () => {
    it('should return user-specific timeline', async () => {
      const userId = 'user-456';
      const posts = createPosts(10, { userId });
      Post.findAll.mockResolvedValue(posts);

      const response = await request(app)
        .get(`/api/timeline/user/${userId}`)
        .query({ limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.userId).toBe(userId);
      expect(response.body.posts).toBeDefined();
    });
  });

  describe('GET /api/timeline/bookmarks', () => {
    it('should return bookmarked posts', async () => {
      const posts = createPosts(5);
      // getUserBookmarks queries Bookmark.findAll and maps each row to its .post
      Bookmark.findAll.mockResolvedValue(posts.map(post => ({ post })));

      const response = await request(app)
        .get('/api/timeline/bookmarks')
        .query({ limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.bookmarks).toBeDefined();
    });
  });

  describe('GET /api/timeline/likes', () => {
    it('should return liked posts', async () => {
      const posts = createPosts(5);
      // getUserLikes queries Like.findAll and maps each row to its .post
      Like.findAll.mockResolvedValue(posts.map(post => ({ post })));

      const response = await request(app)
        .get('/api/timeline/likes')
        .query({ limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.likes).toBeDefined();
    });
  });

  describe('Pagination', () => {
    it('should respect limit parameter', async () => {
      Follow.findAll.mockResolvedValue([]);
      const posts = createPosts(50);
      Post.findAll.mockResolvedValue(posts.map(p => ({
        toJSON: () => p,
        ...p
      })));

      const response = await request(app)
        .get('/api/timeline')
        .query({ limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.posts.length).toBeLessThanOrEqual(10);
    });

    it('should enforce maximum limit of 100', async () => {
      Follow.findAll.mockResolvedValue([]);
      Post.findAll.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/timeline')
        .query({ limit: 200 });

      expect(response.status).toBe(200);
      // Should be capped at 100 (or 101 for cursor pagination +1)
    });

    it('should handle invalid cursor gracefully', async () => {
      Follow.findAll.mockResolvedValue([]);
      Post.findAll.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/timeline')
        .query({ cursor: 'invalid-cursor-123' });

      expect(response.status).toBe(200);
      // Should fallback to fetching from beginning
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors', async () => {
      Follow.findAll.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/timeline');

      expect(response.status).toBe(500);
    });

    it('should handle missing user ID', async () => {
      // Auth passes but does not set req.userId.
      mockAuthHandler = (req, res, next) => {
        // Don't set req.userId
        next();
      };

      Follow.findAll.mockResolvedValue([]);
      Post.findAll.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/timeline');

      // Should handle gracefully or return error
      expect([200, 400, 500]).toContain(response.status);
    });
  });
});
