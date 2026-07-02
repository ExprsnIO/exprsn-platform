'use strict';

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

jest.mock('../src/models', () => ({
  LcFlow: { findAll: jest.fn() },
  LcFlowRun: {
    create: jest.fn(async (row) => ({ id: 'run-1', ...row })),
    findAll: jest.fn(async () => []),
    destroy: jest.fn(async () => 0),
  },
  LcApp: { findByPk: jest.fn(async () => ({ capabilities: [] })) },
}));
jest.mock('../src/services/flowActions', () => {
  const NATIVE_ACTIONS = {
    ok_action: jest.fn(async () => ({ done: true })),
    fail_action: jest.fn(async () => { throw new Error('boom'); }),
    flaky_action: jest.fn(),
  };
  return { NATIVE_ACTIONS, isNativeAction: (t) => Object.prototype.hasOwnProperty.call(NATIVE_ACTIONS, t) };
});
jest.mock('../src/services/moduleActions', () => ({ isModuleAction: () => false, run: jest.fn() }));
jest.mock('../../plugins/src/services/pluginHost', () => ({ ACTIONS: {}, subscribe: jest.fn(() => () => {}), emit: jest.fn() }));

const { LcFlowRun } = require('../src/models');
const flowActions = require('../src/services/flowActions');
const flowEngine = require('../src/services/flowEngine');

beforeEach(() => jest.clearAllMocks());

const baseFlow = (over = {}) => ({ id: 'flow-1', appId: 'app-1', key: 'f', match: null, actions: [], ...over });

describe('flowEngine.runFlow', () => {
  test('runs actions in order and records a success run', async () => {
    const flow = baseFlow({ actions: [{ type: 'ok_action' }, { type: 'ok_action' }] });
    const run = await flowEngine.runFlow(flow, 'lowcode.record.created', { record: { id: 'r1' } });
    expect(flowActions.NATIVE_ACTIONS.ok_action).toHaveBeenCalledTimes(2);
    expect(run.status).toBe('success');
    expect(run.steps.map((s) => s.status)).toEqual(['ok', 'ok']);
    expect(LcFlowRun.create).toHaveBeenCalled();
  });

  test('per-action when gates just that action', async () => {
    const flow = baseFlow({
      actions: [
        { type: 'ok_action', when: { field: 'record.kind', op: 'equals', value: 'a' } },
        { type: 'ok_action', when: { field: 'record.kind', op: 'equals', value: 'b' } },
      ],
    });
    const run = await flowEngine.runFlow(flow, 'ev', { record: { kind: 'a' } });
    expect(flowActions.NATIVE_ACTIONS.ok_action).toHaveBeenCalledTimes(1);
    expect(run.steps.map((s) => s.status)).toEqual(['ok', 'skipped']);
    expect(run.status).toBe('success'); // skipped ≠ failure
  });

  test('retries a failing action then succeeds', async () => {
    flowActions.NATIVE_ACTIONS.flaky_action
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce({ ok: true });
    const flow = baseFlow({ actions: [{ type: 'flaky_action', retries: 2 }] });
    const run = await flowEngine.runFlow(flow, 'ev', {});
    expect(flowActions.NATIVE_ACTIONS.flaky_action).toHaveBeenCalledTimes(2);
    expect(run.status).toBe('success');
    expect(run.steps[0].attempts).toBe(2);
  });

  test("onError: 'stop' skips the remaining actions and marks partial", async () => {
    const flow = baseFlow({ actions: [{ type: 'ok_action' }, { type: 'fail_action', onError: 'stop' }, { type: 'ok_action' }] });
    const run = await flowEngine.runFlow(flow, 'ev', {});
    expect(run.steps.map((s) => s.status)).toEqual(['ok', 'error', 'skipped']);
    expect(run.status).toBe('partial');
    expect(run.error).toMatch(/stopped at action\[1\]/);
    expect(flowActions.NATIVE_ACTIONS.ok_action).toHaveBeenCalledTimes(1);
  });

  test('default onError continues past failures; all-failed = error', async () => {
    const flow = baseFlow({ actions: [{ type: 'fail_action' }, { type: 'fail_action' }] });
    const run = await flowEngine.runFlow(flow, 'ev', {});
    expect(run.steps.map((s) => s.status)).toEqual(['error', 'error']);
    expect(run.status).toBe('error');
  });

  test('non-matching event dispatch is free (no run row)', async () => {
    const flow = baseFlow({ match: { field: 'x', op: 'equals', value: 1 }, actions: [{ type: 'ok_action' }] });
    const run = await flowEngine.runFlow(flow, 'ev', { x: 2 });
    expect(run).toBeNull();
    expect(LcFlowRun.create).not.toHaveBeenCalled();
  });

  test('manual execution records a skipped run when match fails', async () => {
    const flow = baseFlow({ match: { field: 'x', op: 'equals', value: 1 }, actions: [{ type: 'ok_action' }] });
    const run = await flowEngine.executeManual(flow, { x: 2 }, { userId: 'u-1' });
    expect(run.status).toBe('skipped');
    expect(run.trigger).toBe('manual');
    expect(run.triggeredBy).toBe('u-1');
    expect(flowActions.NATIVE_ACTIONS.ok_action).not.toHaveBeenCalled();
  });

  test('manual execution with _ignoreMatch runs anyway', async () => {
    const flow = baseFlow({ match: { field: 'x', op: 'equals', value: 1 }, actions: [{ type: 'ok_action' }] });
    const run = await flowEngine.executeManual(flow, { x: 2, _ignoreMatch: true }, { userId: 'u-1' });
    expect(run.status).toBe('success');
    expect(flowActions.NATIVE_ACTIONS.ok_action).toHaveBeenCalledTimes(1);
  });

  test('unknown action types error their step, not the run recorder', async () => {
    const flow = baseFlow({ actions: [{ type: 'nope_action' }] });
    const run = await flowEngine.runFlow(flow, 'ev', {});
    expect(run.steps[0].status).toBe('error');
    expect(run.steps[0].error).toMatch(/unknown action type/);
  });
});

describe('flowEngine.onEvent trigger filtering', () => {
  test('non-event-triggered flows never dispatch off the bus', async () => {
    const { LcFlow } = require('../src/models');
    LcFlow.findAll.mockResolvedValue([
      baseFlow({ trigger: { type: 'schedule', cron: '* * * * *' }, actions: [{ type: 'ok_action' }] }),
      baseFlow({ id: 'flow-2', trigger: { type: 'event' }, actions: [{ type: 'ok_action' }] }),
    ]);
    await flowEngine.onEvent('lowcode.record.created', {});
    expect(flowActions.NATIVE_ACTIONS.ok_action).toHaveBeenCalledTimes(1);
  });
});
