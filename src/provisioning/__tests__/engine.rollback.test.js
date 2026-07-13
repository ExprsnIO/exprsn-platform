/**
 * §6b — ROLLBACK MATRIX (the core).
 *
 * Inject a failure at each of S1..S6 and assert LIFO compensation leaves ZERO
 * orphans: the auth side (real Sequelize) is fully unwound, and CA certs are
 * REVOKED (row present, status='revoked'), never deleted. Plus: a failing
 * compensator parks the run in 'compensation_failed' and never throws uncaught.
 *
 * Failure injection = jest.spyOn on the SAME singleton the engine/hook require
 * lazily (the CA fakes, or the shared auth models), with mockRejectedValueOnce.
 */

'use strict';

const { provisionOrganization } = require('../engine');
const { setupDatabase, clearDatabase, seedSystemRoles, teardownDatabase } = require('./helpers/db');
const caState = require('./fakes/caState');
const fakeCert = require('./fakes/fakeCertificate');
const fakeDir = require('./fakes/fakeDirectory');
const fakeToken = require('./fakes/fakeToken');
const fakeNexus = require('./fakes/fakeNexusGroup');

const SLUG = 'rollback-org';

function input(key) {
  return {
    idempotencyKey: key,
    type: 'team',
    organization: { name: 'Rollback Org', description: 'to be rolled back' },
    owner: { email: 'rb-owner@example.com', displayName: 'RB Owner' }
  };
}

async function authOrphanCounts(db) {
  return {
    orgs: await db.Organization.count({ paranoid: false, where: { slug: SLUG } }),
    members: await db.OrganizationMember.count(),
    userRoles: await db.UserRole.count({ where: { scope: 'organization' } }),
    groups: await db.Group.count(),
    groupRoles: await db.GroupRole.count()
  };
}

describe('§6b rollback matrix', () => {
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

  test('S1 mid-phase (UserRole.create throws) → auth txn fully rolled back, no cursor', async () => {
    jest.spyOn(db.UserRole, 'create').mockRejectedValueOnce(new Error('boom-userrole'));

    const result = await provisionOrganization(input('rb-s1'));

    expect(result.status).toBe('failed');
    expect(result.error.step).toBe('S1');
    // The whole S1 transaction rolled back — nothing landed.
    expect(await authOrphanCounts(db)).toEqual({ orgs: 0, members: 0, userRoles: 0, groups: 0, groupRoles: 0 });
    // The owner user was created inside the same txn → also rolled back.
    expect(await db.User.count({ where: { email: 'rb-owner@example.com' } })).toBe(0);
    // No CA writes reached.
    expect(caState.state.groupById.size).toBe(0);
    expect(caState.state.certs.size).toBe(0);
    // Ledger failed, cursor never advanced past S1.
    const run = await db.ProvisioningRun.findByPk(result.runId);
    expect(run.status).toBe('failed');
    expect(run.cursor).toBeNull();
  });

  test('S1 rollback preserves a PRE-EXISTING owner user', async () => {
    const existing = await db.User.create({
      email: 'rb-owner@example.com', passwordHash: 'x', emailVerified: true, status: 'active'
    }, { hooks: false });
    jest.spyOn(db.UserRole, 'create').mockRejectedValueOnce(new Error('boom-userrole'));

    const result = await provisionOrganization(input('rb-s1b'));

    expect(result.status).toBe('failed');
    // Pre-existing user must NOT be deleted (ownerUserCreated=false).
    expect(await db.User.findByPk(existing.id)).toBeTruthy();
    expect(await authOrphanCounts(db)).toEqual({ orgs: 0, members: 0, userRoles: 0, groups: 0, groupRoles: 0 });
  });

  test('S2 (directory group) fails → S1 fully unwound, slug freed, no CA group', async () => {
    jest.spyOn(fakeDir, 'ensureOrgDirectoryGroup').mockRejectedValueOnce(new Error('boom-directory'));

    const result = await provisionOrganization(input('rb-s2'));

    expect(result.status).toBe('failed');
    expect(result.error.step).toBe('S2');
    expect(await authOrphanCounts(db)).toEqual({ orgs: 0, members: 0, userRoles: 0, groups: 0, groupRoles: 0 });
    expect(await db.User.count()).toBe(0); // created owner unwound
    expect(caState.state.groupById.size).toBe(0);
  });

  test('S3 (linkage update) fails → S2 + S1 unwound (CA group deleted)', async () => {
    jest.spyOn(db.Organization, 'update').mockRejectedValueOnce(new Error('boom-linkage'));

    const result = await provisionOrganization(input('rb-s3'));

    expect(result.status).toBe('failed');
    expect(result.error.step).toBe('S3');
    expect(await authOrphanCounts(db)).toEqual({ orgs: 0, members: 0, userRoles: 0, groups: 0, groupRoles: 0 });
    // S2 compensation deleted the CA directory group + its membership.
    expect(caState.state.groupById.size).toBe(0);
    expect(caState.state.members).toHaveLength(0);
    expect(caState.state.certs.size).toBe(0);
  });

  test('S4 (intermediate cert) fails → S3/S2/S1 unwound, no cert created', async () => {
    jest.spyOn(fakeCert, 'createIntermediateCertificate').mockRejectedValueOnce(new Error('boom-intermediate'));

    const result = await provisionOrganization(input('rb-s4'));

    expect(result.status).toBe('failed');
    expect(result.error.step).toBe('S4');
    expect(await authOrphanCounts(db)).toEqual({ orgs: 0, members: 0, userRoles: 0, groups: 0, groupRoles: 0 });
    expect(caState.state.groupById.size).toBe(0);
    expect(caState.state.certs.size).toBe(0);
  });

  test('S5 (owner entity cert) fails → intermediate REVOKED (not deleted) + S3/S2/S1 unwound', async () => {
    jest.spyOn(fakeCert, 'createEntityCertificate').mockRejectedValueOnce(new Error('boom-entity'));

    const result = await provisionOrganization(input('rb-s5'));

    expect(result.status).toBe('failed');
    expect(result.error.step).toBe('S5');
    expect(await authOrphanCounts(db)).toEqual({ orgs: 0, members: 0, userRoles: 0, groups: 0, groupRoles: 0 });
    expect(caState.state.groupById.size).toBe(0);
    // The S4 intermediate is REVOKED, not deleted — the row survives, inert.
    expect(result.intermediateCertId).toBeTruthy();
    const intermediate = caState.state.certs.get(result.intermediateCertId);
    expect(intermediate).toBeTruthy();
    expect(intermediate.status).toBe('revoked');
    // No live entity cert or token leaked.
    expect(caState.state.tokens.size).toBe(0);
  });

  test('S6 (token) fails → owner cert AND intermediate REVOKED, S3/S2/S1 unwound', async () => {
    jest.spyOn(fakeToken, 'generateToken').mockRejectedValueOnce(new Error('boom-token'));

    const result = await provisionOrganization(input('rb-s6'));

    // Engine surfaces this as the S5 step (the member hook fuses ADR S5+S6).
    expect(result.status).toBe('failed');
    expect(result.error.step).toBe('S5');
    expect(await authOrphanCounts(db)).toEqual({ orgs: 0, members: 0, userRoles: 0, groups: 0, groupRoles: 0 });
    expect(caState.state.groupById.size).toBe(0);
    // Both certs present-but-revoked (the hook self-revokes the entity cert on
    // token failure; S4 compensation revokes the intermediate). No live token.
    expect(caState.state.certs.size).toBe(2);
    for (const cert of caState.state.certs.values()) {
      expect(cert.status).toBe('revoked');
    }
    expect(caState.state.tokens.size).toBe(0);
  });

  test('S7 (nexus group) fails → S5 cert+token REVOKED, S4 intermediate REVOKED, S3/S2/S1 unwound', async () => {
    // team template has nexus.create=true, so S7 runs. Fail it and assert the full
    // LIFO unwind: certs revoked-not-deleted, token revoked, auth side gone, no
    // nexus group or spark channel leaked.
    jest.spyOn(fakeNexus, 'createGroup').mockRejectedValueOnce(new Error('boom-nexus'));

    const result = await provisionOrganization(input('rb-s7'));

    expect(result.status).toBe('failed');
    expect(result.error.step).toBe('S7');
    expect(await authOrphanCounts(db)).toEqual({ orgs: 0, members: 0, userRoles: 0, groups: 0, groupRoles: 0 });
    expect(caState.state.groupById.size).toBe(0); // CA directory group deleted (S2 comp)
    // S5 owner cert + S4 intermediate present-but-revoked; S6 token revoked.
    expect(caState.state.certs.size).toBe(2);
    for (const cert of caState.state.certs.values()) {
      expect(cert.status).toBe('revoked');
    }
    const token = caState.state.tokens.get(result.ownerTokenId);
    expect(token.status).toBe('revoked');
    // No nexus group / spark channel leaked.
    expect(caState.state.nexusGroupById.size).toBe(0);
    expect(caState.state.sparkChannelsByGroup.size).toBe(0);
  });

  test('compensation itself fails (cert revoke rejects) → status=compensation_failed, no uncaught throw, residual recorded', async () => {
    // Fail S5 so the intermediate needs revoking, then make that revoke reject
    // with a NON-"already revoked" error → the compensator surfaces a residual.
    jest.spyOn(fakeCert, 'createEntityCertificate').mockRejectedValueOnce(new Error('boom-entity'));
    jest.spyOn(fakeCert, 'revokeCertificate').mockRejectedValueOnce(new Error('CRL write failed'));

    // Must resolve (never throw) even though a compensator failed.
    const result = await provisionOrganization(input('rb-compfail'));

    expect(result.status).toBe('compensation_failed');
    // Auth side still fully unwound (later compensators keep running LIFO).
    expect(await authOrphanCounts(db)).toEqual({ orgs: 0, members: 0, userRoles: 0, groups: 0, groupRoles: 0 });
    expect(caState.state.groupById.size).toBe(0);
    // The intermediate could NOT be revoked → left active (safe-failed residual).
    const intermediate = caState.state.certs.get(result.intermediateCertId);
    expect(intermediate.status).toBe('active');
    // Ledger parked in compensation_failed with the residual error recorded.
    const run = await db.ProvisioningRun.findByPk(result.runId);
    expect(run.status).toBe('compensation_failed');
    expect(run.error.compensation).toBeTruthy();
    expect(run.ids.S4CompensationError).toMatch(/CRL write failed/);
  });
});
