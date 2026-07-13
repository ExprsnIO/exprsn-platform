/**
 * FEAT-033 — Public org-signup policy gate (fail-closed) + verify-before-provision.
 *
 * The provisioning engine spans CA/nexus/spark, so we mock it to isolate the
 * FEAT-033 composition layer. These cases assert the ORDER guarantees:
 *   - enabled + verify off  → 201, user created, engine called once
 *   - disabled              → 403 REGISTRATION_DISABLED, NO user, engine NOT called
 *   - enabled + verify on    → 202, user unverified, engine NOT called (runs on verify)
 *   - no platform org        → GET /signup-policy returns fail-closed defaults
 */

const request = require('supertest');

// Isolate the single provisioning engine (spans CA/nexus/spark).
jest.mock('../../../src/provisioning/engine', () => ({
  provisionOrganization: jest.fn()
}));

const engine = require('../../../src/provisioning/engine');
const app = require('../src/app');
const {
  setupTestDatabase,
  teardownTestDatabase,
  clearDatabase,
  createTestOrganization,
  getModels
} = require('./helpers/testDatabase');

const VALID_PASSWORD = 'Sup3rSecret!1';

describe('FEAT-033 signup policy', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
    // jest resetMocks:true wipes the impl before each test — set it here.
    engine.provisionOrganization.mockResolvedValue({ status: 'completed', organizationId: 'org-1' });
  });

  async function seedPlatformOrg(settings) {
    return createTestOrganization({ slug: 'platform', name: 'Platform', settings });
  }

  describe('GET /api/auth/signup-policy', () => {
    test('returns fail-closed defaults when no platform org exists', async () => {
      const res = await request(app).get('/api/auth/signup-policy').expect(200);
      expect(res.body).toEqual({
        allowUserRegistration: false,
        requireEmailVerification: true
      });
    });

    test('reflects the platform org settings when present', async () => {
      await seedPlatformOrg({ allowUserRegistration: true, requireEmailVerification: false });
      const res = await request(app).get('/api/auth/signup-policy').expect(200);
      expect(res.body).toEqual({
        allowUserRegistration: true,
        requireEmailVerification: false
      });
    });
  });

  describe('POST /api/auth/signup', () => {
    test('enabled + verify off → 201, user created, engine called once', async () => {
      await seedPlatformOrg({ allowUserRegistration: true, requireEmailVerification: false });

      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          email: 'founder@acme.io',
          password: VALID_PASSWORD,
          org: { name: 'Acme', type: 'team' }
        })
        .expect(201);

      expect(res.body.user).toBeDefined();
      expect(res.body.token).toBeDefined();
      expect(res.body.organization).toMatchObject({ id: 'org-1', type: 'team' });

      const { User } = getModels();
      const user = await User.findOne({ where: { email: 'founder@acme.io' } });
      expect(user).not.toBeNull();

      expect(engine.provisionOrganization).toHaveBeenCalledTimes(1);
    });

    test('disabled → 403 REGISTRATION_DISABLED, no user row, engine NOT called', async () => {
      await seedPlatformOrg({ allowUserRegistration: false, requireEmailVerification: false });

      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          email: 'blocked@acme.io',
          password: VALID_PASSWORD,
          org: { name: 'Acme', type: 'team' }
        })
        .expect(403);

      // AppError uses `errorCode` (surfaced by the error handler as `error`).
      expect(res.body.error || res.body.code).toBe('REGISTRATION_DISABLED');

      const { User } = getModels();
      const user = await User.findOne({ where: { email: 'blocked@acme.io' } });
      expect(user).toBeNull(); // fail-closed gate runs BEFORE any write

      expect(engine.provisionOrganization).not.toHaveBeenCalled();
    });

    test('no platform org → fail-closed → 403, no user, engine NOT called', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          email: 'nobody@acme.io',
          password: VALID_PASSWORD,
          org: { name: 'Acme', type: 'team' }
        })
        .expect(403);

      expect(res.body.error || res.body.code).toBe('REGISTRATION_DISABLED');
      const { User } = getModels();
      expect(await User.findOne({ where: { email: 'nobody@acme.io' } })).toBeNull();
      expect(engine.provisionOrganization).not.toHaveBeenCalled();
    });

    test('enabled + verify on → 202, user unverified, engine NOT called at signup', async () => {
      await seedPlatformOrg({ allowUserRegistration: true, requireEmailVerification: true });

      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          email: 'verify@acme.io',
          password: VALID_PASSWORD,
          org: { name: 'Acme', type: 'team', slug: 'acme-verify' }
        })
        .expect(202);

      expect(res.body.token).toBeUndefined(); // no session on the verify path
      // SECURITY (regression): the verification token must NEVER be returned to
      // the caller — it may only leave via the verification email. If it leaked
      // here, the signer could self-verify without controlling the mailbox and
      // defeat verify-before-provision entirely.
      expect(res.body.user).toBeDefined();
      expect(res.body.user.emailVerificationToken).toBeUndefined();
      expect(res.body.user.metadata && res.body.user.metadata.pendingOrg).toBeUndefined();

      const { User } = getModels();
      const user = await User.findOne({ where: { email: 'verify@acme.io' } });
      expect(user).not.toBeNull();
      expect(user.emailVerified).toBe(false);
      // ...but the token IS persisted server-side (just never sent to the client).
      expect(user.emailVerificationToken).toBeTruthy();
      // Org intent stashed for the verify-email path to provision.
      expect(user.metadata && user.metadata.pendingOrg).toMatchObject({ name: 'Acme', type: 'team' });

      expect(engine.provisionOrganization).not.toHaveBeenCalled();
    });

    test('SECURITY — two owners signing up the same org name get DISTINCT owner-scoped idempotency keys', async () => {
      await seedPlatformOrg({ allowUserRegistration: true, requireEmailVerification: false });
      engine.provisionOrganization.mockResolvedValue({ status: 'completed', organizationId: 'org-x' });

      await request(app).post('/api/auth/signup').send({
        email: 'ownera@acme.io', password: VALID_PASSWORD, org: { name: 'Shared Name', type: 'team' }
      }).expect(201);
      await request(app).post('/api/auth/signup').send({
        email: 'ownerb@acme.io', password: VALID_PASSWORD, org: { name: 'Shared Name', type: 'team' }
      }).expect(201);

      expect(engine.provisionOrganization).toHaveBeenCalledTimes(2);
      const keyA = engine.provisionOrganization.mock.calls[0][0].idempotencyKey;
      const keyB = engine.provisionOrganization.mock.calls[1][0].idempotencyKey;
      // Same slug prefix, but namespaced by the (distinct) owner user id → distinct
      // keys, so owner B can never short-circuit into owner A's completed run.
      expect(keyA).not.toBe(keyB);
      expect(keyA.startsWith('shared-name:')).toBe(true);
      expect(keyB.startsWith('shared-name:')).toBe(true);
    });

    test('verify-email completes provisioning for a pending-org signup (engine called once, intent cleared)', async () => {
      await seedPlatformOrg({ allowUserRegistration: true, requireEmailVerification: true });

      await request(app)
        .post('/api/auth/signup')
        .send({
          email: 'pending@acme.io',
          password: VALID_PASSWORD,
          org: { name: 'Pending Co', type: 'team' }
        })
        .expect(202);

      expect(engine.provisionOrganization).not.toHaveBeenCalled();

      const { User } = getModels();
      const user = await User.findOne({ where: { email: 'pending@acme.io' } });
      const token = user.emailVerificationToken;
      expect(token).toBeTruthy();

      const res = await request(app)
        .post('/api/auth/verify-email')
        .send({ token })
        .expect(200);

      expect(engine.provisionOrganization).toHaveBeenCalledTimes(1);
      expect(res.body.organization).toMatchObject({ id: 'org-1', type: 'team' });

      const reloaded = await User.findByPk(user.id);
      expect(reloaded.emailVerified).toBe(true);
      expect(reloaded.metadata && reloaded.metadata.pendingOrg).toBeUndefined();
    });

    test('rejects an unknown org type (validation)', async () => {
      await seedPlatformOrg({ allowUserRegistration: true, requireEmailVerification: false });

      await request(app)
        .post('/api/auth/signup')
        .send({
          email: 'badtype@acme.io',
          password: VALID_PASSWORD,
          org: { name: 'Acme', type: 'megacorp' }
        })
        .expect(400);

      expect(engine.provisionOrganization).not.toHaveBeenCalled();
    });
  });
});
