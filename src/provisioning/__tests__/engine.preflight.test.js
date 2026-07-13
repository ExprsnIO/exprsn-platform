/**
 * §6d — S0 preflight aborts (fail BEFORE any provisioning write).
 *
 *  • No active platform root        → NO_PLATFORM_ROOT
 *  • Root signing key unavailable   → CA_KEY_STORAGE_UNAVAILABLE
 *  • Missing org system roles       → SYSTEM_ROLES_MISSING
 *
 * Each asserts the AppError code AND that zero writes landed (no org row, no
 * ledger row — the ledger findOrCreate runs only AFTER preflight passes).
 */

'use strict';

const { provisionOrganization } = require('../engine');
const { setupDatabase, clearDatabase, seedSystemRoles, teardownDatabase } = require('./helpers/db');
const caState = require('./fakes/caState');

function input(key) {
  return {
    idempotencyKey: key,
    type: 'team',
    organization: { name: 'Preflight Org' },
    owner: { email: 'preflight-owner@example.com' }
  };
}

async function assertNoWrites(db) {
  expect(await db.Organization.count()).toBe(0);
  expect(await db.ProvisioningRun.count()).toBe(0);
  expect(await db.User.count()).toBe(0);
  expect(caState.state.groupById.size).toBe(0);
  expect(caState.state.certs.size).toBe(0);
}

describe('§6d preflight aborts', () => {
  let db;

  beforeAll(async () => {
    db = await setupDatabase();
  });

  afterAll(async () => {
    await teardownDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
    await seedSystemRoles();
  });

  test('no active platform root → NO_PLATFORM_ROOT, zero writes', async () => {
    caState.state.root = null;

    await expect(provisionOrganization(input('pf-no-root')))
      .rejects.toMatchObject({ errorCode: 'NO_PLATFORM_ROOT', statusCode: 409 });

    await assertNoWrites(db);
  });

  test('root signing key unavailable → CA_KEY_STORAGE_UNAVAILABLE, zero writes', async () => {
    caState.state.keyUsable = false; // root present + active, but key storage broken

    await expect(provisionOrganization(input('pf-no-key')))
      .rejects.toMatchObject({ errorCode: 'CA_KEY_STORAGE_UNAVAILABLE', statusCode: 409 });

    await assertNoWrites(db);
  });

  test('missing org system roles → SYSTEM_ROLES_MISSING, zero writes', async () => {
    // Roles were seeded in beforeEach; remove them so the preflight role check trips.
    await db.UserRole.destroy({ where: {}, force: true });
    await db.Role.destroy({ where: {}, force: true });

    await expect(provisionOrganization(input('pf-no-roles')))
      .rejects.toMatchObject({ errorCode: 'SYSTEM_ROLES_MISSING', statusCode: 409 });

    await assertNoWrites(db);
  });
});
