/**
 * MFA Tests
 * Tests for Multi-Factor Authentication (TOTP and backup codes) against the
 * current flow:
 *  - Login for an MFA-enabled user does NOT establish a session; it returns
 *    { mfaRequired, mfaToken } and the client completes
 *    POST /api/auth/mfa/verify with a TOTP/backup code.
 *  - Backup codes are stored server-side ONLY as sha256 hashes; the plaintext
 *    is shown once at setup/regenerate.
 *  - POST /api/mfa/verify (enable) does not re-return backup codes.
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const speakeasy = require('speakeasy');
const app = require('../src/app');
const { hashBackupCode } = require('../src/utils/mfaToken');
const {
  setupTestDatabase,
  teardownTestDatabase,
  clearDatabase,
  createTestUser
} = require('./helpers/testDatabase');

const PW = 'Test123!@#';

/** Create an MFA-enabled user with a real TOTP secret (+ optional backup codes). */
async function createMfaUser(email, { backupCodes = null, enabled = true } = {}) {
  const secret = speakeasy.generateSecret({ length: 32 });
  const user = await createTestUser({
    email,
    password: await bcrypt.hash(PW, 12),
    mfaEnabled: enabled,
    mfaSecret: secret.base32,
    ...(backupCodes ? { mfaBackupCodes: backupCodes.map(hashBackupCode) } : {})
  });
  return { user, secret };
}

/** Complete a full MFA login on the agent (password → mfaToken → TOTP). */
async function mfaLogin(agent, email, secretBase32) {
  const loginRes = await agent
    .post('/api/auth/login')
    .send({ email, password: PW })
    .expect(200);

  expect(loginRes.body.mfaRequired).toBe(true);
  expect(loginRes.body.mfaToken).toBeTruthy();

  const code = speakeasy.totp({ secret: secretBase32, encoding: 'base32' });

  return agent
    .post('/api/auth/mfa/verify')
    .send({ mfaToken: loginRes.body.mfaToken, code })
    .expect(200);
}

describe('MFA (Multi-Factor Authentication)', () => {
  let agent;

  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
    jest.clearAllMocks();
    agent = request.agent(app);
  });

  describe('POST /api/mfa/setup', () => {
    test('should generate MFA secret, QR code, and 10 one-time backup codes', async () => {
      const user = await createTestUser({
        email: 'mfa@example.com',
        password: await bcrypt.hash(PW, 12),
        mfaEnabled: false
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'mfa@example.com', password: PW })
        .expect(200);

      const response = await agent
        .post('/api/mfa/setup')
        .expect(200);

      expect(response.body.message).toContain('MFA setup initiated');
      expect(response.body).toHaveProperty('secret');
      expect(response.body).toHaveProperty('qrCode');
      expect(response.body.qrCode).toContain('data:image/png;base64');
      expect(response.body.backupCodes).toHaveLength(10);
      response.body.backupCodes.forEach(code => {
        expect(code).toMatch(/^[0-9A-F]{8}$/); // 8 uppercase hex characters
      });

      // Secret stored, but MFA not enabled until verified
      await user.reload();
      expect(user.mfaSecret).toBeTruthy();
      expect(user.mfaEnabled).toBe(false);

      // Server persists ONLY sha256 hashes of the backup codes
      expect(user.mfaBackupCodes).toHaveLength(10);
      const expectedHashes = response.body.backupCodes.map(hashBackupCode);
      expect(user.mfaBackupCodes).toEqual(expectedHashes);
      response.body.backupCodes.forEach(code => {
        expect(user.mfaBackupCodes).not.toContain(code); // never plaintext
      });
    });

    test('should reject if MFA already enabled', async () => {
      const { secret } = await createMfaUser('enabled@example.com');

      await mfaLogin(agent, 'enabled@example.com', secret.base32);

      const response = await agent
        .post('/api/mfa/setup')
        .expect(400);

      expect(response.body.error).toBe('MFA_ALREADY_ENABLED');
    });

    test('should require an authenticated session', async () => {
      const response = await request(app)
        .post('/api/mfa/setup')
        .expect(401);

      expect(response.body.error).toBe('NOT_AUTHENTICATED');
    });
  });

  describe('POST /api/mfa/verify (enable MFA)', () => {
    test('should verify TOTP token and enable MFA (no backup codes re-shown)', async () => {
      const secret = speakeasy.generateSecret({ length: 32 });
      const user = await createTestUser({
        email: 'verify@example.com',
        password: await bcrypt.hash(PW, 12),
        mfaEnabled: false,
        mfaSecret: secret.base32
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'verify@example.com', password: PW })
        .expect(200);

      const token = speakeasy.totp({ secret: secret.base32, encoding: 'base32' });

      const response = await agent
        .post('/api/mfa/verify')
        .send({ token })
        .expect(200);

      expect(response.body.message).toContain('MFA enabled');
      // Backup codes were shown once at setup; they are NOT returned again
      expect(response.body).not.toHaveProperty('backupCodes');

      await user.reload();
      expect(user.mfaEnabled).toBe(true);
    });

    test('should reject invalid TOTP token', async () => {
      const secret = speakeasy.generateSecret({ length: 32 });
      const user = await createTestUser({
        email: 'invalid@example.com',
        password: await bcrypt.hash(PW, 12),
        mfaSecret: secret.base32
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'invalid@example.com', password: PW })
        .expect(200);

      const response = await agent
        .post('/api/mfa/verify')
        .send({ token: '000000' })
        .expect(400);

      expect(response.body.error).toBe('INVALID_MFA_TOKEN');

      await user.reload();
      expect(user.mfaEnabled).toBe(false);
    });

    test('should reject when MFA setup was not initiated', async () => {
      await createTestUser({
        email: 'nosetup@example.com',
        password: await bcrypt.hash(PW, 12)
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'nosetup@example.com', password: PW })
        .expect(200);

      const response = await agent
        .post('/api/mfa/verify')
        .send({ token: '123456' })
        .expect(400);

      expect(response.body.error).toBe('MFA_NOT_SETUP');
    });

    test('should require a token', async () => {
      await createTestUser({
        email: 'notoken@example.com',
        password: await bcrypt.hash(PW, 12)
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'notoken@example.com', password: PW })
        .expect(200);

      const response = await agent
        .post('/api/mfa/verify')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('TOKEN_REQUIRED');
    });
  });

  describe('POST /api/mfa/validate (session re-validation)', () => {
    test('should validate TOTP token for an authenticated MFA user', async () => {
      const { secret } = await createMfaUser('validate@example.com');
      await mfaLogin(agent, 'validate@example.com', secret.base32);

      const token = speakeasy.totp({ secret: secret.base32, encoding: 'base32' });

      const response = await agent
        .post('/api/mfa/validate')
        .send({ token })
        .expect(200);

      expect(response.body.message).toContain('validated successfully');
    });

    test('should validate a backup code and consume it', async () => {
      const backupCodes = ['ABCD1234', 'EFGH5678', 'IJKL9012'];
      const { user, secret } = await createMfaUser('backup@example.com', { backupCodes });

      await mfaLogin(agent, 'backup@example.com', secret.base32);

      const response = await agent
        .post('/api/mfa/validate')
        .send({ token: 'ABCD1234' })
        .expect(200);

      expect(response.body.message).toContain('backup code');
      expect(response.body).toHaveProperty('remainingBackupCodes', 2);

      // Used code's HASH is removed; remaining entries are hashes, not plaintext
      await user.reload();
      expect(user.mfaBackupCodes).toHaveLength(2);
      expect(user.mfaBackupCodes).not.toContain(hashBackupCode('ABCD1234'));
      expect(user.mfaBackupCodes).toEqual(
        ['EFGH5678', 'IJKL9012'].map(hashBackupCode)
      );
    });

    test('should reject a backup code that was already used', async () => {
      const { secret } = await createMfaUser('reuse@example.com', { backupCodes: ['CODE1111'] });

      await mfaLogin(agent, 'reuse@example.com', secret.base32);

      await agent
        .post('/api/mfa/validate')
        .send({ token: 'CODE1111' })
        .expect(200);

      const response = await agent
        .post('/api/mfa/validate')
        .send({ token: 'CODE1111' })
        .expect(400);

      expect(response.body.error).toBe('INVALID_MFA_TOKEN');
    });

    test('should reject invalid TOTP token', async () => {
      const { secret } = await createMfaUser('badtotp@example.com');
      await mfaLogin(agent, 'badtotp@example.com', secret.base32);

      const response = await agent
        .post('/api/mfa/validate')
        .send({ token: '000000' })
        .expect(400);

      expect(response.body.error).toBe('INVALID_MFA_TOKEN');
    });

    test('should reject when MFA is not enabled', async () => {
      await createTestUser({
        email: 'plain@example.com',
        password: await bcrypt.hash(PW, 12)
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'plain@example.com', password: PW })
        .expect(200);

      const response = await agent
        .post('/api/mfa/validate')
        .send({ token: '123456' })
        .expect(400);

      expect(response.body.error).toBe('MFA_NOT_ENABLED');
    });
  });

  describe('POST /api/mfa/disable', () => {
    test('should disable MFA with password verification and clear secret + codes', async () => {
      const { user, secret } = await createMfaUser('disable@example.com', {
        backupCodes: ['CODE1111', 'CODE2222']
      });

      await mfaLogin(agent, 'disable@example.com', secret.base32);

      const response = await agent
        .post('/api/mfa/disable')
        .send({ password: PW })
        .expect(200);

      expect(response.body.message).toContain('disabled successfully');

      await user.reload();
      expect(user.mfaEnabled).toBe(false);
      expect(user.mfaSecret).toBeNull();
      expect(user.mfaBackupCodes).toBeNull();
    });

    test('should reject with wrong password', async () => {
      const { user, secret } = await createMfaUser('wrongpw@example.com');

      await mfaLogin(agent, 'wrongpw@example.com', secret.base32);

      const response = await agent
        .post('/api/mfa/disable')
        .send({ password: 'WrongPassword123!' })
        .expect(401);

      expect(response.body.error).toBe('INVALID_PASSWORD');

      await user.reload();
      expect(user.mfaEnabled).toBe(true);
    });

    test('should reject if MFA not enabled', async () => {
      await createTestUser({
        email: 'notenabled@example.com',
        password: await bcrypt.hash(PW, 12),
        mfaEnabled: false
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'notenabled@example.com', password: PW })
        .expect(200);

      const response = await agent
        .post('/api/mfa/disable')
        .send({ password: PW })
        .expect(400);

      expect(response.body.error).toBe('MFA_NOT_ENABLED');
    });

    test('should require the password field', async () => {
      const { secret } = await createMfaUser('nopw@example.com');
      await mfaLogin(agent, 'nopw@example.com', secret.base32);

      const response = await agent
        .post('/api/mfa/disable')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('PASSWORD_REQUIRED');
    });
  });

  describe('POST /api/mfa/regenerate-backup-codes', () => {
    test('should regenerate 10 backup codes with password (hashes stored)', async () => {
      const oldCodes = ['OLD11111', 'OLD22222'];
      const { user, secret } = await createMfaUser('regen@example.com', { backupCodes: oldCodes });

      await mfaLogin(agent, 'regen@example.com', secret.base32);

      const response = await agent
        .post('/api/mfa/regenerate-backup-codes')
        .send({ password: PW })
        .expect(200);

      expect(response.body.message).toContain('regenerated');
      expect(response.body.backupCodes).toHaveLength(10);
      response.body.backupCodes.forEach(code => {
        expect(code).toMatch(/^[0-9A-F]{8}$/);
      });

      await user.reload();
      expect(user.mfaBackupCodes).toHaveLength(10);
      expect(user.mfaBackupCodes).toEqual(response.body.backupCodes.map(hashBackupCode));
      expect(user.mfaBackupCodes).not.toContain(hashBackupCode('OLD11111'));
    });

    test('should verify password before regenerating', async () => {
      const { secret } = await createMfaUser('regenpw@example.com');
      await mfaLogin(agent, 'regenpw@example.com', secret.base32);

      const response = await agent
        .post('/api/mfa/regenerate-backup-codes')
        .send({ password: 'WrongPassword123!' })
        .expect(401);

      expect(response.body.error).toBe('INVALID_PASSWORD');
    });
  });

  describe('GET /api/mfa/status', () => {
    test('should get MFA status and remaining backup codes', async () => {
      const { secret } = await createMfaUser('status@example.com', {
        backupCodes: ['CODE1111', 'CODE2222', 'CODE3333']
      });

      await mfaLogin(agent, 'status@example.com', secret.base32);

      const response = await agent
        .get('/api/mfa/status')
        .expect(200);

      expect(response.body).toHaveProperty('mfaEnabled', true);
      expect(response.body).toHaveProperty('backupCodesRemaining', 3);
    });

    test('should show MFA disabled status with zero backup codes', async () => {
      await createTestUser({
        email: 'disabledstatus@example.com',
        password: await bcrypt.hash(PW, 12),
        mfaEnabled: false
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'disabledstatus@example.com', password: PW })
        .expect(200);

      const response = await agent
        .get('/api/mfa/status')
        .expect(200);

      expect(response.body).toHaveProperty('mfaEnabled', false);
      expect(response.body).toHaveProperty('backupCodesRemaining', 0);
    });
  });

  describe('MFA login flow (POST /api/auth/login → /api/auth/mfa/verify)', () => {
    test('login withholds session and bearer until MFA completes', async () => {
      const { secret } = await createMfaUser('flow@example.com');

      // Step 1: password login → MFA challenge, no token, no session
      const loginResponse = await agent
        .post('/api/auth/login')
        .send({ email: 'flow@example.com', password: PW })
        .expect(200);

      expect(loginResponse.body.mfaRequired).toBe(true);
      expect(loginResponse.body.mfaToken).toBeTruthy();
      expect(loginResponse.body.token).toBeUndefined();
      expect(loginResponse.body.user).toBeUndefined();

      await agent.get('/api/auth/me').expect(401); // still unauthenticated

      // Step 2: complete MFA → session + bearer
      const code = speakeasy.totp({ secret: secret.base32, encoding: 'base32' });
      const verifyResponse = await agent
        .post('/api/auth/mfa/verify')
        .send({ mfaToken: loginResponse.body.mfaToken, code })
        .expect(200);

      expect(verifyResponse.body.message).toContain('Login successful');
      expect(verifyResponse.body.token).toBeTruthy();
      expect(verifyResponse.body.user.email).toBe('flow@example.com');

      await agent.get('/api/auth/me').expect(200);
    });

    test('completes MFA login with a backup code (single-use)', async () => {
      const { user } = await createMfaUser('flowbackup@example.com', {
        backupCodes: ['FLOW1111', 'FLOW2222']
      });

      const loginResponse = await agent
        .post('/api/auth/login')
        .send({ email: 'flowbackup@example.com', password: PW })
        .expect(200);

      await agent
        .post('/api/auth/mfa/verify')
        .send({ mfaToken: loginResponse.body.mfaToken, code: 'FLOW1111' })
        .expect(200);

      await user.reload();
      expect(user.mfaBackupCodes).toEqual([hashBackupCode('FLOW2222')]);
    });

    test('rejects an invalid MFA code', async () => {
      await createMfaUser('flowbad@example.com');

      const loginResponse = await agent
        .post('/api/auth/login')
        .send({ email: 'flowbad@example.com', password: PW })
        .expect(200);

      const response = await agent
        .post('/api/auth/mfa/verify')
        .send({ mfaToken: loginResponse.body.mfaToken, code: '000000' })
        .expect(401);

      expect(response.body.error).toBe('INVALID_MFA_CODE');
    });

    test('rejects a bogus mfaToken', async () => {
      await createMfaUser('flowtoken@example.com');

      const response = await request(app)
        .post('/api/auth/mfa/verify')
        .send({ mfaToken: 'not-a-jwt', code: '123456' })
        .expect(401);

      expect(response.body.error).toBe('INVALID_MFA_TOKEN');
    });
  });
});
