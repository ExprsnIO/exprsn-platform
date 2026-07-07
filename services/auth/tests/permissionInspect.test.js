/**
 * Permission Inspect Tests (BUG-005)
 *
 * GET /api/roles/users/:userId/permissions and POST /api/roles/check-permission
 * previously trusted the target userId (route param / body field) outright, so
 * any authenticated user could inspect another user's resolved permissions
 * (info disclosure). These endpoints are now gated self-or-admin.
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../src/app');
const {
  setupTestDatabase,
  teardownTestDatabase,
  clearDatabase,
  createTestUser
} = require('./helpers/testDatabase');

describe('Permission inspection (self-or-admin)', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
    jest.clearAllMocks();
  });

  async function login(email, password = 'Test123!@#') {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email, password }).expect(200);
    return agent;
  }

  describe('GET /api/roles/users/:userId/permissions', () => {
    test('a user can view their own resolved permissions', async () => {
      const user = await createTestUser({
        email: 'self-perms@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });
      const agent = await login('self-perms@example.com');

      const res = await agent
        .get(`/api/roles/users/${user.id}/permissions`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.userId).toBe(user.id);
    });

    test('a non-admin cannot read another user\'s permissions', async () => {
      const viewer = await createTestUser({
        email: 'viewer@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });
      const target = await createTestUser({
        email: 'target@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });
      const agent = await login('viewer@example.com');

      const res = await agent
        .get(`/api/roles/users/${target.id}/permissions`)
        .expect(403);

      expect(res.body.error).toBe('FORBIDDEN');
      // never reached the resolver / leaked the target's data
      expect(res.body.userId).toBeUndefined();
      expect(res.body.permissions).toBeUndefined();
      void viewer;
    });

    test('a platform admin (email allowlist) can read another user\'s permissions', async () => {
      // Default PLATFORM_ADMIN_EMAILS allowlist (unset in test env) is
      // 'tester@exprsn.io' — see shared/utils/platformAdmin.js.
      await createTestUser({
        email: 'tester@exprsn.io',
        password: await bcrypt.hash('Test123!@#', 12)
      });
      const target = await createTestUser({
        email: 'target2@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });
      const agent = await login('tester@exprsn.io');

      const res = await agent
        .get(`/api/roles/users/${target.id}/permissions`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.userId).toBe(target.id);
    });
  });

  describe('POST /api/roles/check-permission', () => {
    test('a user can check their own permission (userId defaults to self)', async () => {
      const user = await createTestUser({
        email: 'self-check@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });
      const agent = await login('self-check@example.com');

      const res = await agent
        .post('/api/roles/check-permission')
        .send({ permission: 'org:read' })
        .expect(200);

      expect(res.body.success).toBe(true);
      void user;
    });

    test('a non-admin cannot check another user\'s permission by passing userId in the body', async () => {
      await createTestUser({
        email: 'checker@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });
      const target = await createTestUser({
        email: 'checktarget@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });
      const agent = await login('checker@example.com');

      const res = await agent
        .post('/api/roles/check-permission')
        .send({ userId: target.id, permission: 'org:read' })
        .expect(403);

      expect(res.body.error).toBe('FORBIDDEN');
      expect(res.body.allowed).toBeUndefined();
    });

    test('a platform admin can check another user\'s permission', async () => {
      await createTestUser({
        email: 'tester@exprsn.io',
        password: await bcrypt.hash('Test123!@#', 12)
      });
      const target = await createTestUser({
        email: 'checktarget2@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });
      const agent = await login('tester@exprsn.io');

      const res = await agent
        .post('/api/roles/check-permission')
        .send({ userId: target.id, permission: 'org:read' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('Authentication required', () => {
    test('unauthenticated GET is rejected before reaching the self-or-admin check', async () => {
      const target = await createTestUser({
        email: 'unauth-target@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const res = await request(app)
        .get(`/api/roles/users/${target.id}/permissions`)
        .expect(401);

      expect(res.body.error).toBe('NOT_AUTHENTICATED');
    });
  });
});
