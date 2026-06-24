/**
 * Admin authorization guard (H1 / M1 / M3) — the chokepoint that gates the
 * config, user-list, and group routes. Pure decision logic: platform-admin email
 * OR a DB admin/system_admin role; everyone else is denied 403. No live DB.
 */

jest.mock('../src/models', () => ({
  User: { findByPk: jest.fn() },
  Role: {}
}));

const { User } = require('../src/models');
const { requireAdminAfterCA, requireAdminUser, hasAdminRole } = require('../src/middleware/requireAdmin');

/** Run a guard middleware and resolve with what it did (next vs JSON response). */
function run(mw, req) {
  return new Promise((resolve) => {
    const res = {
      status(code) { this._code = code; return this; },
      json(body) { resolve({ type: 'res', code: this._code, body }); return this; }
    };
    const next = (err) => resolve({ type: 'next', err });
    mw(req, res, next);
  });
}

describe('requireAdmin', () => {
  const original = process.env.PLATFORM_ADMIN_EMAILS;
  beforeEach(() => {
    process.env.PLATFORM_ADMIN_EMAILS = 'admin@exprsn.io';
    User.findByPk.mockReset();
  });
  afterAll(() => { process.env.PLATFORM_ADMIN_EMAILS = original; });

  describe('requireAdminAfterCA (CA-bearer routes)', () => {
    it('allows a platform-admin email without a DB lookup', async () => {
      const out = await run(requireAdminAfterCA, { tokenData: { email: 'admin@exprsn.io' }, userId: 'u1' });
      expect(out.type).toBe('next');
      expect(out.err).toBeUndefined();
      expect(User.findByPk).not.toHaveBeenCalled();
    });

    it('allows a non-allowlisted user holding a DB admin role', async () => {
      User.findByPk.mockResolvedValue({ roles: [{ name: 'admin', permissions: [] }] });
      const out = await run(requireAdminAfterCA, { tokenData: { email: 'someone@exprsn.io' }, userId: 'u2' });
      expect(out.type).toBe('next');
    });

    it('denies a non-admin with 403', async () => {
      User.findByPk.mockResolvedValue({ roles: [{ name: 'member', permissions: [] }] });
      const out = await run(requireAdminAfterCA, { tokenData: { email: 'user@exprsn.io' }, userId: 'u3' });
      expect(out.type).toBe('res');
      expect(out.code).toBe(403);
      expect(out.body.error).toBe('FORBIDDEN');
    });

    it('denies when there is no identity at all', async () => {
      User.findByPk.mockResolvedValue(null);
      const out = await run(requireAdminAfterCA, { tokenData: {}, userId: null });
      expect(out.type).toBe('res');
      expect(out.code).toBe(403);
    });
  });

  describe('requireAdminUser (session/bearer routes)', () => {
    it('allows a platform-admin email', async () => {
      const out = await run(requireAdminUser, { user: { id: 'u1', email: 'admin@exprsn.io' } });
      expect(out.type).toBe('next');
    });

    it('denies a regular user with 403', async () => {
      User.findByPk.mockResolvedValue({ roles: [{ name: 'member' }] });
      const out = await run(requireAdminUser, { user: { id: 'u9', email: 'nope@exprsn.io' } });
      expect(out.type).toBe('res');
      expect(out.code).toBe(403);
    });
  });

  describe('hasAdminRole', () => {
    it('is false for a missing userId (no query)', async () => {
      expect(await hasAdminRole(null)).toBe(false);
      expect(User.findByPk).not.toHaveBeenCalled();
    });

    it('recognizes an admin:* permission', async () => {
      User.findByPk.mockResolvedValue({ roles: [{ name: 'ops', permissions: ['admin:*'] }] });
      expect(await hasAdminRole('u4')).toBe(true);
    });

    it('is false for a user with only non-admin roles', async () => {
      User.findByPk.mockResolvedValue({ roles: [{ name: 'member', permissions: ['read'] }] });
      expect(await hasAdminRole('u5')).toBe(false);
    });
  });
});
