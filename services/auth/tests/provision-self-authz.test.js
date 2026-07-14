/**
 * FEAT-033 — POST /api/organizations/provision-self authorization guards.
 *
 * Two security invariants for the self-serve provisioning front (a plain
 * session-authenticated user, actor.isAdmin=false):
 *
 *   (1) Template-selection privilege escalation (P1): the self-serve caller may
 *       select ONLY team|personal. 'enterprise' (plan=enterprise, maxMembers=null,
 *       5yr CA, extra RBAC groups) is admin-provisioned only — a self-serve
 *       request with type='enterprise' (or any unknown type) MUST be rejected 400
 *       BEFORE the engine is reached (no enterprise org is created).
 *
 *   (2) Client-trusted idempotency key (P3): the engine dedups by
 *       {idempotencyKey, kind} with NO owner scoping, so a client-supplied key
 *       could short-circuit into (and return the internal ids of) another owner's
 *       completed run. The route MUST derive an owner-scoped key server-side and
 *       IGNORE any body-supplied idempotencyKey.
 *
 * We spy on the single provisioning engine export and drive the real auth app +
 * live test Postgres (login establishes the passport session provision-self needs).
 */

const request = require('supertest');
const bcrypt = require('bcrypt');

// Isolate the single provisioning engine (spans CA/nexus/spark).
jest.mock('../../../src/provisioning/engine', () => ({
  provisionOrganization: jest.fn()
}));

// Keep real @exprsn/shared exports but neutralize the rate limiters (login + the
// route use strictLimiter/standardLimiter), mirroring tests/setup.js.
jest.mock('@exprsn/shared', () => {
  const actual = jest.requireActual('@exprsn/shared');
  const passthrough = (req, res, next) => next();
  return {
    ...actual,
    strictLimiter: passthrough,
    standardLimiter: passthrough,
    relaxedLimiter: passthrough,
    createRateLimiter: () => passthrough
  };
});

const engine = require('../../../src/provisioning/engine');
const app = require('../src/app');
const {
  setupTestDatabase,
  teardownTestDatabase,
  clearDatabase,
  createTestUser
} = require('./helpers/testDatabase');

const PW = 'Sup3rSecret!1';

/** Create an active, verified user and return a supertest agent already logged in. */
async function loggedInAgent(email) {
  const user = await createTestUser({
    email,
    password: await bcrypt.hash(PW, 12),
    status: 'active',
    emailVerified: true
  });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: PW }).expect(200);
  return { agent, user };
}

describe('POST /api/organizations/provision-self — authz guards', () => {
  beforeAll(async () => { await setupTestDatabase(); });
  afterAll(async () => { await teardownTestDatabase(); });
  beforeEach(async () => {
    await clearDatabase();
    engine.provisionOrganization.mockResolvedValue({ status: 'completed', organizationId: 'org-1' });
  });

  test('(1) type="enterprise" is rejected 400 and never reaches the engine', async () => {
    const { agent } = await loggedInAgent('esc@example.com');

    const res = await agent
      .post('/api/organizations/provision-self')
      .send({ type: 'enterprise', name: 'Escalated Corp' })
      .expect(400);

    expect(res.body.error).toBe('VALIDATION_ERROR');
    // The engine — the only path that could create an enterprise org — was never invoked.
    expect(engine.provisionOrganization).not.toHaveBeenCalled();
  });

  test('(1b) an unknown type is rejected 400 and never reaches the engine', async () => {
    const { agent } = await loggedInAgent('unknown@example.com');

    await agent
      .post('/api/organizations/provision-self')
      .send({ type: 'root', name: 'Sneaky Corp' })
      .expect(400);

    expect(engine.provisionOrganization).not.toHaveBeenCalled();
  });

  test('(1c) type="team" is accepted and forwarded to the engine', async () => {
    const { agent, user } = await loggedInAgent('team@example.com');

    await agent
      .post('/api/organizations/provision-self')
      .send({ type: 'team', name: 'Legit Team' })
      .expect(201);

    expect(engine.provisionOrganization).toHaveBeenCalledTimes(1);
    const [args] = engine.provisionOrganization.mock.calls[0];
    expect(args.type).toBe('team');
    expect(args.actor.isAdmin).toBe(false);
    expect(args.owner.userId).toBe(user.id);
  });

  test('(2) a body-supplied idempotencyKey is IGNORED; the key is derived owner-scoped server-side', async () => {
    const { agent, user } = await loggedInAgent('idem@example.com');

    await agent
      .post('/api/organizations/provision-self')
      .send({
        type: 'team',
        name: 'Idem Team',
        slug: 'idem-team',
        // Attacker-controlled: attempts to point the run at a foreign ledger key.
        idempotencyKey: 'victim-slug:victim-user-id'
      })
      .expect(201);

    expect(engine.provisionOrganization).toHaveBeenCalledTimes(1);
    const [args] = engine.provisionOrganization.mock.calls[0];
    // Server-derived, owner-scoped — NOT the client value.
    expect(args.idempotencyKey).toBe(`idem-team:${user.id}`);
    expect(args.idempotencyKey).not.toContain('victim');
  });
});
