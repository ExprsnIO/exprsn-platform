/**
 * BUG-056 (second facet) — registration must be atomic from the caller's view.
 *
 * The auth.users row used to persist even when the CA token mint failed, so
 * the client got a 500 AND a retry hit 409 USER_EXISTS for an account that
 * never received a token. The mint runs on the CA's own connection/schema and
 * cannot share auth's transaction, so the fix is compensation: a failed mint
 * hard-deletes the just-created user row before rethrowing.
 *
 * Same real-Postgres convention as session.test.js (exprsn_auth_test).
 */

const request = require('supertest');
const app = require('../src/app');
const tokenService = require('../src/services/tokenService');
const {
  setupTestDatabase,
  teardownTestDatabase,
  clearDatabase,
  getModels
} = require('./helpers/testDatabase');

describe('BUG-056 — register rolls back the user row when the token mint fails', () => {
  let models;

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
  });

  const body = {
    email: 'rollback@example.com',
    password: 'Sup3r!Secur3#Pass',
    displayName: 'Rollback User'
  };

  test('failed mint → error response and NO orphaned auth.users row', async () => {
    const spy = jest.spyOn(tokenService, 'generateToken')
      .mockRejectedValue(new Error('Failed to generate authentication token'));

    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBeGreaterThanOrEqual(500);

    const orphan = await models.User.findOne({ where: { email: body.email } });
    expect(orphan).toBeNull();

    spy.mockRestore();
  });

  test('retry after a failed mint succeeds (no stale USER_EXISTS)', async () => {
    const spy = jest.spyOn(tokenService, 'generateToken')
      .mockRejectedValueOnce(new Error('Failed to generate authentication token'));

    const first = await request(app).post('/api/auth/register').send(body);
    expect(first.status).toBeGreaterThanOrEqual(500);
    spy.mockRestore();

    // Mint works again (stateful CA fake from tests/setup.js) → retry succeeds.
    const retry = await request(app).post('/api/auth/register').send(body);
    expect(retry.status).toBe(201);
    expect(retry.body.token).toBeTruthy();
    expect(retry.body.user.email).toBe(body.email);

    const user = await models.User.findOne({ where: { email: body.email } });
    expect(user).toBeTruthy();
  });
});
