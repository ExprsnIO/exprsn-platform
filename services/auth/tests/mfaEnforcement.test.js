/**
 * Org 2FA enforcement at login (STATUS.md #12) — end-to-end against the real
 * auth app + live test Postgres (mirrors session.test.js). Proves the policy is
 * actually enforced: an un-enrolled member of a requiring org past grace is
 * hard-gated (session, no bearer), within grace gets a soft flag, the re-mint
 * path can't bypass it, and unaffiliated users log in normally.
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../src/app');
const {
  setupTestDatabase,
  teardownTestDatabase,
  clearDatabase,
  createTestUser,
  createTestOrganization,
  getModels,
} = require('./helpers/testDatabase');

const PW = 'Test123!@#';

/** Org settings block with MFA required + a specific grace window. */
function mfaSettings(graceDays, allowedMethods = ['totp', 'backup_codes']) {
  return {
    requireMfa: true,
    mfa: { allowedMethods, enrollmentGracePeriodDays: graceDays, rememberDeviceDays: 0 },
  };
}

/** Make a requiring org owned by a fresh owner user; return the org. */
async function requiringOrg(settings) {
  const owner = await createTestUser({ email: `owner-${Date.now()}-${Math.random()}@example.com`, password: await bcrypt.hash(PW, 12) });
  return createTestOrganization({ ownerId: owner.id, status: 'active', settings });
}

async function addMember(org, user, over = {}) {
  const models = getModels();
  return models.OrganizationMember.create({
    organizationId: org.id, userId: user.id, role: 'member', status: 'active', ...over,
  });
}

describe('Org 2FA enforcement at login', () => {
  beforeAll(async () => { await setupTestDatabase(); });
  afterAll(async () => { await teardownTestDatabase(); });
  beforeEach(async () => { await clearDatabase(); jest.clearAllMocks(); });

  test('un-affiliated user logs in normally (no MFA flag)', async () => {
    await createTestUser({ email: 'free@example.com', password: await bcrypt.hash(PW, 12) });
    const res = await request(app).post('/api/auth/login').send({ email: 'free@example.com', password: PW }).expect(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.mfaEnrollmentRequired).toBeUndefined();
  });

  test('member of a requiring org, grace elapsed → hard-gated (session, no bearer)', async () => {
    const org = await requiringOrg(mfaSettings(0)); // grace 0 → expired immediately
    const user = await createTestUser({ email: 'gated@example.com', password: await bcrypt.hash(PW, 12) });
    await addMember(org, user);

    const res = await request(app).post('/api/auth/login').send({ email: 'gated@example.com', password: PW }).expect(200);
    expect(res.body.mfaEnrollmentRequired).toBe(true);
    expect(res.body.enforced).toBe(true);
    expect(res.body.token).toBeUndefined();
    expect(res.body.allowedMethods).toContain('totp');
  });

  test('member within grace → login succeeds with a soft flag + bearer', async () => {
    const org = await requiringOrg(mfaSettings(3650)); // 10y grace → not expired
    const user = await createTestUser({ email: 'soft@example.com', password: await bcrypt.hash(PW, 12) });
    await addMember(org, user);

    const res = await request(app).post('/api/auth/login').send({ email: 'soft@example.com', password: PW }).expect(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.mfaEnrollmentRequired).toBe(true);
    expect(res.body.enforced).toBe(false);
  });

  test('OWNER of a requiring org is enforced too (ownership path)', async () => {
    const models = getModels();
    const owner = await createTestUser({ email: 'owner2@example.com', password: await bcrypt.hash(PW, 12) });
    await models.Organization.create({
      id: require('uuid').v4(), name: 'Owned Co', slug: `owned-${Date.now()}`,
      ownerId: owner.id, status: 'active', settings: mfaSettings(0),
    });
    const res = await request(app).post('/api/auth/login').send({ email: 'owner2@example.com', password: PW }).expect(200);
    expect(res.body.enforced).toBe(true);
    expect(res.body.token).toBeUndefined();
  });

  test('re-mint (POST /api/auth/token) cannot bypass the hard gate', async () => {
    const org = await requiringOrg(mfaSettings(0));
    const user = await createTestUser({ email: 'bypass@example.com', password: await bcrypt.hash(PW, 12) });
    await addMember(org, user);

    const agent = request.agent(app);
    // Hard-gated login establishes the session cookie (agent keeps it).
    await agent.post('/api/auth/login').send({ email: 'bypass@example.com', password: PW }).expect(200);
    // Attempting to swap the session for a bearer must be refused.
    const res = await agent.post('/api/auth/token').send({}).expect(403);
    expect(res.body.error).toBe('MFA_ENROLLMENT_REQUIRED');
  });

  test('inactive membership does not trigger enforcement', async () => {
    const org = await requiringOrg(mfaSettings(0));
    const user = await createTestUser({ email: 'inactive@example.com', password: await bcrypt.hash(PW, 12) });
    await addMember(org, user, { status: 'invited' }); // not active
    const res = await request(app).post('/api/auth/login').send({ email: 'inactive@example.com', password: PW }).expect(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.mfaEnrollmentRequired).toBeUndefined();
  });
});
