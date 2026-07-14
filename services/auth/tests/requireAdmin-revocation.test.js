/**
 * Finding #2 (P1) regression: the platform-admin gate must count ONLY an active,
 * non-expired GLOBAL admin binding. A revoked (status='revoked') or time-expired
 * global admin grant must NOT confer platform super-admin. Pure decision logic,
 * no live DB — the model layer is mocked and we assert on the query predicate the
 * guard sends to UserRole.findAll (the DB does the status/expiresAt filtering).
 */

const { Op } = require('sequelize');

jest.mock('../src/models', () => ({
  UserRole: { findAll: jest.fn() },
  Role: { findAll: jest.fn() }
}));

const { UserRole, Role } = require('../src/models');
const { hasAdminRole } = require('../src/middleware/requireAdmin');

describe('hasAdminRole — revocation/expiry are honored (Finding #2)', () => {
  beforeEach(() => {
    UserRole.findAll.mockReset();
    Role.findAll.mockReset();
  });

  it('queries UserRole with the global-scope AND active-AND-not-expired predicate', async () => {
    UserRole.findAll.mockResolvedValue([]); // no active global binding survives the filter
    await hasAdminRole('u1');

    expect(UserRole.findAll).toHaveBeenCalledTimes(1);
    const { where } = UserRole.findAll.mock.calls[0][0];

    // Global-scope requirement preserved
    expect(where.scope).toBe('global');
    expect(where.organizationId).toBeNull();

    // NEW: active-only
    expect(where.status).toBe('active');

    // NEW: not-expired — expiresAt IS NULL OR expiresAt > now
    const orClauses = where[Op.or];
    expect(Array.isArray(orClauses)).toBe(true);
    expect(orClauses).toEqual(
      expect.arrayContaining([{ expiresAt: null }])
    );
    const gtClause = orClauses.find((c) => c.expiresAt && c.expiresAt[Op.gt]);
    expect(gtClause).toBeDefined();
    expect(gtClause.expiresAt[Op.gt]).toBeInstanceOf(Date);
  });

  it('REJECTS a user whose only global admin binding was filtered out (revoked/expired) — findAll returns []', async () => {
    // The DB predicate excludes revoked/expired rows, so findAll yields nothing.
    UserRole.findAll.mockResolvedValue([]);
    expect(await hasAdminRole('revoked-or-expired-user')).toBe(false);
    // Short-circuits before touching Role
    expect(Role.findAll).not.toHaveBeenCalled();
  });

  it('ACCEPTS a user with a surviving active, non-expired global admin binding', async () => {
    UserRole.findAll.mockResolvedValue([{ roleId: 'r-admin' }]);
    Role.findAll.mockResolvedValue([{ name: 'admin', permissions: [] }]);
    expect(await hasAdminRole('active-admin-user')).toBe(true);
  });

  it('still denies when the surviving binding points at a non-admin role', async () => {
    UserRole.findAll.mockResolvedValue([{ roleId: 'r-member' }]);
    Role.findAll.mockResolvedValue([{ name: 'member', permissions: ['read'] }]);
    expect(await hasAdminRole('active-member-user')).toBe(false);
  });

  it('is false for a missing userId without any query', async () => {
    expect(await hasAdminRole(null)).toBe(false);
    expect(UserRole.findAll).not.toHaveBeenCalled();
  });
});
