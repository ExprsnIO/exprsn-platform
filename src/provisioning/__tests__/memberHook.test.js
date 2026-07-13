/**
 * §6g — Member-credentialing hook (owner path parity + role correctness).
 *
 * The hook (services/auth/src/services/memberProvisioningService) is the ONE
 * per-member credentialing path — the engine drives the owner through it, and
 * FEAT-035 import will drive additional members through it.
 *
 *  • role:'admin' grants the org-ADMIN UserRole (proves the fix vs addMember's
 *    always-'org-member' bug), and the OrganizationMember role is 'admin'.
 *  • A second call with the same idempotencyKey is idempotent (reused=true, no
 *    duplicate membership / UserRole).
 *  • roleToSystemSlug maps owner/admin/member correctly.
 */

'use strict';

const { provisionOrganization } = require('../engine');
const {
  provisionMemberCredentials,
  roleToSystemSlug
} = require('../../../services/auth/src/services/memberProvisioningService');
const { setupDatabase, clearDatabase, seedSystemRoles, teardownDatabase } = require('./helpers/db');

describe('§6g member provisioning hook', () => {
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

  describe('roleToSystemSlug (unit)', () => {
    test('maps owner/admin/member to their org-scoped system slugs', () => {
      expect(roleToSystemSlug('owner')).toBe('org-owner');
      expect(roleToSystemSlug('admin')).toBe('org-admin');
      expect(roleToSystemSlug('member')).toBe('org-member');
      // guest (and any unknown role) → no elevated org-scoped role (least privilege)
      expect(roleToSystemSlug('guest')).toBeNull();
      expect(roleToSystemSlug('anything-else')).toBeNull();
    });
  });

  describe('credentialing a member of a provisioned org', () => {
    let org;
    let provision;
    let member;

    beforeEach(async () => {
      provision = await provisionOrganization({
        idempotencyKey: 'hook-org',
        type: 'team',
        organization: { name: 'Hook Org' },
        owner: { email: 'hook-owner@example.com' }
      });
      expect(provision.status).toBe('completed');
      org = await db.Organization.findByPk(provision.organizationId);
      member = await db.User.create(
        { email: 'hook-admin@example.com', passwordHash: 'x', emailVerified: true, status: 'active' },
        { hooks: false }
      );
    });

    test("role:'admin' grants the org-admin UserRole and an admin membership", async () => {
      const res = await provisionMemberCredentials(org.id, member.id, 'admin', {
        caGroupId: provision.caGroupId,
        intermediateCertId: provision.intermediateCertId,
        template: { cert: {}, token: {} }
      });

      expect(res.certId).toBeTruthy();
      expect(res.tokenId).toBeTruthy();

      // OrganizationMember role is 'admin' (not defaulted to member).
      const om = await db.OrganizationMember.findOne({ where: { organizationId: org.id, userId: member.id } });
      expect(om).toBeTruthy();
      expect(om.role).toBe('admin');
      expect(om.status).toBe('active');

      // The MATCHING org-admin system role was granted...
      const adminRole = await db.Role.findOne({ where: { slug: 'org-admin', type: 'system' } });
      const adminUserRole = await db.UserRole.findOne({
        where: { userId: member.id, roleId: adminRole.id, organizationId: org.id, scope: 'organization' }
      });
      expect(adminUserRole).toBeTruthy();
      expect(adminUserRole.status).toBe('active');
      expect(res.userRoleId).toBe(adminUserRole.id);

      // ...and NOT the org-member role (the addMember bug would have granted this).
      const memberRole = await db.Role.findOne({ where: { slug: 'org-member', type: 'system' } });
      const wrongUserRole = await db.UserRole.findOne({
        where: { userId: member.id, roleId: memberRole.id, organizationId: org.id, scope: 'organization' }
      });
      expect(wrongUserRole).toBeNull();
    });

    test("role:'guest' creates a guest membership but grants NO elevated org-scoped role", async () => {
      const res = await provisionMemberCredentials(org.id, member.id, 'guest', {
        caGroupId: provision.caGroupId,
        intermediateCertId: provision.intermediateCertId,
        template: { cert: {}, token: {} }
      });

      // Guest still gets a membership row with role 'guest' + credentials.
      const om = await db.OrganizationMember.findOne({ where: { organizationId: org.id, userId: member.id } });
      expect(om).toBeTruthy();
      expect(om.role).toBe('guest');
      // ...but NO org-scoped UserRole of any kind (not over-granted to org-member).
      expect(res.userRoleId).toBeNull();
      expect(await db.UserRole.count({ where: { userId: member.id, organizationId: org.id, scope: 'organization' } })).toBe(0);
    });

    test('same idempotencyKey is idempotent — no duplicate membership or UserRole', async () => {
      const opts = {
        idempotencyKey: `member:${org.id}:${member.id}`,
        caGroupId: provision.caGroupId,
        intermediateCertId: provision.intermediateCertId,
        template: { cert: {}, token: {} }
      };

      const first = await provisionMemberCredentials(org.id, member.id, 'admin', opts);
      const second = await provisionMemberCredentials(org.id, member.id, 'admin', opts);

      expect(second.reused).toBe(true);
      expect(second.certId).toBe(first.certId);
      expect(second.tokenId).toBe(first.tokenId);

      // Exactly one membership and one org-admin UserRole for this (org,user).
      expect(await db.OrganizationMember.count({ where: { organizationId: org.id, userId: member.id } })).toBe(1);
      const adminRole = await db.Role.findOne({ where: { slug: 'org-admin', type: 'system' } });
      expect(await db.UserRole.count({
        where: { userId: member.id, roleId: adminRole.id, organizationId: org.id, scope: 'organization' }
      })).toBe(1);
    });
  });
});
