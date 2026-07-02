'use strict';

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
process.env.SERVICE_TOKEN_SECRET = process.env.SERVICE_TOKEN_SECRET || 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6';
process.env.AUTH_SERVICE_URL = 'https://svc.test/auth';
process.env.NEXUS_SERVICE_URL = 'https://svc.test/nexus';

jest.mock('axios');
const axios = require('axios');
const resolver = require('../src/services/membershipResolver');

beforeEach(() => { jest.clearAllMocks(); resolver._cache.clear(); });

function mockByUrl(map) {
  axios.get.mockImplementation((url) => {
    for (const [needle, data] of Object.entries(map)) if (url.includes(needle)) return Promise.resolve({ data });
    return Promise.reject(new Error('unexpected url ' + url));
  });
}

describe('membershipResolver', () => {
  test('resolves org + group ids from the two internal endpoints', async () => {
    mockByUrl({ '/orgs': { orgIds: ['o1', 'o2'] }, '/groups': { groupIds: ['g1'] } });
    const out = await resolver.resolveMemberships('u1');
    expect(out).toEqual({ orgIds: ['o1', 'o2'], groupIds: ['g1'] });
    expect(axios.get.mock.calls[0][0]).toMatch('/auth/api/internal/users/u1/orgs');
  });

  test('SECURE-FAIL-EMPTY: a failing dimension yields [] (not a leak)', async () => {
    axios.get.mockImplementation((url) =>
      url.includes('/groups') ? Promise.resolve({ data: { groupIds: ['g9'] } }) : Promise.reject(new Error('auth down')));
    const out = await resolver.resolveMemberships('u1');
    expect(out).toEqual({ orgIds: [], groupIds: ['g9'] });
  });

  test('caches per user within the TTL', async () => {
    mockByUrl({ '/orgs': { orgIds: ['o1'] }, '/groups': { groupIds: [] } });
    await resolver.resolveMemberships('u1');
    await resolver.resolveMemberships('u1');
    expect(axios.get).toHaveBeenCalledTimes(2); // 2 endpoints, one round only (cached 2nd call)
  });

  test('no userId → empty memberships, no calls', async () => {
    const out = await resolver.resolveMemberships('');
    expect(out).toEqual({ orgIds: [], groupIds: [] });
    expect(axios.get).not.toHaveBeenCalled();
  });
});
