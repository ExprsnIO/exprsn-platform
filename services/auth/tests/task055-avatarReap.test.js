/**
 * TASK-055 — PUT /api/users/:id revokes the minted capability token (+ reaps
 * the superseded FileVault file) when the profile avatar is replaced or
 * removed, via the in-process FileVault façade
 * (filevault/src/services/displayImageService).
 *
 * `validateCAToken` is stubbed (same technique as
 * tests/provision-equivalence.test.js) so the route authenticates without a
 * live CA HTTP round-trip; DB access is real, against the isolated
 * exprsn_auth_test database (see CLAUDE.md).
 */

const request = require('supertest');

let mockCurrentUserId;

jest.mock('@exprsn/shared', () => {
  const actual = jest.requireActual('@exprsn/shared');
  const passthrough = (req, res, next) => next();
  return {
    ...actual,
    strictLimiter: passthrough,
    standardLimiter: passthrough,
    relaxedLimiter: passthrough,
    createRateLimiter: () => passthrough,
    validateCAToken: () => (req, res, next) => {
      req.userId = mockCurrentUserId;
      req.tokenData = { userId: mockCurrentUserId };
      req.permissions = ['read', 'update'];
      next();
    }
  };
});

const mockReapDisplayImage = jest.fn().mockResolvedValue(undefined);
jest.mock('../../filevault/src/services/displayImageService', () => ({
  reapDisplayImage: (...a) => mockReapDisplayImage(...a)
}));

const app = require('../src/app');
const {
  setupTestDatabase,
  teardownTestDatabase,
  clearDatabase,
  createTestUser
} = require('./helpers/testDatabase');

const OLD_AVATAR = '/filevault/api/share/file/old-avatar-file/download?token=tok-old';
const NEW_AVATAR = '/filevault/api/share/file/new-avatar-file/download?token=tok-new';

describe('TASK-055: avatar replace/remove reaps the superseded FileVault capability', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
    mockReapDisplayImage.mockClear();
  });

  test('replacing the avatar calls reapDisplayImage(old, new, userId)', async () => {
    const user = await createTestUser({ avatarUrl: OLD_AVATAR });
    mockCurrentUserId = user.id;

    await request(app)
      .put(`/api/users/${user.id}`)
      .send({ avatarUrl: NEW_AVATAR })
      .expect(200);

    expect(mockReapDisplayImage).toHaveBeenCalledWith(OLD_AVATAR, NEW_AVATAR, user.id);
  });

  test('removing the avatar (empty string) still reaps the old one', async () => {
    const user = await createTestUser({ avatarUrl: OLD_AVATAR });
    mockCurrentUserId = user.id;

    await request(app)
      .put(`/api/users/${user.id}`)
      .send({ avatarUrl: '' })
      .expect(200);

    expect(mockReapDisplayImage).toHaveBeenCalledWith(OLD_AVATAR, '', user.id);
  });

  test('updating unrelated fields (no avatarUrl in the body) never touches the façade', async () => {
    const user = await createTestUser({ avatarUrl: OLD_AVATAR });
    mockCurrentUserId = user.id;

    await request(app)
      .put(`/api/users/${user.id}`)
      .send({ bio: 'Updated bio' })
      .expect(200);

    expect(mockReapDisplayImage).not.toHaveBeenCalled();
  });
});
