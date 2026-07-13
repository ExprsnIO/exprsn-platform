/**
 * FEAT-033 — one provisioning code path (load-bearing guarantee).
 *
 * The admin route POST /api/organizations/provision and the public route
 * POST /api/auth/signup must both invoke the SAME exported engine function
 * (`engine.provisionOrganization`) — there is no second provisioning path
 * anywhere. We spy on that single export and assert:
 *   1. both requests call it (same jest.fn reference), and the real engine module
 *      exports ONLY provisionOrganization (no divergent function exists);
 *   2. the engine input is a template-normalized, allowlisted payload with the
 *      same top-level shape in both cases, differing only in actor.isAdmin +
 *      owner resolution;
 *   3. an extra client-sent `plan` is NOT forwarded to the engine (mass-assignment
 *      guard) from EITHER route.
 */

const request = require('supertest');

// Isolate the single provisioning engine (spans CA/nexus/spark).
jest.mock('../../../src/provisioning/engine', () => ({
  provisionOrganization: jest.fn()
}));

// Override @exprsn/shared for THIS file: keep the real exports + the rate-limiter
// passthroughs (mirrors tests/setup.js), but stub validateCAToken so the admin
// route authenticates without a live CA. `@exprsn/shared/utils/platformAdmin` is a
// separate module id — NOT mocked — so requireAdminAfterCA still checks the real
// PLATFORM_ADMIN_EMAILS allowlist against the token email we inject here.
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
      req.userId = 'admin-user-1';
      req.tokenData = { email: 'admin@exprsn.io' };
      req.permissions = ['read', 'write'];
      next();
    }
  };
});

const engine = require('../../../src/provisioning/engine');
const app = require('../src/app');
const {
  setupTestDatabase,
  teardownTestDatabase,
  clearDatabase,
  createTestOrganization
} = require('./helpers/testDatabase');

const ALLOWED_ORG_KEYS = ['name', 'slug', 'description', 'email', 'website'];
const VALID_PASSWORD = 'Sup3rSecret!1';

describe('FEAT-033 provision equivalence (admin vs public → same engine)', () => {
  let originalAdminEmails;

  beforeAll(async () => {
    await setupTestDatabase();
    originalAdminEmails = process.env.PLATFORM_ADMIN_EMAILS;
    process.env.PLATFORM_ADMIN_EMAILS = 'admin@exprsn.io';
  });

  afterAll(async () => {
    process.env.PLATFORM_ADMIN_EMAILS = originalAdminEmails;
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
    // resetMocks:true wipes the impl before each test — set it here.
    engine.provisionOrganization.mockResolvedValue({ status: 'completed', organizationId: 'org-1' });
  });

  test('the engine module exports exactly one provisioning function', () => {
    const realEngine = jest.requireActual('../../../src/provisioning/engine');
    expect(Object.keys(realEngine)).toEqual(['provisionOrganization']);
  });

  test('admin /provision and public /signup both invoke the SAME engine, allowlisted', async () => {
    // Platform org: public signup enabled, verification off (provision inline).
    await createTestOrganization({
      slug: 'platform',
      name: 'Platform',
      settings: { allowUserRegistration: true, requireEmailVerification: false }
    });

    // Admin front — CA token (stubbed) + admin email. Extra top-level `plan`.
    await request(app)
      .post('/api/organizations/provision')
      .set('Authorization', 'Bearer admin-token')
      .send({
        type: 'team',
        organization: { name: 'Acme' },
        owner: { email: 'owner@acme.io' },
        plan: 'enterprise' // must NOT reach the engine
      })
      .expect(201);

    // Public front — anonymous, policy enabled. Extra top-level `plan`.
    await request(app)
      .post('/api/auth/signup')
      .send({
        email: 'founder@beta.io',
        password: VALID_PASSWORD,
        org: { name: 'Beta', type: 'team' },
        plan: 'enterprise' // must NOT reach the engine
      })
      .expect(201);

    // (1) Both drove the exact same function.
    expect(engine.provisionOrganization).toHaveBeenCalledTimes(2);
    const [adminArgs] = engine.provisionOrganization.mock.calls[0];
    const [publicArgs] = engine.provisionOrganization.mock.calls[1];

    for (const args of [adminArgs, publicArgs]) {
      // (2) Same top-level engine-input shape.
      expect(Object.keys(args).sort()).toEqual(['actor', 'idempotencyKey', 'organization', 'owner', 'type']);
      // Same template selector.
      expect(args.type).toBe('team');
      // Org fields are allowlisted (strip undefined so an explicit `slug:undefined`
      // literal doesn't read as a stray key).
      const orgKeys = Object.keys(args.organization).filter((k) => args.organization[k] !== undefined);
      expect(orgKeys.every((k) => ALLOWED_ORG_KEYS.includes(k))).toBe(true);
      expect(args.organization.name).toBeTruthy();
      // (3) Mass-assignment guard: the extra `plan` never reaches the engine.
      expect(args).not.toHaveProperty('plan');
      expect(args.organization).not.toHaveProperty('plan');
    }

    // Differs ONLY in actor.isAdmin + owner resolution.
    expect(adminArgs.actor.isAdmin).toBe(true);
    expect(publicArgs.actor.isAdmin).toBe(false);
    expect(adminArgs.owner.email).toBe('owner@acme.io');
    expect(publicArgs.owner.email).toBe('founder@beta.io');
  });
});
