/**
 * §6e — Token-validates-through-the-linkage + SCOPE_INACTIVE lever (QA AC).
 *
 * After a provision, the owner token is scoped to the org's CA directory group
 * (organizationId = caGroupId). validateToken passes while that group is active;
 * deactivating the group (deactivation-as-revocation) flips it to SCOPE_INACTIVE
 * WITHOUT revoking the token itself.
 */

'use strict';

const { provisionOrganization } = require('../engine');
const { setupDatabase, clearDatabase, seedSystemRoles, teardownDatabase } = require('./helpers/db');
const caState = require('./fakes/caState');
const fakeToken = require('./fakes/fakeToken');

describe('§6e linkage / token validates through the linkage', () => {
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

  test('owner token is org-scoped, validates, then SCOPE_INACTIVE when the group is deactivated', async () => {
    const result = await provisionOrganization({
      idempotencyKey: 'linkage-org',
      type: 'team',
      organization: { name: 'Linkage Org' },
      owner: { email: 'linkage-owner@example.com' }
    });
    expect(result.status).toBe('completed');

    // Linkage: Organization.ca_group_id === the token's scope group.
    const org = await db.Organization.findByPk(result.organizationId);
    expect(org.caGroupId).toBe(result.caGroupId);
    const token = caState.state.tokens.get(result.ownerTokenId);
    expect(token.organizationId).toBe(result.caGroupId);

    // Validates while the scope group is active.
    const ok = await fakeToken.validateToken(result.ownerTokenId);
    expect(ok.valid).toBe(true);
    expect(ok.tokenData.organizationId).toBe(result.caGroupId);

    // Deactivation-as-revocation: flip the CA directory group inactive.
    caState.state.groupById.get(result.caGroupId).status = 'inactive';
    const scoped = await fakeToken.validateToken(result.ownerTokenId);
    expect(scoped.valid).toBe(false);
    expect(scoped.error).toBe('SCOPE_INACTIVE');
    // The token row itself is still 'active' — the scope lever, not a revoke.
    expect(caState.state.tokens.get(result.ownerTokenId).status).toBe('active');
  });
});
