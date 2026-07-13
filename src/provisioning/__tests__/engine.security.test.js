/**
 * §6f — Security / mass-assignment guard (end-to-end, at the DB).
 *
 * A hostile client body carrying plan/type/settings/status/caGroupId/metadata on a
 * `personal` provision must NOT escalate: the STORED org takes plan/type/settings
 * from the template, never the client (ADR-0003 Decision 6 / RC-6).
 */

'use strict';

const { provisionOrganization } = require('../engine');
const { setupDatabase, clearDatabase, seedSystemRoles, teardownDatabase } = require('./helpers/db');

describe('§6f mass-assignment guard', () => {
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

  test('client cannot override plan/type/settings/status on a personal provision', async () => {
    const result = await provisionOrganization({
      idempotencyKey: 'sec-org',
      type: 'personal',
      organization: {
        name: 'Sneaky Org',
        description: 'legit field',
        // hostile, non-allowlisted keys:
        plan: 'enterprise',
        type: 'enterprise',
        settings: { requireMfa: true, allowUserRegistration: true },
        status: 'suspended',
        caGroupId: 'attacker-controlled',
        metadata: { escalate: true }
      },
      owner: { email: 'sec-owner@example.com' }
    });
    expect(result.status).toBe('completed');

    const org = await db.Organization.findByPk(result.organizationId);
    // Template (personal) wins on every privileged field.
    expect(org.type).toBe('personal');
    expect(org.plan).toBe('free');
    expect(org.status).toBe('active');
    expect(org.settings.requireMfa).toBe(false);
    expect(org.settings.allowUserRegistration).toBe(false);
    // caGroupId is the REAL provisioned linkage, never the client's string.
    expect(org.caGroupId).toBe(result.caGroupId);
    expect(org.caGroupId).not.toBe('attacker-controlled');
    // The allowlisted description survives.
    expect(org.description).toBe('legit field');
  });
});
