'use strict';

// @exprsn/shared eagerly constructs Stripe at require time.
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

jest.mock('../src/models', () => ({
  LcEntity: { findOne: jest.fn() },
  LcRecord: { findAll: jest.fn() },
}));

const { LcEntity, LcRecord } = require('../src/models');
const providers = require('../src/services/lookupProviders');

beforeEach(() => {
  jest.clearAllMocks();
  providers._cache.clear();
});

describe('lookupProviders', () => {
  test('lists the built-in providers and knows their keys', () => {
    const keys = providers.listProviders().map((p) => p.key);
    expect(keys).toEqual(expect.arrayContaining(['lowcode.entity', 'platform.users', 'nexus.groups']));
    expect(providers.isKnownProvider('lowcode.entity')).toBe(true);
    expect(providers.isKnownProvider('nope')).toBe(false);
  });

  test('static lookup resolves to its own values', async () => {
    const values = [{ value: 'a' }, { value: 'b' }];
    expect(await providers.resolveLookup({ values, source: null })).toEqual(values);
    expect(providers.isDynamic({ source: null })).toBe(false);
  });

  test('lowcode.entity provider maps records to {value,label}', async () => {
    LcEntity.findOne.mockResolvedValue({ id: 'ent-1', appId: 'app-1', key: 'agent' });
    LcRecord.findAll.mockResolvedValue([
      { id: 'r1', data: { code: 'A1', name: 'Ana' } },
      { id: 'r2', data: { code: 'B2', name: 'Bo' } },
    ]);
    const lookup = { appId: 'app-1', source: { type: 'provider', provider: 'lowcode.entity', params: { entityKey: 'agent', valueField: 'code', labelField: 'name' } } };
    expect(providers.isDynamic(lookup)).toBe(true);
    const values = await providers.resolveLookup(lookup, { appId: 'app-1' });
    expect(values).toEqual([{ value: 'A1', label: 'Ana' }, { value: 'B2', label: 'Bo' }]);
    expect(LcEntity.findOne).toHaveBeenCalledWith({ where: { appId: 'app-1', key: 'agent' } });
  });

  test('unknown provider degrades to an empty list (never throws)', async () => {
    const values = await providers.resolveProvider({ type: 'provider', provider: 'ghost' }, { appId: 'x' });
    expect(values).toEqual([]);
  });

  test('a failing provider resolve is contained and returns []', async () => {
    LcEntity.findOne.mockRejectedValue(new Error('db down'));
    const values = await providers.resolveProvider({ provider: 'lowcode.entity', params: { entityKey: 'x' } }, { appId: 'a' });
    expect(values).toEqual([]);
  });

  test('resolved provider values are cached within the TTL', async () => {
    LcEntity.findOne.mockResolvedValue({ id: 'e', appId: 'a', key: 'k' });
    LcRecord.findAll.mockResolvedValue([{ id: 'r1', data: {} }]);
    const source = { provider: 'lowcode.entity', params: { entityKey: 'k' } };
    await providers.resolveProvider(source, { appId: 'a' });
    await providers.resolveProvider(source, { appId: 'a' });
    expect(LcRecord.findAll).toHaveBeenCalledTimes(1); // second call served from cache
  });
});
