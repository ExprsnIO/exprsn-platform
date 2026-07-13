/**
 * §6c — Idempotency / resume-forward.
 *
 *  • Same idempotencyKey after a completed run → short-circuits, identical ids,
 *    creates NOTHING new (row counts unchanged).
 *  • Crash after S3 (ledger cursor='S3', in_progress, S4+ artifacts absent) →
 *    re-invoke resumes at S4, completes, no duplicate org / CA group / cert.
 *  • Natural-key idempotency: a pre-existing owner user (same email) is reused
 *    (ownerUserCreated=false), no duplicate user.
 *
 * REAL auth Sequelize writes (dedicated test DB) + mocked CA/nexus/spark fakes.
 */

'use strict';

const { provisionOrganization } = require('../engine');
const { setupDatabase, clearDatabase, seedSystemRoles, teardownDatabase } = require('./helpers/db');
const caState = require('./fakes/caState');
const fakeDir = require('./fakes/fakeDirectory');
const fakeCert = require('./fakes/fakeCertificate');

// 'personal' keeps CA-artifact accounting simple (no RBAC groups, no nexus/spark).
function input(key) {
  return {
    idempotencyKey: key,
    type: 'personal',
    organization: { name: 'Idem Org', description: 'idempotency subject' },
    owner: { email: 'idem-owner@example.com', displayName: 'Idem Owner' }
  };
}

describe('§6c idempotency / resume-forward', () => {
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

  test('same idempotencyKey after success → short-circuit, identical ids, nothing new', async () => {
    const first = await provisionOrganization(input('idem-shortcircuit'));
    expect(first.status).toBe('completed');

    const orgsAfterFirst = await db.Organization.count();
    const certsAfterFirst = caState.state.certs.size;
    const tokensAfterFirst = caState.state.tokens.size;
    const runsAfterFirst = await db.ProvisioningRun.count();

    // Do NOT reset caState between these two calls (only setup.js's beforeEach does).
    const second = await provisionOrganization(input('idem-shortcircuit'));

    expect(second.status).toBe('completed');
    // Identical ids returned from the ledger.
    expect(second.runId).toBe(first.runId);
    expect(second.organizationId).toBe(first.organizationId);
    expect(second.caGroupId).toBe(first.caGroupId);
    expect(second.intermediateCertId).toBe(first.intermediateCertId);
    expect(second.ownerCertId).toBe(first.ownerCertId);
    expect(second.ownerTokenId).toBe(first.ownerTokenId);
    // Nothing new was created.
    expect(await db.Organization.count()).toBe(orgsAfterFirst);
    expect(caState.state.certs.size).toBe(certsAfterFirst);
    expect(caState.state.tokens.size).toBe(tokensAfterFirst);
    expect(await db.ProvisioningRun.count()).toBe(runsAfterFirst);
  });

  test('crash after S3 → re-invoke resumes at S4 and completes with no duplicate org/group/cert', async () => {
    const first = await provisionOrganization(input('idem-resume'));
    expect(first.status).toBe('completed');
    const origCaGroupId = first.caGroupId;

    // ── Simulate a crash right after S3: the org/member/role + CA directory group
    //    are committed and the ledger cursor is 'S3', but no S4+ artifact exists. ─
    const orgRun = await db.ProvisioningRun.findByPk(first.runId);
    orgRun.cursor = 'S3';
    orgRun.status = 'in_progress';
    orgRun.ids = {
      organizationId: first.organizationId,
      caGroupId: first.caGroupId,
      caGroupCreated: true,
      ownerUserId: first.ownerUserId,
      ownerUserCreated: true
    };
    orgRun.changed('ids', true);
    await orgRun.save();
    // The per-member (S5) run never happened in a crash-after-S3 → remove it.
    await db.ProvisioningRun.destroy({ where: { kind: 'member' }, force: true });
    // S4+ CA artifacts (certs, tokens) were never created; the S2 directory group survives.
    caState.state.certs.clear();
    caState.state.tokens.clear();

    // S2 must NOT re-run on resume (cursor already past it).
    const dirSpy = jest.spyOn(fakeDir, 'ensureOrgDirectoryGroup');

    const second = await provisionOrganization(input('idem-resume'));

    expect(second.status).toBe('completed');
    expect(dirSpy).not.toHaveBeenCalled(); // S1/S2/S3 skipped
    // Same org + same CA directory group (not recreated).
    expect(second.organizationId).toBe(first.organizationId);
    expect(second.caGroupId).toBe(origCaGroupId);
    expect(await db.Organization.count({ where: { id: first.organizationId } })).toBe(1);
    expect(caState.state.groupById.size).toBe(1);
    // S4/S5 freshly re-created exactly one intermediate + one entity cert + one token.
    expect(second.intermediateCertId).toBeTruthy();
    expect(caState.state.certs.get(second.intermediateCertId).status).toBe('active');
    expect(caState.state.certs.size).toBe(2);
    expect(caState.state.tokens.size).toBe(1);
    // No duplicate org rows for the slug.
    expect(await db.Organization.count({ paranoid: false, where: { slug: 'idem-org' } })).toBe(1);
  });

  test('retry after a compensated failure RESTARTS from S1 (does not resume onto destroyed resources)', async () => {
    // First attempt: inject a one-time S4 (intermediate CA) failure so S1–S3
    // succeed and are then compensated (org + owner user + CA directory group
    // all removed). This is the exact state the resume/idempotency contract must
    // NOT resume-forward over.
    jest.spyOn(fakeCert, 'createIntermediateCertificate').mockRejectedValueOnce(new Error('injected-S4'));

    const first = await provisionOrganization(input('idem-retry-after-comp'));
    expect(first.status).toBe('failed');
    expect(first.error.step).toBe('S4');
    // Compensation unwound S3/S2/S1: no org, no owner user, no CA directory group.
    expect(await db.Organization.count({ paranoid: false, where: { slug: 'idem-org' } })).toBe(0);
    expect(await db.User.count({ where: { email: 'idem-owner@example.com' } })).toBe(0);
    expect(caState.state.groupById.size).toBe(0);

    // Second attempt: SAME idempotencyKey, spy exhausted (real fake now succeeds).
    // The run must RESTART at S1 on a clean slate — before the fix it resumed
    // forward past the (deleted) org/group and bricked.
    const second = await provisionOrganization(input('idem-retry-after-comp'));

    expect(second.status).toBe('completed');
    expect(second.organizationId).toBeTruthy();
    expect(second.caGroupId).toBeTruthy();
    expect(second.intermediateCertId).toBeTruthy();
    expect(second.ownerTokenId).toBeTruthy();
    // Exactly one live org for the slug (the retry's fresh one); no orphan/dupe.
    expect(await db.Organization.count({ where: { slug: 'idem-org' } })).toBe(1);
    expect(await db.User.count({ where: { email: 'idem-owner@example.com' } })).toBe(1);
    // The ledger reused the SAME row (reset in place), not a duplicate.
    expect(second.runId).toBe(first.runId);
    expect(await db.ProvisioningRun.count({ where: { kind: 'org' } })).toBe(1);
  });

  test('natural-key idempotency: a pre-existing owner user is reused, not duplicated', async () => {
    const existing = await db.User.create(
      { email: 'idem-owner@example.com', passwordHash: 'x', emailVerified: true, status: 'active' },
      { hooks: false }
    );

    const result = await provisionOrganization(input('idem-natural'));

    expect(result.status).toBe('completed');
    expect(result.ownerUserId).toBe(existing.id);
    expect(result.ownerUserCreated).toBe(false);
    expect(await db.User.count({ where: { email: 'idem-owner@example.com' } })).toBe(1);
  });
});
