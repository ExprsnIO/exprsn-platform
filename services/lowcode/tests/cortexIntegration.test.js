'use strict';

/**
 * FEAT-024 — the `cortex` flow action and AI-backed fields.
 * The cortex façade is mocked, so no llama router / DB is involved.
 */

// `@exprsn/shared`'s index constructs a Stripe client at require time (same
// workaround as flowActions.test.js).
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

// entityService pulls in the Sequelize models; only applyAiFields is under test.
jest.mock('../src/models', () => ({
  LcApp: {}, LcLookup: { findAll: jest.fn(async () => []) }, LcEntity: {},
  LcRecord: {}, LcForm: {}, LcFlow: {}, LcFlowRun: {}, LcView: {},
}));

jest.mock('../../cortex/src/client', () => ({
  isEnabled: jest.fn(() => true),
  complete: jest.fn(),
}));

const cortexClient = require('../../cortex/src/client');
const { validateFieldDef, validateRecord, isAiField } = require('../src/services/typeSystem');

beforeEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------- flow action

describe('cortex flow action', () => {
  const moduleActions = require('../src/services/moduleActions');
  const CAP = 'call:cortex.complete';

  test('is registered and capability-gated', () => {
    expect(moduleActions.isModuleAction('cortex')).toBe(true);
    expect(moduleActions.actionTypes()).toContain('cortex');
    expect(moduleActions.requiredCapability('cortex')).toBe(CAP);
  });

  test('runs a completion and returns its text', async () => {
    cortexClient.complete.mockResolvedValue('  a haiku  ');
    const out = await moduleActions.run('cortex', { prompt: 'write a haiku' }, {}, [CAP]);
    expect(out).toMatchObject({ type: 'cortex', text: '  a haiku  ', truncated: false });
    expect(cortexClient.complete).toHaveBeenCalledWith(
      expect.stringContaining('helpful assistant'),
      'write a haiku',
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
  });

  test('a flow without the capability is denied and does not call cortex', async () => {
    const out = await moduleActions.run('cortex', { prompt: 'hi' }, {}, []);
    expect(out.error).toMatch(/missing capability call:cortex\.complete/);
    expect(cortexClient.complete).not.toHaveBeenCalled();
  });

  test('an empty prompt is rejected as a step error, not a throw', async () => {
    const out = await moduleActions.run('cortex', { prompt: '   ' }, {}, [CAP]);
    expect(out.error).toMatch(/non-empty `prompt`/);
  });

  // fail-soft: a step records { error }, the flow keeps going
  test('a disabled cortex fails SOFT (records an error, never throws)', async () => {
    cortexClient.complete.mockRejectedValue(
      Object.assign(new Error('Cortex is not enabled'), { code: 'CORTEX_DISABLED' }));
    const out = await moduleActions.run('cortex', { prompt: 'hi' }, {}, [CAP]);
    expect(out).toEqual({ type: 'cortex', error: expect.stringMatching(/not enabled/) });
  });

  test('a router timeout fails SOFT', async () => {
    cortexClient.complete.mockRejectedValue(
      Object.assign(new Error('cortex.complete exceeded 15000ms'), { code: 'LLM_UNAVAILABLE' }));
    const out = await moduleActions.run('cortex', { prompt: 'hi' }, {}, [CAP]);
    expect(out.error).toMatch(/exceeded/);
  });

  test('output is truncated rather than unbounded', async () => {
    cortexClient.complete.mockResolvedValue('x'.repeat(5000));
    const out = await moduleActions.run('cortex', { prompt: 'p' }, {}, [CAP]);
    expect(out.truncated).toBe(true);
    expect(out.text.length).toBeLessThanOrEqual(4001); // 4000 + ellipsis
  });

  test('timeoutMs is clamped into a sane band', async () => {
    cortexClient.complete.mockResolvedValue('ok');
    await moduleActions.run('cortex', { prompt: 'p', timeoutMs: 999999 }, {}, [CAP]);
    expect(cortexClient.complete.mock.calls[0][2].timeoutMs).toBe(60000);
  });
});

// ---------------------------------------------------------------- ai fields

describe('AI field definitions', () => {
  test('a well-formed ai field validates', () => {
    expect(validateFieldDef({ key: 'summary', type: 'text', aiPrompt: 'Summarize {{body}}' })).toEqual([]);
    expect(isAiField({ key: 'summary', aiPrompt: 'x' })).toBe(true);
    expect(isAiField({ key: 'plain', type: 'string' })).toBe(false);
  });

  test('an ai field must be string/text and carry a non-empty prompt', () => {
    expect(validateFieldDef({ key: 'n', type: 'number', aiPrompt: 'x' }).join(' '))
      .toMatch(/must be type string or text/);
    expect(validateFieldDef({ key: 's', type: 'text', aiPrompt: '  ' }).join(' '))
      .toMatch(/empty aiPrompt/);
  });

  test('an ai field cannot also be a formula field', () => {
    expect(validateFieldDef({ key: 's', type: 'string', aiPrompt: 'x', formula: 'a * b' }).join(' '))
      .toMatch(/both a formula and an aiPrompt/);
  });

  // The synchronous validator must not reject a write just because the async
  // value hasn't been produced yet — including for `required` ai fields.
  test('validateRecord skips ai fields entirely, even when required', () => {
    const fields = [
      { key: 'body', type: 'text', required: true },
      { key: 'summary', type: 'text', required: true, aiPrompt: 'Summarize {{body}}' },
    ];
    const r = validateRecord(fields, { body: 'hello world', summary: 'user-supplied' });
    expect(r.valid).toBe(true);
    expect(r.data.summary).toBeUndefined(); // derived later, input ignored
  });
});

describe('applyAiFields (async write path)', () => {
  const { applyAiFields } = require('../src/services/entityService');

  const entity = {
    id: 'e1',
    fields: [
      { key: 'body', type: 'text' },
      { key: 'summary', type: 'text', aiPrompt: 'Summarize: {{body}}' },
    ],
  };

  test('generates the field and interpolates sibling values', async () => {
    cortexClient.isEnabled.mockReturnValue(true);
    cortexClient.complete.mockResolvedValue('a summary');
    const data = { body: 'the quick brown fox' };
    await applyAiFields(entity, data);
    expect(data.summary).toBe('a summary');
    expect(cortexClient.complete.mock.calls[0][1]).toBe('Summarize: the quick brown fox');
  });

  test('an LLM failure leaves the write intact and preserves the prior value', async () => {
    cortexClient.isEnabled.mockReturnValue(true);
    cortexClient.complete.mockRejectedValue(new Error('router down'));
    const data = { body: 'new body' };
    await expect(applyAiFields(entity, data, { summary: 'previous summary' })).resolves.toBeUndefined();
    expect(data.summary).toBe('previous summary'); // NOT nulled
  });

  test('a disabled cortex preserves the prior value rather than nulling the column', async () => {
    cortexClient.isEnabled.mockReturnValue(false);
    const data = { body: 'new body' };
    await applyAiFields(entity, data, { summary: 'previous summary' });
    expect(data.summary).toBe('previous summary');
    expect(cortexClient.complete).not.toHaveBeenCalled();
  });

  test('entities without ai fields never touch cortex', async () => {
    cortexClient.isEnabled.mockReturnValue(true);
    await applyAiFields({ id: 'e2', fields: [{ key: 'a', type: 'string' }] }, {});
    expect(cortexClient.isEnabled).not.toHaveBeenCalled();
  });
});
