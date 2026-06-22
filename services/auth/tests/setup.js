/**
 * Jest Test Setup
 * Configure test environment and global mocks.
 */

// ─── Test environment ────────────────────────────────────────────────────────
// Set BEFORE any src module is required (setupFilesAfterEnv runs before the test
// file loads, so config/index.js reads these). dotenv (loaded by src/index) does
// not override already-set vars, so these win over services/auth/.env.
process.env.NODE_ENV = 'test';
process.env.AUTH_DB_HOST = process.env.AUTH_DB_HOST || 'localhost';
process.env.AUTH_DB_PORT = process.env.AUTH_DB_PORT || '5432';
process.env.AUTH_DB_NAME = process.env.AUTH_DB_NAME || 'exprsn_auth_test';
process.env.AUTH_DB_USER = process.env.AUTH_DB_USER || 'postgres';
process.env.AUTH_DB_PASSWORD = process.env.AUTH_DB_PASSWORD || 'postgres';
process.env.DB_LOGGING = 'false'; // Quiet Sequelize SQL logging in tests
process.env.REDIS_ENABLED = 'false'; // No Redis for tests (MemoryStore session store)
process.env.SESSION_SECRET = 'test-session-secret';
process.env.CA_URL = 'http://localhost:3000';
// @exprsn/shared instantiates Stripe at require-time; give it a dummy key so the
// constructor doesn't throw when STRIPE_SECRET_KEY is unset in the test env.
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

// Disable rate limiting in tests (strictLimiter = 10 req/15min, in-memory store
// that accumulates across the suite). Keep every other @exprsn/shared export real.
jest.mock('@exprsn/shared', () => {
  const actual = jest.requireActual('@exprsn/shared');
  const passthrough = (req, res, next) => next();
  return {
    ...actual,
    strictLimiter: passthrough,
    standardLimiter: passthrough,
    relaxedLimiter: passthrough,
    createRateLimiter: () => passthrough,
  };
});

// Mock email service (routes swallow email errors, but avoid real sends)
jest.mock('../src/services/emailService', () => ({
  getEmailService: jest.fn().mockResolvedValue({
    sendEmail: jest.fn().mockResolvedValue(true),
    sendVerificationEmail: jest.fn().mockResolvedValue(true),
    sendWelcomeEmail: jest.fn().mockResolvedValue(true),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
    sendPasswordChangedEmail: jest.fn().mockResolvedValue(true),
    sendSecurityAlertEmail: jest.fn().mockResolvedValue(true),
    sendMFADisabledEmail: jest.fn().mockResolvedValue(true),
  }),
}));

// ─── In-process CA token service (stateful fake) ─────────────────────────────
// The auth module mints/validates/revokes CA tokens IN-PROCESS via
// services/ca/services/token (required by tokenService.js + bearerAuth.js).
// Replacing that one module with a stateful fake lets the real auth token flow
// run AND makes the revoke→validate→401 chain testable without a CA DB/Redis.
//
// IMPORTANT: these are PLAIN functions, not jest.fn() — jest config has
// resetMocks:true, which would wipe a jest.fn() implementation between tests.
// Plain functions keep their behavior (and the shared token store) across tests.
jest.mock('../../ca/services/token', () => {
  const tokens = new Map(); // id -> { status: 'active'|'revoked', userId }
  let counter = 0;
  return {
    generateToken: async (params, userId) => {
      const id = `tok-${++counter}`;
      const uid = userId || (params && params.data && params.data.userId);
      tokens.set(id, { status: 'active', userId: uid });
      return { id };
    },
    validateToken: async (tokenId) => {
      const t = tokens.get(tokenId);
      if (!t || t.status !== 'active') {
        return { valid: false, error: 'TOKEN_REVOKED', message: 'Token has been revoked' };
      }
      return { valid: true, userId: t.userId, tokenData: { userId: t.userId } };
    },
    revokeToken: async (tokenId) => {
      const t = tokens.get(tokenId);
      if (!t) {
        const err = new Error('Token not found');
        err.code = 'TOKEN_NOT_FOUND';
        err.status = 404;
        throw err;
      }
      t.status = 'revoked';
      return { id: tokenId, status: 'revoked' };
    },
    // test helpers
    __tokens: tokens,
    __reset: () => { tokens.clear(); counter = 0; },
  };
});

// The platform signing certificate id (CA-side); irrelevant to the fake above.
jest.mock('../../ca/services/platformSigning', () => ({
  getSigningCertificateId: async () => 'test-signing-cert-id',
}));

// Global test timeout
jest.setTimeout(10000);

// Clean up after all tests
afterAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 500));
});
