/**
 * §6a — Happy path per template (enterprise / team / personal).
 *
 * REAL auth Sequelize writes (dedicated test DB) + mocked CA primitives. Asserts
 * every artifact the saga is supposed to create, across auth (org/member/role/RBAC)
 * and the CA fakes (directory group, intermediate + entity cert, org-scoped token),
 * and the completed ledger.
 */

'use strict';

const { provisionOrganization } = require('../engine');
const { setupDatabase, clearDatabase, seedSystemRoles, teardownDatabase } = require('./helpers/db');
const caState = require('./fakes/caState');

const EXPECTED = {
  enterprise: { plan: 'enterprise', requireMfa: true, rbacGroups: 2, nexus: true },
  team: { plan: 'starter', requireMfa: false, rbacGroups: 1, nexus: true },
  personal: { plan: 'free', requireMfa: false, rbacGroups: 0, nexus: false }
};

describe('§6a happy path', () => {
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

  describe.each(Object.keys(EXPECTED))('type=%s', (type) => {
    const exp = EXPECTED[type];

    test('provisions the full org and records every artifact', async () => {
      const result = await provisionOrganization({
        idempotencyKey: `${type}-happy`,
        type,
        organization: { name: `${type} Org`, description: 'a test org' },
        owner: { email: `owner-${type}@example.com`, displayName: 'The Owner' }
      });

      // ── result shape ──────────────────────────────────────────────────────
      expect(result.status).toBe('completed');
      expect(result.organizationId).toBeTruthy();
      expect(result.caGroupId).toBeTruthy();
      expect(result.intermediateCertId).toBeTruthy();
      expect(result.ownerUserId).toBeTruthy();
      expect(result.ownerUserCreated).toBe(true);
      expect(result.ownerCertId).toBeTruthy();
      expect(result.ownerTokenId).toBeTruthy();

      // ── Organization (template drives type/plan/settings) ─────────────────
      const org = await db.Organization.findByPk(result.organizationId);
      expect(org).toBeTruthy();
      expect(org.type).toBe(type);
      expect(org.plan).toBe(exp.plan);
      expect(org.status).toBe('active');
      expect(org.settings.requireMfa).toBe(exp.requireMfa);
      expect(org.caGroupId).toBe(result.caGroupId); // S3 linkage persisted

      // ── owner membership + matching org-owner UserRole ────────────────────
      const member = await db.OrganizationMember.findOne({
        where: { organizationId: org.id, userId: result.ownerUserId }
      });
      expect(member).toBeTruthy();
      expect(member.role).toBe('owner');
      expect(member.status).toBe('active');

      const ownerRole = await db.Role.findOne({ where: { slug: 'org-owner', type: 'system' } });
      const ownerUserRole = await db.UserRole.findOne({
        where: { userId: result.ownerUserId, roleId: ownerRole.id, organizationId: org.id, scope: 'organization' }
      });
      expect(ownerUserRole).toBeTruthy();
      expect(ownerUserRole.status).toBe('active');

      // ── template RBAC groups + their GroupRole links ──────────────────────
      const groups = await db.Group.findAll({ where: { organizationId: org.id } });
      expect(groups).toHaveLength(exp.rbacGroups);
      const groupRoles = await db.GroupRole.findAll({ where: { organizationId: org.id } });
      expect(groupRoles).toHaveLength(exp.rbacGroups);

      // ── CA directory group + owner membership (AUTH user id) ──────────────
      const caGroup = caState.state.groupById.get(result.caGroupId);
      expect(caGroup).toBeTruthy();
      expect(caGroup.type).toBe('organizational_unit');
      expect(caGroup.status).toBe('active');
      const caMember = caState.state.members.find(
        (m) => m.groupId === result.caGroupId && m.userId === result.ownerUserId
      );
      expect(caMember).toBeTruthy();
      expect(caMember.role).toBe('owner');

      // ── intermediate cert under the platform root ─────────────────────────
      const intermediate = caState.state.certs.get(result.intermediateCertId);
      expect(intermediate.type).toBe('intermediate');
      expect(intermediate.status).toBe('active');
      expect(intermediate.organizationalUnit).toBe(org.id);
      expect(intermediate.issuerId).toBe(caState.state.root.id);

      // ── owner entity cert under the org intermediate ──────────────────────
      const entity = caState.state.certs.get(result.ownerCertId);
      expect(entity.type).toBe('client');
      expect(entity.status).toBe('active');
      expect(entity.issuerId).toBe(result.intermediateCertId);

      // ── owner org-scoped token (organizationId = caGroupId) ───────────────
      const token = caState.state.tokens.get(result.ownerTokenId);
      expect(token.status).toBe('active');
      expect(token.organizationId).toBe(result.caGroupId);

      // ── nexus social group + spark channels (S7/S8, slice-2 templates) ────
      if (exp.nexus) {
        expect(result.nexusGroupId).toBeTruthy();
        const nexusGroup = caState.state.nexusGroupById.get(result.nexusGroupId);
        expect(nexusGroup).toBeTruthy();
        expect(nexusGroup.slug).toBe(`org-${org.id}`); // deterministic → idempotent
        expect(nexusGroup.ownerId).toBe(result.ownerUserId);
        // S8 bound spark channels to the nexus group.
        const channels = caState.state.sparkChannelsByGroup.get(result.nexusGroupId);
        expect(channels).toBeTruthy();
        expect(channels.chat.id).toBeTruthy();
        expect(channels.announcement.id).toBeTruthy();
      } else {
        expect(result.nexusGroupId).toBeFalsy();
        expect(caState.state.nexusGroupById.size).toBe(0);
        expect(caState.state.sparkChannelsByGroup.size).toBe(0);
      }

      // ── ledger finalized ──────────────────────────────────────────────────
      const run = await db.ProvisioningRun.findByPk(result.runId);
      expect(run.status).toBe('completed');
      expect(run.kind).toBe('org');
      expect(run.ids.organizationId).toBe(org.id);
      expect(run.ids.ownerTokenId).toBe(result.ownerTokenId);
    });
  });
});
