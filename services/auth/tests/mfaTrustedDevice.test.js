/**
 * Trusted-device MFA skip (STATUS.md #12d) — end-to-end against the real auth
 * app + live test Postgres. Proves: an enrolled member of a requiring org with
 * rememberDeviceDays>0 is offered the opt-in; opting in drops a cookie; a later
 * login carrying that cookie skips the challenge; without it (or with the policy
 * off) the challenge still fires.
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const speakeasy = require('speakeasy');
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

function orgSettings(rememberDeviceDays) {
  return {
    requireMfa: true,
    mfa: { allowedMethods: ['totp', 'backup_codes'], enrollmentGracePeriodDays: 0, rememberDeviceDays },
  };
}

/** Create a requiring org (rememberDeviceDays) + an enrolled member with a TOTP secret. */
async function enrolledMemberInOrg(email, rememberDeviceDays) {
  const owner = await createTestUser({ email: `owner-${email}`, password: await bcrypt.hash(PW, 12) });
  const org = await createTestOrganization({ ownerId: owner.id, status: 'active', settings: orgSettings(rememberDeviceDays) });
  const secret = speakeasy.generateSecret().base32;
  const user = await createTestUser({ email, password: await bcrypt.hash(PW, 12), mfaEnabled: true, mfaSecret: secret });
  await getModels().OrganizationMember.create({ organizationId: org.id, userId: user.id, role: 'member', status: 'active' });
  return { user, secret };
}

const totp = (secret) => speakeasy.totp({ secret, encoding: 'base32' });

/** Pull the exprsn_td cookie string out of a Set-Cookie header array. */
function tdCookie(res) {
  const set = res.headers['set-cookie'] || [];
  const c = set.find((x) => x.startsWith('exprsn_td='));
  return c ? c.split(';')[0] : null;
}

describe('Trusted-device MFA skip', () => {
  beforeAll(async () => { await setupTestDatabase(); });
  afterAll(async () => { await teardownTestDatabase(); });
  beforeEach(async () => { await clearDatabase(); jest.clearAllMocks(); });

  test('challenge advertises rememberDeviceDays; opting in issues a cookie that skips next time', async () => {
    const { user, secret } = await enrolledMemberInOrg('td@example.com', 30);

    // 1. First login → MFA challenge, policy advertised.
    const challenge = await request(app).post('/api/auth/login').send({ email: 'td@example.com', password: PW }).expect(200);
    expect(challenge.body.mfaRequired).toBe(true);
    expect(challenge.body.rememberDeviceDays).toBe(30);

    // 2. Complete the challenge opting to trust the device → Set-Cookie exprsn_td.
    const verify = await request(app)
      .post('/api/auth/mfa/verify')
      .send({ mfaToken: challenge.body.mfaToken, code: totp(secret), rememberDevice: true })
      .expect(200);
    expect(verify.body.token).toBeTruthy();
    const cookie = tdCookie(verify);
    expect(cookie).toBeTruthy();

    // 3. A fresh login carrying ONLY that cookie skips the challenge entirely.
    const skipped = await request(app)
      .post('/api/auth/login')
      .set('Cookie', cookie)
      .send({ email: 'td@example.com', password: PW })
      .expect(200);
    expect(skipped.body.token).toBeTruthy();
    expect(skipped.body.mfaRequired).toBeUndefined();
    expect(skipped.body.message).toContain('Login successful');

    // sanity: user id preserved through the skip
    expect(skipped.body.user.id).toBe(user.id);
  });

  test('opting OUT issues no cookie; the challenge still fires next time', async () => {
    const { secret } = await enrolledMemberInOrg('noremember@example.com', 30);

    const challenge = await request(app).post('/api/auth/login').send({ email: 'noremember@example.com', password: PW }).expect(200);
    const verify = await request(app)
      .post('/api/auth/mfa/verify')
      .send({ mfaToken: challenge.body.mfaToken, code: totp(secret), rememberDevice: false })
      .expect(200);
    expect(tdCookie(verify)).toBeNull();

    const again = await request(app).post('/api/auth/login').send({ email: 'noremember@example.com', password: PW }).expect(200);
    expect(again.body.mfaRequired).toBe(true);
  });

  test('rememberDeviceDays=0 policy: no opt-in advertised, opting in still issues nothing', async () => {
    const { secret } = await enrolledMemberInOrg('nopolicy@example.com', 0);

    const challenge = await request(app).post('/api/auth/login').send({ email: 'nopolicy@example.com', password: PW }).expect(200);
    expect(challenge.body.rememberDeviceDays).toBe(0);

    const verify = await request(app)
      .post('/api/auth/mfa/verify')
      .send({ mfaToken: challenge.body.mfaToken, code: totp(secret), rememberDevice: true })
      .expect(200);
    expect(tdCookie(verify)).toBeNull();
  });

  test('a cookie bound to a different MFA secret does not skip (rotation-safe)', async () => {
    const { user, secret } = await enrolledMemberInOrg('rotate@example.com', 30);

    const challenge = await request(app).post('/api/auth/login').send({ email: 'rotate@example.com', password: PW }).expect(200);
    const verify = await request(app)
      .post('/api/auth/mfa/verify')
      .send({ mfaToken: challenge.body.mfaToken, code: totp(secret), rememberDevice: true })
      .expect(200);
    const cookie = tdCookie(verify);

    // Rotate the user's MFA secret (as disable→re-enrol would) — old cookie is stale.
    await user.update({ mfaSecret: speakeasy.generateSecret().base32 });

    const stillChallenged = await request(app)
      .post('/api/auth/login')
      .set('Cookie', cookie)
      .send({ email: 'rotate@example.com', password: PW })
      .expect(200);
    expect(stillChallenged.body.mfaRequired).toBe(true);
  });
});
