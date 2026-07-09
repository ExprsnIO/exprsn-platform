/**
 * Authentication Tests
 * Tests for user registration, login, email verification, and password
 * management — aligned with current behavior:
 *  - Joi schemas run first (VALIDATION_ERROR) and reset/change flows REQUIRE
 *    confirmPassword; the full password policy (min 12, no sequential runs,
 *    no common words) then returns WEAK_PASSWORD.
 *  - The CA bearer is the in-process token id (stateful fake in tests/setup).
 *  - Email sending goes through getEmailService(); its mock is re-primed per
 *    test because jest resetMocks wipes factory implementations.
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const app = require('../src/app');
const {
  setupTestDatabase,
  teardownTestDatabase,
  clearDatabase,
  createTestUser,
  getModels
} = require('./helpers/testDatabase');
const emailServiceModule = require('../src/services/emailService');

// Passes BOTH the Joi register pattern and the passwordService policy
// (>=12 chars, upper/lower/digit/special, no abc/123 runs, no common words).
const STRONG_PW = 'Xk9!mQ2@vB7$Lp4z';
const STRONG_PW_2 = 'Wm4$tR8!nK3@Jd6y';

describe('Authentication', () => {
  let models;
  let emailMock;

  beforeAll(async () => {
    const db = await setupTestDatabase();
    models = db.models;
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
    jest.clearAllMocks();

    // jest.config resetMocks:true wipes the setup.js mockResolvedValue before
    // every test — re-prime the email service mock so routes get jest.fn()s.
    emailMock = {
      sendEmail: jest.fn().mockResolvedValue(true),
      sendVerificationEmail: jest.fn().mockResolvedValue(true),
      sendWelcomeEmail: jest.fn().mockResolvedValue(true),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
      sendPasswordChangedEmail: jest.fn().mockResolvedValue(true),
      sendSecurityAlertEmail: jest.fn().mockResolvedValue(true),
      sendMFADisabledEmail: jest.fn().mockResolvedValue(true)
    };
    emailServiceModule.getEmailService.mockResolvedValue(emailMock);
  });

  describe('POST /api/auth/register', () => {
    test('should register new user with valid credentials', async () => {
      const userData = {
        email: 'newuser@example.com',
        password: STRONG_PW,
        displayName: 'New User'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.user.displayName).toBe(userData.displayName);
      expect(response.body.user).not.toHaveProperty('passwordHash');

      // Verify user was created in database
      const user = await models.User.findOne({ where: { email: userData.email } });
      expect(user).toBeTruthy();
      expect(user.emailVerified).toBe(false);
      expect(user.emailVerificationToken).toBeTruthy();

      // Verify emails were sent
      expect(emailMock.sendVerificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ email: userData.email }),
        expect.any(String)
      );
      expect(emailMock.sendWelcomeEmail).toHaveBeenCalled();
    });

    test('should reject a password failing the Joi schema with VALIDATION_ERROR', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'weak',
          displayName: 'Test User'
        })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'password' })])
      );
    });

    test('should reject a policy-weak password with WEAK_PASSWORD', async () => {
      // Passes the Joi pattern but violates the policy (common word + 123 run)
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          displayName: 'Test User'
        })
        .expect(400);

      expect(response.body.error).toBe('WEAK_PASSWORD');
    });

    test('should reject registration with existing email', async () => {
      await createTestUser({ email: 'existing@example.com' });

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'existing@example.com',
          password: STRONG_PW,
          displayName: 'Test User'
        })
        .expect(409);

      expect(response.body.error).toBe('USER_EXISTS');
    });

    test('should generate email verification token on registration', async () => {
      const userData = {
        email: 'verify@example.com',
        password: STRONG_PW
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const user = await models.User.findOne({ where: { email: userData.email } });
      expect(user.emailVerificationToken).toBeTruthy();
      expect(user.emailVerificationToken).toHaveLength(64);
      expect(user.emailVerified).toBe(false);
    });

    test('should return a CA bearer token on successful registration', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'token@example.com',
          password: STRONG_PW
        })
        .expect(201);

      expect(response.body.token).toBeTruthy();
      expect(typeof response.body.token).toBe('string');
    });
  });

  describe('POST /api/auth/login', () => {
    test('should login with valid credentials', async () => {
      await createTestUser({
        email: 'login@example.com',
        password: await bcrypt.hash('Test123!@#', 12),
        emailVerified: true
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'Test123!@#'
        })
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Login successful');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe('login@example.com');
    });

    test('should reject login with invalid credentials', async () => {
      await createTestUser({
        email: 'test@example.com',
        password: await bcrypt.hash('CorrectPassword123!', 12)
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'WrongPassword123!'
        })
        .expect(401);

      expect(response.body.error).toBe('AUTH_FAILED');
    });

    test('should return a CA bearer token on successful login', async () => {
      await createTestUser({
        email: 'token@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'token@example.com',
          password: 'Test123!@#'
        })
        .expect(200);

      expect(response.body.token).toBeTruthy();
      expect(typeof response.body.token).toBe('string');
    });

    test('should withhold token and challenge for MFA when enabled', async () => {
      await createTestUser({
        email: 'mfa@example.com',
        password: await bcrypt.hash('Test123!@#', 12),
        mfaEnabled: true,
        mfaSecret: 'JBSWY3DPEHPK3PXP'
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'mfa@example.com',
          password: 'Test123!@#'
        })
        .expect(200);

      expect(response.body.mfaRequired).toBe(true);
      expect(response.body.mfaToken).toBeTruthy();
      expect(response.body.token).toBeUndefined();
    });

    test('should reject login with non-existent email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'Test123!@#'
        })
        .expect(401);

      expect(response.body.error).toBe('AUTH_FAILED');
    });
  });

  describe('POST /api/auth/verify-email', () => {
    test('should verify email with valid token', async () => {
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const user = await createTestUser({
        email: 'verify@example.com',
        emailVerified: false,
        emailVerificationToken: verificationToken
      });

      const response = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: verificationToken })
        .expect(200);

      expect(response.body.message).toContain('verified');

      await user.reload();
      expect(user.emailVerified).toBe(true);
      expect(user.emailVerificationToken).toBeNull();
    });

    test('should reject an unknown (well-formed) verification token', async () => {
      await createTestUser({
        email: 'test@example.com',
        emailVerificationToken: crypto.randomBytes(32).toString('hex')
      });

      const response = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: crypto.randomBytes(32).toString('hex') })
        .expect(400);

      expect(response.body.error).toBe('INVALID_TOKEN');
    });

    test('should reject a malformed verification token at the schema', async () => {
      const response = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: 'not-a-hex-token' })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/auth/resend-verification', () => {
    test('should resend verification email', async () => {
      const user = await createTestUser({
        email: 'resend@example.com',
        emailVerified: false,
        emailVerificationToken: 'old-token'
      });

      const response = await request(app)
        .post('/api/auth/resend-verification')
        .send({ email: 'resend@example.com' })
        .expect(200);

      expect(response.body.message).toContain('verification');

      await user.reload();
      expect(user.emailVerificationToken).not.toBe('old-token');
      expect(emailMock.sendVerificationEmail).toHaveBeenCalled();
    });

    test('should prevent resending if already verified', async () => {
      await createTestUser({
        email: 'verified@example.com',
        emailVerified: true
      });

      const response = await request(app)
        .post('/api/auth/resend-verification')
        .send({ email: 'verified@example.com' })
        .expect(200);

      expect(response.body.message).toContain('already verified');
      expect(emailMock.sendVerificationEmail).not.toHaveBeenCalled();
    });

    test('should not reveal if email does not exist', async () => {
      const response = await request(app)
        .post('/api/auth/resend-verification')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(response.body.message).toBeTruthy();
      expect(emailMock.sendVerificationEmail).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    test('should request password reset with valid email', async () => {
      const user = await createTestUser({
        email: 'reset@example.com'
      });

      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'reset@example.com' })
        .expect(200);

      expect(response.body.message).toContain('password reset');

      await user.reload();
      expect(user.resetPasswordToken).toBeTruthy();
      expect(user.resetPasswordExpires).toBeTruthy();

      expect(emailMock.sendPasswordResetEmail).toHaveBeenCalled();
    });

    test('should not reveal if email does not exist', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(response.body.message).toContain('password reset');
      expect(emailMock.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    test('should generate reset token with ~1h expiration', async () => {
      const user = await createTestUser({
        email: 'expire@example.com'
      });

      await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'expire@example.com' })
        .expect(200);

      await user.reload();
      expect(user.resetPasswordToken).toHaveLength(64);
      expect(user.resetPasswordExpires).toBeTruthy();

      // resetPasswordExpires is a BIGINT (epoch ms) — may come back as string
      const expiryTime = Number(user.resetPasswordExpires);
      const now = Date.now();
      const oneHour = 60 * 60 * 1000;
      expect(expiryTime - now).toBeGreaterThan(oneHour - 60000);
      expect(expiryTime - now).toBeLessThan(oneHour + 60000);
    });
  });

  describe('POST /api/auth/reset-password', () => {
    test('should reset password with valid token', async () => {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const user = await createTestUser({
        email: 'reset@example.com',
        resetPasswordToken: resetToken,
        resetPasswordExpires: Date.now() + 3600000
      });

      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          password: STRONG_PW,
          confirmPassword: STRONG_PW
        })
        .expect(200);

      expect(response.body.message).toContain('reset successful');

      await user.reload();
      expect(user.resetPasswordToken).toBeNull();
      expect(user.resetPasswordExpires).toBeNull();

      const isValid = await bcrypt.compare(STRONG_PW, user.passwordHash);
      expect(isValid).toBe(true);
    });

    test('should reject expired reset token', async () => {
      const resetToken = crypto.randomBytes(32).toString('hex');
      await createTestUser({
        email: 'expired@example.com',
        resetPasswordToken: resetToken,
        resetPasswordExpires: Date.now() - 1000
      });

      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          password: STRONG_PW,
          confirmPassword: STRONG_PW
        })
        .expect(400);

      expect(response.body.error).toBe('INVALID_TOKEN');
    });

    test('should require a matching confirmPassword', async () => {
      const resetToken = crypto.randomBytes(32).toString('hex');
      await createTestUser({
        email: 'confirm@example.com',
        resetPasswordToken: resetToken,
        resetPasswordExpires: Date.now() + 3600000
      });

      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          password: STRONG_PW
          // no confirmPassword
        })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    test('should reject a policy-weak new password with WEAK_PASSWORD', async () => {
      const resetToken = crypto.randomBytes(32).toString('hex');
      await createTestUser({
        email: 'reset@example.com',
        resetPasswordToken: resetToken,
        resetPasswordExpires: Date.now() + 3600000
      });

      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          password: 'Password123!', // Joi-ok, policy-weak
          confirmPassword: 'Password123!'
        })
        .expect(400);

      expect(response.body.error).toBe('WEAK_PASSWORD');
    });
  });

  describe('POST /api/auth/change-password', () => {
    test('should change password for authenticated user', async () => {
      const user = await createTestUser({
        email: 'change@example.com',
        password: await bcrypt.hash('OldPassword123!', 12)
      });

      const agent = request.agent(app);
      await agent
        .post('/api/auth/login')
        .send({
          email: 'change@example.com',
          password: 'OldPassword123!'
        })
        .expect(200);

      const response = await agent
        .post('/api/auth/change-password')
        .send({
          currentPassword: 'OldPassword123!',
          newPassword: STRONG_PW,
          confirmPassword: STRONG_PW
        })
        .expect(200);

      expect(response.body.message).toContain('changed successfully');

      await user.reload();
      const isValid = await bcrypt.compare(STRONG_PW, user.passwordHash);
      expect(isValid).toBe(true);

      expect(emailMock.sendSecurityAlertEmail).toHaveBeenCalled();
    });

    test('should verify current password before changing', async () => {
      await createTestUser({
        email: 'verify@example.com',
        password: await bcrypt.hash('CurrentPassword123!', 12)
      });

      const agent = request.agent(app);
      await agent
        .post('/api/auth/login')
        .send({
          email: 'verify@example.com',
          password: 'CurrentPassword123!'
        })
        .expect(200);

      const response = await agent
        .post('/api/auth/change-password')
        .send({
          currentPassword: 'WrongPassword123!',
          newPassword: STRONG_PW,
          confirmPassword: STRONG_PW
        })
        .expect(401);

      expect(response.body.error).toBe('INVALID_PASSWORD');
    });

    test('should reject if new password equals the current one (schema-level)', async () => {
      // The Joi schema marks newPassword invalid when it equals currentPassword
      const password = STRONG_PW;
      await createTestUser({
        email: 'same@example.com',
        password: await bcrypt.hash(password, 12)
      });

      const agent = request.agent(app);
      await agent
        .post('/api/auth/login')
        .send({ email: 'same@example.com', password })
        .expect(200);

      const response = await agent
        .post('/api/auth/change-password')
        .send({
          currentPassword: password,
          newPassword: password,
          confirmPassword: password
        })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    test('should send security alert email after change', async () => {
      await createTestUser({
        email: 'alert@example.com',
        password: await bcrypt.hash('OldPassword123!', 12)
      });

      const agent = request.agent(app);
      await agent
        .post('/api/auth/login')
        .send({
          email: 'alert@example.com',
          password: 'OldPassword123!'
        })
        .expect(200);

      await agent
        .post('/api/auth/change-password')
        .send({
          currentPassword: 'OldPassword123!',
          newPassword: STRONG_PW_2,
          confirmPassword: STRONG_PW_2
        })
        .expect(200);

      expect(emailMock.sendSecurityAlertEmail).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          type: 'Password Changed'
        })
      );
    });
  });

  describe('POST /api/auth/logout', () => {
    test('should logout authenticated user', async () => {
      await createTestUser({
        email: 'logout@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const agent = request.agent(app);
      await agent
        .post('/api/auth/login')
        .send({
          email: 'logout@example.com',
          password: 'Test123!@#'
        })
        .expect(200);

      const response = await agent
        .post('/api/auth/logout')
        .expect(200);

      expect(response.body.message).toContain('Logout successful');

      await agent
        .get('/api/auth/me')
        .expect(401);
    });

    test('should reject logout for unauthenticated user', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .expect(401);

      expect(response.body.error).toBe('NOT_AUTHENTICATED');
    });
  });

  describe('GET /api/auth/me', () => {
    test('should return current authenticated user', async () => {
      const user = await createTestUser({
        email: 'me@example.com',
        password: await bcrypt.hash('Test123!@#', 12),
        displayName: 'Test User'
      });

      const agent = request.agent(app);
      await agent
        .post('/api/auth/login')
        .send({
          email: 'me@example.com',
          password: 'Test123!@#'
        })
        .expect(200);

      const response = await agent
        .get('/api/auth/me')
        .expect(200);

      expect(response.body.user).toHaveProperty('id', user.id);
      expect(response.body.user).toHaveProperty('email', 'me@example.com');
      expect(response.body.user).toHaveProperty('displayName', 'Test User');
      expect(response.body.user).not.toHaveProperty('passwordHash');
    });

    test('should reject request for unauthenticated user', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body.error).toBe('NOT_AUTHENTICATED');
    });
  });
});
