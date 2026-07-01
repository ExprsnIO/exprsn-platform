'use strict';

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

jest.mock('../src/models', () => ({
  LcEntity: { findOne: jest.fn() },
  LcRecord: { findOne: jest.fn() },
}));
jest.mock('../src/services/entityService', () => ({
  createRecord: jest.fn(),
  updateRecord: jest.fn(),
  transitionRecord: jest.fn(),
}));
// pluginHost brings in axios/scopeResolver; stub it to a small action set.
jest.mock('../../plugins/src/services/pluginHost', () => ({
  ACTIONS: { log: jest.fn(), notify: jest.fn(), flag: jest.fn() },
}));

const { LcEntity, LcRecord } = require('../src/models');
const entityService = require('../src/services/entityService');
const flowActions = require('../src/services/flowActions');

beforeEach(() => jest.clearAllMocks());

describe('flowActions', () => {
  test('knownActionTypes merges native + plugin actions', () => {
    const types = flowActions.knownActionTypes();
    expect(types).toEqual(expect.arrayContaining(['create_record', 'update_record', 'transition_record', 'log', 'notify', 'flag']));
    expect(flowActions.isNativeAction('create_record')).toBe(true);
    expect(flowActions.isNativeAction('notify')).toBe(false); // plugin action, not native
  });

  test('validateActions accepts known types and rejects typos / shape errors', () => {
    expect(flowActions.validateActions([{ type: 'create_record' }, { type: 'notify' }])).toEqual([]);
    expect(flowActions.validateActions([{ type: 'nope' }])[0]).toMatch(/unknown type/);
    expect(flowActions.validateActions([{}])[0]).toMatch(/needs a type/);
    expect(flowActions.validateActions('x')[0]).toMatch(/must be an array/);
  });

  test('create_record resolves the entity from the event and delegates', async () => {
    LcEntity.findOne.mockResolvedValue({ id: 'ent-1' });
    entityService.createRecord.mockResolvedValue({ id: 'rec-9' });
    const out = await flowActions.NATIVE_ACTIONS.create_record(
      { type: 'create_record', entityKey: 'audit', data: { msg: 'hi' } },
      { app: 'app-1', userId: 'u1' },
    );
    expect(LcEntity.findOne).toHaveBeenCalledWith({ where: { appId: 'app-1', key: 'audit' } });
    expect(entityService.createRecord).toHaveBeenCalledWith({ id: 'ent-1' }, { msg: 'hi' }, { userId: 'u1' });
    expect(out).toEqual({ type: 'create_record', recordId: 'rec-9' });
  });

  test('transition_record uses the event record when no recordId is given', async () => {
    LcEntity.findOne.mockResolvedValue({ id: 'ent-1' });
    LcRecord.findOne.mockResolvedValue({ id: 'rec-1' });
    entityService.transitionRecord.mockResolvedValue({ id: 'rec-1', state: 'closed' });
    const out = await flowActions.NATIVE_ACTIONS.transition_record(
      { type: 'transition_record', event: 'close' },
      { entity: 'ticket', app: 'app-1', record: { id: 'rec-1' }, userId: 'u1' },
    );
    expect(LcRecord.findOne).toHaveBeenCalledWith({ where: { id: 'rec-1', entityId: 'ent-1' } });
    expect(entityService.transitionRecord).toHaveBeenCalledWith({ id: 'rec-1' }, { id: 'ent-1' }, 'close', { userId: 'u1' });
    expect(out).toEqual({ type: 'transition_record', recordId: 'rec-1', state: 'closed' });
  });

  test('transition_record without an event throws', async () => {
    LcEntity.findOne.mockResolvedValue({ id: 'ent-1' });
    LcRecord.findOne.mockResolvedValue({ id: 'rec-1' });
    await expect(flowActions.NATIVE_ACTIONS.transition_record(
      { type: 'transition_record' }, { entity: 'ticket', app: 'a', record: { id: 'rec-1' } },
    )).rejects.toThrow(/needs an event/);
  });
});
