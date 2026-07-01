'use strict';

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

jest.mock('../src/models', () => ({
  LcLookup: { findAll: jest.fn() },
  LcEntity: { findOne: jest.fn() },
  LcRecord: { findOne: jest.fn(), create: jest.fn() },
}));
jest.mock('../src/services/lookupProviders', () => ({ resolveLookup: jest.fn(async () => []) }));
jest.mock('../../plugins/src/services/pluginHost', () => ({ emit: jest.fn(async () => {}) }));
jest.mock('../../plugins/src/services/stateMachine', () => ({ evaluate: jest.fn() }));

const { LcEntity, LcRecord } = require('../src/models');
const entityService = require('../src/services/entityService');

beforeEach(() => jest.clearAllMocks());

const entity = {
  id: 'ent-order', appId: 'app-1', key: 'order',
  fields: [
    { key: 'title', type: 'string' },
    { key: 'customer', type: 'reference', refEntity: 'customer' },
  ],
};

describe('entityService.checkReferences', () => {
  test('passes when the referenced record exists in the ref entity', async () => {
    LcEntity.findOne.mockResolvedValue({ id: 'ent-customer' });   // resolve refEntity
    LcRecord.findOne.mockResolvedValue({ id: 'cust-1' });          // target exists
    const errors = await entityService.checkReferences(entity, { customer: 'cust-1' });
    expect(errors).toEqual([]);
    expect(LcEntity.findOne).toHaveBeenCalledWith({ where: { appId: 'app-1', key: 'customer' } });
    expect(LcRecord.findOne).toHaveBeenCalledWith({ where: { id: 'cust-1', entityId: 'ent-customer' }, attributes: ['id'] });
  });

  test('fails when the referenced record does not exist', async () => {
    LcEntity.findOne.mockResolvedValue({ id: 'ent-customer' });
    LcRecord.findOne.mockResolvedValue(null); // dangling ref
    const errors = await entityService.checkReferences(entity, { customer: 'ghost' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/non-existent customer record/);
  });

  test('fails when the ref entity itself is unknown', async () => {
    LcEntity.findOne.mockResolvedValue(null);
    const errors = await entityService.checkReferences(entity, { customer: 'cust-1' });
    expect(errors[0]).toMatch(/references unknown entity/);
  });

  test('skips reference checks when the value is absent', async () => {
    const errors = await entityService.checkReferences(entity, { title: 'no ref here' });
    expect(errors).toEqual([]);
    expect(LcEntity.findOne).not.toHaveBeenCalled();
  });
});
