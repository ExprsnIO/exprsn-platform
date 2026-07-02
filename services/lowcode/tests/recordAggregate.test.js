'use strict';

jest.mock('../src/models', () => ({
  sequelize: { literal: jest.fn((s) => ({ val: s })) },
  LcRecord: { findAll: jest.fn() },
}));

const { LcRecord } = require('../src/models');
const { aggregate, parseMetrics, parseGroupBy } = require('../src/services/recordAggregate');

beforeEach(() => jest.clearAllMocks());

const entity = {
  id: 'ent-1',
  fields: [
    { key: 'status', type: 'enum', role: 'dimension', enumValues: ['open', 'closed'] },
    { key: 'region', type: 'string', role: 'dimension' },
    { key: 'amount', type: 'number', role: 'measure', aggregation: 'sum' },
    { key: 'note', type: 'text' },
  ],
};

describe('parseMetrics', () => {
  test('defaults to declared measure aggregations', () => {
    expect(parseMetrics(entity, undefined)).toEqual([{ agg: 'sum', key: 'amount' }]);
  });
  test('falls back to count(*) with no measures', () => {
    expect(parseMetrics({ fields: [] }, undefined)).toEqual([{ agg: 'count', key: '*' }]);
  });
  test('parses explicit metrics and rejects bad ones', () => {
    expect(parseMetrics(entity, 'sum:amount,count:*')).toEqual([
      { agg: 'sum', key: 'amount', type: 'number' },
      { agg: 'count', key: '*' },
    ]);
    expect(() => parseMetrics(entity, 'sum:note')).toThrow(/not numeric/);
    expect(() => parseMetrics(entity, 'median:amount')).toThrow(/unknown aggregation/);
    expect(() => parseMetrics(entity, 'sum:nope')).toThrow(/unknown metric field/);
  });
});

describe('parseGroupBy', () => {
  test('validates keys against entity fields', () => {
    expect(parseGroupBy(entity, 'status,region').map((f) => f.key)).toEqual(['status', 'region']);
    expect(() => parseGroupBy(entity, 'nope')).toThrow(/unknown groupBy field/);
    expect(() => parseGroupBy(entity, 'a,b,c,d')).toThrow(/at most/);
  });
});

describe('aggregate', () => {
  test('casts pg string numerics and echoes the shape', async () => {
    LcRecord.findAll.mockResolvedValue([
      { status: 'open', sum_amount: '12.5', count: '3' },
      { status: 'closed', sum_amount: '4', count: '1' },
    ]);
    const out = await aggregate(entity, { groupBy: 'status', metrics: 'sum:amount,count:*' }, { entityId: 'ent-1' });
    expect(out.groups).toEqual([
      { status: 'open', sum_amount: 12.5, count: 3 },
      { status: 'closed', sum_amount: 4, count: 1 },
    ]);
    expect(out.groupBy).toEqual(['status']);
    expect(out.metrics).toEqual([
      { agg: 'sum', field: 'amount', alias: 'sum_amount' },
      { agg: 'count', field: '*', alias: 'count' },
    ]);
    const call = LcRecord.findAll.mock.calls[0][0];
    expect(call.where).toEqual({ entityId: 'ent-1' });
    expect(call.raw).toBe(true);
    expect(call.group).toHaveLength(1);
  });

  test('grand total with no groupBy', async () => {
    LcRecord.findAll.mockResolvedValue([{ count: '7' }]);
    const out = await aggregate(entity, { metrics: 'count:*' }, {});
    expect(out.groups).toEqual([{ count: 7 }]);
    const call = LcRecord.findAll.mock.calls[0][0];
    expect(call.group).toBeUndefined();
  });
});
