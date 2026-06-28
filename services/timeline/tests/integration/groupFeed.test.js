/**
 * ═══════════════════════════════════════════════════════════
 * Group Feed API Integration Tests
 * GET /api/timeline/group/:groupId + membership guard behavior.
 * Models, auth, and the shared group-membership guard are mocked.
 * ═══════════════════════════════════════════════════════════
 */

// Dummy key so @exprsn/shared's stripeService can construct at require time
// (it throws "Neither apiKey nor config.authenticator provided" otherwise).
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const request = require('supertest');

// Mutable group-membership guard implementation, swapped per-test. Prefixed
// `mock` so jest allows it inside the hoisted jest.mock factory.
let mockGroupGuard;

// Mock the shared package but keep everything real except requireGroupMembership.
jest.mock('@exprsn/shared', () => {
  const actual = jest.requireActual('@exprsn/shared');
  return {
    ...actual,
    requireGroupMembership: () => (req, res, next) => mockGroupGuard(req, res, next)
  };
});

// Mock auth middleware to inject a test user, keeping the rest real
// (jobs.js etc. rely on requireAdmin and others at load time).
jest.mock('../../src/middleware/auth', () => {
  const actual = jest.requireActual('../../src/middleware/auth');
  const inject = () => (req, res, next) => { req.userId = 'test-user-123'; next(); };
  return {
    ...actual,
    requireToken: inject,
    optionalToken: inject,
    requireWrite: inject
  };
});

// Mock models.
jest.mock('../../src/models');

const { app } = require('../../src/index');
const { Post } = require('../../src/models');
const { createPosts } = require('../fixtures/factories');

const GROUP_ID = '11111111-1111-1111-1111-111111111111';

describe('GET /api/timeline/group/:groupId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: membership granted.
    mockGroupGuard = (req, res, next) => {
      req.groupMembership = { isMember: true, role: 'member', visibility: 'private', joinMode: 'request' };
      next();
    };
  });

  it('returns the group feed for a member (offset pagination)', async () => {
    const posts = createPosts(5).map(p => ({ ...p, groupId: GROUP_ID }));
    Post.findAll.mockResolvedValue(posts);

    const response = await request(app)
      .get(`/api/timeline/group/${GROUP_ID}`)
      .query({ page: 1, limit: 20 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.groupId).toBe(GROUP_ID);
    expect(response.body.posts).toHaveLength(5);
    expect(response.body.pagination.page).toBe(1);

    // Query is scoped to the group and excludes deleted posts.
    const callArgs = Post.findAll.mock.calls[0][0];
    expect(callArgs.where).toMatchObject({ groupId: GROUP_ID, deleted: false });
  });

  it('rejects a non-member with 403 from the membership guard', async () => {
    mockGroupGuard = (req, res) => {
      res.status(403).json({ success: false, error: 'NOT_GROUP_MEMBER' });
    };

    const response = await request(app)
      .get(`/api/timeline/group/${GROUP_ID}`)
      .query({ limit: 20 });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('NOT_GROUP_MEMBER');
    // Guard short-circuits before any DB query.
    expect(Post.findAll).not.toHaveBeenCalled();
  });
});
