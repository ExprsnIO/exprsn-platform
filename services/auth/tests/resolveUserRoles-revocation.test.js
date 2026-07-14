/**
 * P1 (platform-wide) regression: tokenService.resolveUserRoles is the TOKEN-MINTING
 * role source — its output becomes the CA token's data.roles, which moderator
 * (requireAdmin ADMIN_ROLES), nexus (groupAuth isPlatformAdminRequest), and
 * timeline (rbac) all trust. It MUST NOT emit a role conferred by a REVOKED
 * (status='revoked') or time-EXPIRED UserRole binding; otherwise a revoked admin
 * who re-authenticates gets a fresh token still carrying 'admin' and revocation
 * never takes effect in any module.
 *
 * Pure decision logic, no live DB. The fix scopes the join-table read via
 * getRoles({ through: { where: {...} } }); this suite (a) asserts the exact
 * predicate resolveUserRoles sends and (b) exercises a fake getRoles that
 * applies that predicate against in-memory bindings — mirroring what Sequelize
 * does — to prove revoked/expired bindings drop out while an active one yields
 * 'admin'.
 */

const { Op } = require('sequelize');
const { resolveUserRoles } = require('../src/services/tokenService');

// A super-admin Role row (slug/name that resolveUserRoles maps to 'admin').
const SUPER_ADMIN = { slug: 'super-admin', name: 'Super Admin' };
const MEMBER = { slug: 'member', name: 'Member' };

// Simulate Sequelize belongsToMany getRoles({ through: { where } }): each
// binding pairs a Role with its join-row (status/expiresAt); only bindings whose
// join-row satisfies the through.where predicate are returned as Role rows.
function fakeUserWithBindings(bindings) {
  const captured = {};
  return {
    _captured: captured,
    id: 'user-1',
    getRoles: jest.fn(async (options) => {
      const where = options && options.through && options.through.where;
      captured.where = where;
      const now = new Date();
      return bindings
        .filter((b) => {
          if (!where) return true; // no filter == the vulnerable behavior
          if (where.status && b.status !== where.status) return false;
          const or = where[Op.or];
          if (Array.isArray(or)) {
            const notExpired =
              b.expiresAt == null ||
              new Date(b.expiresAt).getTime() > now.getTime();
            if (!notExpired) return false;
          }
          return true;
        })
        .map((b) => b.role);
    })
  };
}

describe('resolveUserRoles — revoked/expired bindings never enter a token', () => {
  it('scopes the join-table read to active AND not-expired bindings', async () => {
    const user = fakeUserWithBindings([]);
    await resolveUserRoles(user);

    const where = user._captured.where;
    expect(where).toBeDefined();
    expect(where.status).toBe('active');

    const orClauses = where[Op.or];
    expect(Array.isArray(orClauses)).toBe(true);
    expect(orClauses).toEqual(expect.arrayContaining([{ expiresAt: null }]));
    const gtClause = orClauses.find((c) => c.expiresAt && c.expiresAt[Op.gt]);
    expect(gtClause).toBeDefined();
    expect(gtClause.expiresAt[Op.gt]).toBeInstanceOf(Date);
  });

  it("does NOT emit 'admin' when the global super-admin binding is REVOKED", async () => {
    const user = fakeUserWithBindings([
      { role: SUPER_ADMIN, status: 'revoked', expiresAt: null }
    ]);
    const roles = await resolveUserRoles(user);
    expect(roles).not.toContain('admin');
    expect(roles).not.toContain('super-admin');
  });

  it("does NOT emit 'admin' when the super-admin binding is EXPIRED (expiresAt in the past)", async () => {
    const user = fakeUserWithBindings([
      { role: SUPER_ADMIN, status: 'active', expiresAt: new Date(Date.now() - 60_000) }
    ]);
    const roles = await resolveUserRoles(user);
    expect(roles).not.toContain('admin');
    expect(roles).not.toContain('super-admin');
  });

  it("DOES emit 'admin' for an ACTIVE, non-expired super-admin binding", async () => {
    const user = fakeUserWithBindings([
      { role: SUPER_ADMIN, status: 'active', expiresAt: null }
    ]);
    const roles = await resolveUserRoles(user);
    expect(roles).toContain('super-admin');
    expect(roles).toContain('admin');
  });

  it("emits a future-dated active binding but drops a revoked one in the same set", async () => {
    const user = fakeUserWithBindings([
      { role: SUPER_ADMIN, status: 'revoked', expiresAt: null },
      { role: MEMBER, status: 'active', expiresAt: new Date(Date.now() + 3_600_000) }
    ]);
    const roles = await resolveUserRoles(user);
    expect(roles).toContain('member');
    expect(roles).not.toContain('admin');
  });

  it('returns [] for a user without the association mixin (defensive)', async () => {
    expect(await resolveUserRoles({ id: 'x' })).toEqual([]);
    expect(await resolveUserRoles(null)).toEqual([]);
  });
});
