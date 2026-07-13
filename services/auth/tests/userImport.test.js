/**
 * User Import (FEAT-035 slice A) — service-level tests against the ISOLATED
 * exprsn_auth_test DB (never the real exprsn — see CLAUDE.md).
 *
 * Covers: CSV parse (streamed, capped, malformed), per-row validation + the
 * in-file-dup vs DB-existing distinction + the extended report shape; the
 * server-enforced AUTHZ boundary (resolveImportContext) and the owner-import
 * policy; auth_group assignment; nexus_group deferred echo; invite mode; and the
 * per-member credential hook. The authz boundary is tested at the SERVICE level
 * (resolveImportContext) because the HTTP route is additionally gated to platform
 * admins by requireAdminAfterCA — the org-admin boundary lives in the service.
 */

// Mock the cross-module nexus membership service so nexus_group assignment can be
// asserted called/not-called without loading the real nexus stack.
jest.mock('../../nexus/src/services/membershipService', () => ({
  joinGroup: jest.fn().mockResolvedValue({ id: 'nexus-membership' })
}));

const userImportService = require('../src/services/userImportService');
const memberProvisioningService = require('../src/services/memberProvisioningService');
const nexusMembershipService = require('../../nexus/src/services/membershipService');
const {
  setupTestDatabase,
  teardownTestDatabase,
  clearDatabase,
  createTestUser,
  createTestOrganization
} = require('./helpers/testDatabase');

const PLATFORM_ADMIN_EMAIL = 'platform@exprsn.io';

function csv(str) {
  return Buffer.from(str, 'utf-8');
}

/**
 * Build a platform-admin import context for a target org (or none). Uses a REAL
 * actor user id so `addMember`'s invitedBy FK is satisfied.
 */
async function platformCtx(overrides = {}) {
  let actorUserId = overrides.actorUserId;
  if (!actorUserId) {
    const actor = await createTestUser({ email: `pa-${Date.now()}-${Math.floor(Math.random() * 1e6)}@x.io` });
    actorUserId = actor.id;
  }
  return userImportService.resolveImportContext({
    actorEmail: PLATFORM_ADMIN_EMAIL,
    organizationId: overrides.organizationId || null,
    defaultRole: overrides.defaultRole,
    mode: overrides.mode,
    provisionCredentials: overrides.provisionCredentials,
    allowOwner: overrides.allowOwner,
    actorUserId
  });
}

describe('User import (FEAT-035)', () => {
  let models;
  const originalPlatformEmails = process.env.PLATFORM_ADMIN_EMAILS;

  beforeAll(async () => {
    const db = await setupTestDatabase();
    models = db.models;
    process.env.PLATFORM_ADMIN_EMAILS = PLATFORM_ADMIN_EMAIL;
  });

  afterAll(async () => {
    process.env.PLATFORM_ADMIN_EMAILS = originalPlatformEmails;
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
    jest.clearAllMocks();
    delete process.env.USER_IMPORT_NEXUS_ASSIGN;
  });

  // ─── CSV parsing ───────────────────────────────────────────────────────────

  describe('parseCsvBuffer', () => {
    test('normalizes headers to snake_case and returns keyed rows', async () => {
      const rows = await userImportService.parseCsvBuffer(
        csv('Email,Display Name,Status\na@x.io,Alice,active\n')
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].email).toBe('a@x.io');
      expect(rows[0].display_name).toBe('Alice');
      expect(rows[0].status).toBe('active');
    });

    test('header-only CSV → zero data rows (route maps to EMPTY_IMPORT)', async () => {
      const rows = await userImportService.parseCsvBuffer(csv('email,status\n'));
      expect(rows).toHaveLength(0);
    });

    test('malformed CSV (unterminated quote) → IMPORT_PARSE_ERROR 400', async () => {
      let thrown = null;
      try {
        await userImportService.parseCsvBuffer(csv('email\n"unterminated,\n'));
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeTruthy();
      expect(thrown.errorCode).toBe('IMPORT_PARSE_ERROR');
      expect(thrown.statusCode).toBe(400);
    });

    test('caps parsing at MAX_IMPORT_ROWS + 1 so overflow is detectable (413 seam)', async () => {
      const header = 'email\n';
      const body = Array.from({ length: 2500 }, (_, i) => `u${i}@x.io`).join('\n');
      const rows = await userImportService.parseCsvBuffer(csv(header + body));
      expect(rows).toHaveLength(userImportService.MAX_IMPORT_ROWS + 1);
      expect(rows.length).toBeGreaterThan(userImportService.MAX_IMPORT_ROWS);
    });
  });

  // ─── Validation / dedup / report shape ─────────────────────────────────────

  describe('runImport validation + dedup + report shape', () => {
    test('mixed CSV: valid / bad-email / bad-status / in-file-dup / DB-existing', async () => {
      await models.User.create(
        { email: 'exists@x.io', status: 'active', passwordHash: 'x' },
        { hooks: false }
      );

      const buffer = csv(
        [
          'email,display_name,status',
          'good@x.io,Good,active',
          'bademail,Bad,active',
          'badstatus@x.io,Bad,frozen',
          'dup@x.io,Dup1,active',
          'dup@x.io,Dup2,active',
          'exists@x.io,Existing,active'
        ].join('\n')
      );

      const rows = await userImportService.parseCsvBuffer(buffer);
      const ctx = await platformCtx();
      const report = await userImportService.runImport(rows, ctx);

      expect(report.created).toBe(2);
      expect(report.skipped).toBe(2);
      expect(report.failed).toBe(2);
      expect(report.invited).toBe(0);
      expect(report.organizationId).toBeNull();
      expect(report.rows).toHaveLength(6);

      const [r1, r2, r3, r4, r5, r6] = report.rows;
      expect(r1).toMatchObject({ row: 1, email: 'good@x.io', outcome: 'created' });
      expect(r2).toMatchObject({ row: 2, outcome: 'failed', reason: 'Invalid email' });
      expect(r3).toMatchObject({ row: 3, email: 'badstatus@x.io', outcome: 'failed', reason: 'Invalid status' });
      expect(r4).toMatchObject({ row: 4, email: 'dup@x.io', outcome: 'created' });
      // In-file dup vs DB-existing carry DISTINCT reasons.
      expect(r5).toMatchObject({ row: 5, outcome: 'skipped', reason: 'Duplicate row in file' });
      expect(r6).toMatchObject({ row: 6, outcome: 'skipped', reason: 'Already exists' });

      // Per-row extended fields present on a created row.
      expect(r1).toHaveProperty('orgRole', 'member');
      expect(r1).toHaveProperty('authGroup', null);
      expect(r1).toHaveProperty('nexusGroup', null);
      expect(r1).toHaveProperty('credentialsIssued', false);
    });

    test('defaultRole is applied when a row omits role', async () => {
      const rows = await userImportService.parseCsvBuffer(csv('email\nx@x.io\n'));
      const ctx = await platformCtx({ defaultRole: 'admin' });
      const report = await userImportService.runImport(rows, ctx);
      expect(report.rows[0].orgRole).toBe('admin');
    });
  });

  // ─── AUTHZ boundary (resolveImportContext) ─────────────────────────────────

  describe('resolveImportContext authz boundary', () => {
    test('org admin importing into a DIFFERENT org → 403 ORG_FORBIDDEN', async () => {
      const admin = await createTestUser({ email: 'admin-a@x.io' });
      const orgA = await createTestOrganization({ ownerId: admin.id });
      const orgB = await createTestOrganization({ slug: `org-b-${Date.now()}` });
      await models.OrganizationMember.create({
        organizationId: orgA.id, userId: admin.id, role: 'admin', status: 'active'
      });

      let thrown = null;
      try {
        await userImportService.resolveImportContext({
          actorUserId: admin.id, actorEmail: 'admin-a@x.io', organizationId: orgB.id
        });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeTruthy();
      expect(thrown.errorCode).toBe('ORG_FORBIDDEN');
      expect(thrown.statusCode).toBe(403);
    });

    test('SECURITY — an ORG-scoped role named "admin" does NOT confer platform admin (no cross-tenant bypass)', async () => {
      // Regression for the FEAT-035 critical finding: a self-mintable org-scoped
      // 'admin' role must never read as platform super-admin (which would let its
      // holder import into ANY org). The holder is a legitimate admin of org A only.
      const attacker = await createTestUser({ email: 'org-scoped-admin@x.io' });
      const orgA = await createTestOrganization({ ownerId: attacker.id });
      const orgB = await createTestOrganization({ slug: `org-b2-${Date.now()}` });
      await models.OrganizationMember.create({
        organizationId: orgA.id, userId: attacker.id, role: 'admin', status: 'active'
      });
      const adminRole = await models.Role.create({
        name: 'admin', slug: `custom-admin-${Date.now()}`, type: 'custom'
      });
      await models.UserRole.create({
        userId: attacker.id, roleId: adminRole.id,
        scope: 'organization', organizationId: orgA.id, status: 'active'
      });

      // Targeting org B → the org-scoped 'admin' role is NOT platform admin →
      // treated as an org outsider → 403 (pre-fix this would have bypassed).
      await expect(
        userImportService.resolveImportContext({
          actorUserId: attacker.id, actorEmail: 'org-scoped-admin@x.io', organizationId: orgB.id
        })
      ).rejects.toMatchObject({ errorCode: 'ORG_FORBIDDEN' });
    });

    test('plain member (non-admin) of the target org → 403 ORG_FORBIDDEN', async () => {
      const member = await createTestUser({ email: 'plain@x.io' });
      const org = await createTestOrganization();
      await models.OrganizationMember.create({
        organizationId: org.id, userId: member.id, role: 'member', status: 'active'
      });

      await expect(
        userImportService.resolveImportContext({
          actorUserId: member.id, actorEmail: 'plain@x.io', organizationId: org.id
        })
      ).rejects.toMatchObject({ errorCode: 'ORG_FORBIDDEN' });
    });

    test('org admin with NO organizationId → 400 ORG_REQUIRED', async () => {
      const admin = await createTestUser({ email: 'noorg@x.io' });
      await expect(
        userImportService.resolveImportContext({
          actorUserId: admin.id, actorEmail: 'noorg@x.io', organizationId: null
        })
      ).rejects.toMatchObject({ errorCode: 'ORG_REQUIRED', statusCode: 400 });
    });

    test('provisionCredentials with no org → 400 ORG_REQUIRED (platform admin)', async () => {
      await expect(
        userImportService.resolveImportContext({
          actorUserId: 'p', actorEmail: PLATFORM_ADMIN_EMAIL,
          organizationId: null, provisionCredentials: true
        })
      ).rejects.toMatchObject({ errorCode: 'ORG_REQUIRED' });
    });

    test('org admin of the target org resolves with actorOrgRole=admin', async () => {
      const admin = await createTestUser({ email: 'ok-admin@x.io' });
      const org = await createTestOrganization({ ownerId: admin.id });
      await models.OrganizationMember.create({
        organizationId: org.id, userId: admin.id, role: 'admin', status: 'active'
      });
      const ctx = await userImportService.resolveImportContext({
        actorUserId: admin.id, actorEmail: 'ok-admin@x.io', organizationId: org.id
      });
      expect(ctx.actorIsPlatformAdmin).toBe(false);
      expect(ctx.actorOrgRole).toBe('admin');
      expect(ctx.targetOrgId).toBe(org.id);
    });

    test('platform admin resolves without an org and bypasses org membership', async () => {
      const ctx = await platformCtx();
      expect(ctx.actorIsPlatformAdmin).toBe(true);
      expect(ctx.actorOrgRole).toBe('owner');
      expect(ctx.targetOrgId).toBeNull();
    });
  });

  // ─── Role ceiling + owner-import policy (runImport) ─────────────────────────

  describe('role ceiling + owner-import policy', () => {
    test('org admin: owner row rejected, sibling admin/member rows created', async () => {
      const admin = await createTestUser({ email: 'ceil-admin@x.io' });
      const org = await createTestOrganization({ ownerId: admin.id });
      await models.OrganizationMember.create({
        organizationId: org.id, userId: admin.id, role: 'admin', status: 'active'
      });
      const ctx = await userImportService.resolveImportContext({
        actorUserId: admin.id, actorEmail: 'ceil-admin@x.io', organizationId: org.id
      });

      const rows = await userImportService.parseCsvBuffer(csv(
        [
          'email,role',
          'boss@x.io,owner',
          'peer@x.io,admin',
          'grunt@x.io,member'
        ].join('\n')
      ));
      const report = await userImportService.runImport(rows, ctx);

      expect(report.rows[0]).toMatchObject({
        email: 'boss@x.io', outcome: 'failed', reason: 'owner cannot be assigned via import'
      });
      expect(report.rows[1]).toMatchObject({ email: 'peer@x.io', outcome: 'created', orgRole: 'admin' });
      expect(report.rows[2]).toMatchObject({ email: 'grunt@x.io', outcome: 'created', orgRole: 'member' });
      expect(report.created).toBe(2);
      expect(report.failed).toBe(1);
    });

    test('platform admin WITHOUT allowOwner: owner row still rejected', async () => {
      const org = await createTestOrganization();
      const ctx = await platformCtx({ organizationId: org.id });
      const rows = await userImportService.parseCsvBuffer(csv('email,role\nboss@x.io,owner\n'));
      const report = await userImportService.runImport(rows, ctx);
      expect(report.rows[0]).toMatchObject({
        outcome: 'failed', reason: 'owner cannot be assigned via import'
      });
    });

    test('platform admin WITH allowOwner: owner row created, Organization.ownerId untouched', async () => {
      const org = await createTestOrganization();
      const originalOwnerId = org.ownerId;
      const ctx = await platformCtx({ organizationId: org.id, allowOwner: true });
      const rows = await userImportService.parseCsvBuffer(csv('email,role\nnewboss@x.io,owner\n'));
      const report = await userImportService.runImport(rows, ctx);

      expect(report.rows[0]).toMatchObject({ email: 'newboss@x.io', outcome: 'created', orgRole: 'owner' });

      // Membership role is owner, but the org's ownerId is NOT transferred.
      const created = await models.User.findOne({ where: { email: 'newboss@x.io' } });
      const membership = await models.OrganizationMember.findOne({
        where: { organizationId: org.id, userId: created.id }
      });
      expect(membership.role).toBe('owner');
      await org.reload();
      expect(org.ownerId).toBe(originalOwnerId);
    });
  });

  // ─── addMember role-appropriate grant (the fixed bug) ──────────────────────

  describe('addMember grants the role-appropriate system role', () => {
    test('admin member gets org-admin (not org-member); guest gets none', async () => {
      const org = await createTestOrganization();
      // Seed the org-scoped system roles.
      await models.Role.create({ name: 'Org Admin', slug: 'org-admin', type: 'system' });
      await models.Role.create({ name: 'Org Member', slug: 'org-member', type: 'system' });

      const adminUser = await createTestUser({ email: 'grant-admin@x.io' });
      const guestUser = await createTestUser({ email: 'grant-guest@x.io' });

      await require('../src/services/organizationService').addMember(org.id, adminUser.id, { role: 'admin' });
      await require('../src/services/organizationService').addMember(org.id, guestUser.id, { role: 'guest' });

      const adminRole = await models.Role.findOne({ where: { slug: 'org-admin' } });
      const memberRole = await models.Role.findOne({ where: { slug: 'org-member' } });

      const adminGrant = await models.UserRole.findOne({
        where: { userId: adminUser.id, roleId: adminRole.id, organizationId: org.id }
      });
      expect(adminGrant).toBeTruthy();
      const wrongGrant = await models.UserRole.findOne({
        where: { userId: adminUser.id, roleId: memberRole.id, organizationId: org.id }
      });
      expect(wrongGrant).toBeNull();

      // Guest → membership only, no elevated UserRole.
      const guestGrants = await models.UserRole.count({ where: { userId: guestUser.id, organizationId: org.id } });
      expect(guestGrants).toBe(0);
    });
  });

  // ─── auth_group / nexus_group ──────────────────────────────────────────────

  describe('group assignment', () => {
    test('existing auth_group → membership added + slug echoed', async () => {
      const org = await createTestOrganization();
      const group = await models.Group.create({
        name: 'Engineers', slug: 'engineers', organizationId: org.id, type: 'organization'
      });
      const ctx = await platformCtx({ organizationId: org.id });

      const rows = await userImportService.parseCsvBuffer(csv('email,auth_group\neng@x.io,engineers\n'));
      const report = await userImportService.runImport(rows, ctx);

      expect(report.rows[0]).toMatchObject({ outcome: 'created', authGroup: 'engineers' });
      const user = await models.User.findOne({ where: { email: 'eng@x.io' } });
      const membership = await models.UserGroup.findOne({ where: { userId: user.id, groupId: group.id } });
      expect(membership).toBeTruthy();
    });

    test('nonexistent auth_group → user still created, authGroup null + reason', async () => {
      const org = await createTestOrganization();
      const ctx = await platformCtx({ organizationId: org.id });
      const rows = await userImportService.parseCsvBuffer(csv('email,auth_group\nghost@x.io,ghosts\n'));
      const report = await userImportService.runImport(rows, ctx);

      expect(report.rows[0].outcome).toBe('created');
      expect(report.rows[0].authGroup).toBeNull();
      expect(report.rows[0].reason).toContain('auth_group not found');
    });

    test('nexus_group with flag OFF → echoed as deferred, joinGroup NOT called', async () => {
      const org = await createTestOrganization();
      const ctx = await platformCtx({ organizationId: org.id });
      const rows = await userImportService.parseCsvBuffer(csv('email,nexus_group\nnx@x.io,team-1\n'));
      const report = await userImportService.runImport(rows, ctx);

      expect(report.rows[0]).toMatchObject({ outcome: 'created', nexusGroup: 'team-1' });
      expect(nexusMembershipService.joinGroup).not.toHaveBeenCalled();
    });

    test('nexus_group with flag ON → joinGroup called with the parsed value', async () => {
      process.env.USER_IMPORT_NEXUS_ASSIGN = 'true';
      const org = await createTestOrganization();
      const ctx = await platformCtx({ organizationId: org.id });
      const rows = await userImportService.parseCsvBuffer(csv('email,nexus_group\nnx2@x.io,team-9\n'));
      const report = await userImportService.runImport(rows, ctx);

      expect(report.rows[0].outcome).toBe('created');
      const user = await models.User.findOne({ where: { email: 'nx2@x.io' } });
      expect(nexusMembershipService.joinGroup).toHaveBeenCalledWith(user.id, 'team-9', {});
    });
  });

  // ─── invite mode + credential hook (gated seams) ───────────────────────────

  describe('invite mode + credential hook', () => {
    test('mode=invite → user created inactive + activation invite minted; outcome invited', async () => {
      const org = await createTestOrganization();
      const ctx = await platformCtx({ organizationId: org.id, mode: 'invite' });
      const rows = await userImportService.parseCsvBuffer(csv('email\ninvitee@x.io\n'));
      const report = await userImportService.runImport(rows, ctx);

      expect(report.invited).toBe(1);
      expect(report.created).toBe(0);
      expect(report.rows[0]).toMatchObject({ email: 'invitee@x.io', outcome: 'invited', orgRole: 'member' });

      const user = await models.User.findOne({ where: { email: 'invitee@x.io' } });
      expect(user.status).toBe('inactive');
      const invite = await models.Invitation.findOne({ where: { userId: user.id } });
      expect(invite).toBeTruthy();
      expect(invite.kind).toBe('activation');
    });

    test('provisionCredentials=true → hook invoked, credentialsIssued true', async () => {
      const org = await createTestOrganization();
      const spy = jest
        .spyOn(memberProvisioningService, 'provisionMemberCredentials')
        .mockResolvedValue({ certId: 'c1', tokenId: 't1' });

      const ctx = await platformCtx({ organizationId: org.id, provisionCredentials: true });
      const rows = await userImportService.parseCsvBuffer(csv('email,role\ncred@x.io,member\n'));
      const report = await userImportService.runImport(rows, ctx);

      expect(report.rows[0]).toMatchObject({ outcome: 'created', credentialsIssued: true });
      const user = await models.User.findOne({ where: { email: 'cred@x.io' } });
      expect(spy).toHaveBeenCalledWith(org.id, user.id, 'member');
      spy.mockRestore();
    });

    test('credential hook failure → row still created, credentialsIssued false + reason', async () => {
      const org = await createTestOrganization();
      const spy = jest
        .spyOn(memberProvisioningService, 'provisionMemberCredentials')
        .mockRejectedValue(new Error('CA offline'));

      const ctx = await platformCtx({ organizationId: org.id, provisionCredentials: true });
      const rows = await userImportService.parseCsvBuffer(csv('email\ncredfail@x.io\n'));
      const report = await userImportService.runImport(rows, ctx);

      expect(report.rows[0].outcome).toBe('created');
      expect(report.rows[0].credentialsIssued).toBe(false);
      expect(report.rows[0].reason).toContain('credentialing failed');
      spy.mockRestore();
    });
  });
});
