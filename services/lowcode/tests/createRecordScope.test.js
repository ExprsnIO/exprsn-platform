'use strict';

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

jest.mock('../src/models', () => ({
  LcApp: { findByPk: jest.fn() },
  LcLookup: { findAll: jest.fn(async () => []) },
  LcEntity: { findOne: jest.fn() },
  LcRecord: { findOne: jest.fn(), create: jest.fn(async (row) => ({ ...row, id: 'rec-1', toJSON: () => ({ id: 'rec-1', ...row }) })) },
}));
jest.mock('../src/services/lookupProviders', () => ({ resolveLookup: jest.fn(async () => []) }));
jest.mock('../src/services/recordStore', () => ({ onWrite: jest.fn(async () => ({})) }));
jest.mock('../../plugins/src/services/pluginHost', () => ({ emit: jest.fn(async () => {}) }));
jest.mock('../../plugins/src/services/stateMachine', () => ({ evaluate: jest.fn() }));

const { LcApp, LcRecord } = require('../src/models');
const entityService = require('../src/services/entityService');

const entity = { id: 'ent-1', appId: 'app-1', key: 'ticket', fields: [{ key: 'title', type: 'string' }], stateMachine: null };

beforeEach(() => jest.clearAllMocks());

describe('createRecord scope inheritance (record-level data isolation)', () => {
  test('a record inherits its app scope when none is given', async () => {
    LcApp.findByPk.mockResolvedValue({ scopeType: 'group', scopeId: 'grp-1' });
    await entityService.createRecord(entity, { title: 'hi' }, { userId: 'u1' });
    expect(LcApp.findByPk).toHaveBeenCalledWith('app-1', { attributes: ['scopeType', 'scopeId'] });
    const created = LcRecord.create.mock.calls[0][0];
    expect(created.scopeType).toBe('group');
    expect(created.scopeId).toBe('grp-1');
    expect(created.ownerId).toBe('u1');
  });

  test('an explicit scope overrides the app scope (no app lookup)', async () => {
    await entityService.createRecord(entity, { title: 'hi' }, { userId: 'u1', scopeType: 'platform' });
    expect(LcApp.findByPk).not.toHaveBeenCalled();
    expect(LcRecord.create.mock.calls[0][0].scopeType).toBe('platform');
  });

  test('falls back to platform when the app has no scope', async () => {
    LcApp.findByPk.mockResolvedValue(null);
    await entityService.createRecord(entity, { title: 'hi' }, {});
    expect(LcRecord.create.mock.calls[0][0].scopeType).toBe('platform');
  });
});
