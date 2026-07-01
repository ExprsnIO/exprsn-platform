'use strict';

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
// scopeAuthority derives an HMAC service token; needs a real (>=32 char) secret.
process.env.SERVICE_TOKEN_SECRET = process.env.SERVICE_TOKEN_SECRET || 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6';
process.env.AUTH_SERVICE_URL = 'https://svc.test/auth';
process.env.NEXUS_SERVICE_URL = 'https://svc.test/nexus';

jest.mock('axios');
const axios = require('axios');
const authz = require('../src/services/scopeAuthority');

const platformAdmin = { userId: 'u1', email: 'a@x.io', isPlatformAdmin: true };
const user = { userId: 'u1', email: 'u@x.io', isPlatformAdmin: false };

beforeEach(() => jest.clearAllMocks());

describe('scopeAuthority.canAdminScope', () => {
  test('platform admin is a superuser across every scope (no lookup)', async () => {
    expect(await authz.canAdminScope(platformAdmin, 'platform', null)).toBe(true);
    expect(await authz.canAdminScope(platformAdmin, 'organization', 'org-1')).toBe(true);
    expect(await authz.canAdminScope(platformAdmin, 'group', 'grp-1')).toBe(true);
    expect(axios.get).not.toHaveBeenCalled();
  });

  test('non-admin cannot administer the platform scope', async () => {
    expect(await authz.canAdminScope(user, 'platform', null)).toBe(false);
  });

  test('user scope requires owning the scope id', async () => {
    expect(await authz.canAdminScope(user, 'user', 'u1')).toBe(true);
    expect(await authz.canAdminScope(user, 'user', 'other')).toBe(false);
  });

  test('org scope: owner or admin allowed, member denied', async () => {
    axios.get.mockResolvedValueOnce({ data: { isOwner: false, role: 'admin' } });
    expect(await authz.canAdminScope(user, 'organization', 'org-1')).toBe(true);
    axios.get.mockResolvedValueOnce({ data: { isOwner: true, role: 'owner' } });
    expect(await authz.canAdminScope(user, 'organization', 'org-2')).toBe(true);
    axios.get.mockResolvedValueOnce({ data: { isOwner: false, role: 'member' } });
    expect(await authz.canAdminScope(user, 'organization', 'org-3')).toBe(false);
    expect(axios.get.mock.calls[0][0]).toBe('https://svc.test/auth/api/internal/orgs/org-1/membership/u1');
  });

  test('group scope: owner/admin allowed, member denied', async () => {
    axios.get.mockResolvedValueOnce({ data: { role: 'owner' } });
    expect(await authz.canAdminScope(user, 'group', 'grp-1')).toBe(true);
    axios.get.mockResolvedValueOnce({ data: { role: 'member' } });
    expect(await authz.canAdminScope(user, 'group', 'grp-2')).toBe(false);
  });

  test('FAIL-CLOSED: an authorization lookup error denies (never allows)', async () => {
    axios.get.mockRejectedValue(new Error('auth down'));
    expect(await authz.canAdminScope(user, 'organization', 'org-1')).toBe(false);
    expect(await authz.canAdminScope(user, 'group', 'grp-1')).toBe(false);
  });

  test('missing identity or unknown scope denies', async () => {
    expect(await authz.canAdminScope(null, 'user', 'u1')).toBe(false);
    expect(await authz.canAdminScope(user, 'weird', 'x')).toBe(false);
    expect(await authz.canAdminScope(user, 'organization', null)).toBe(false);
  });
});
