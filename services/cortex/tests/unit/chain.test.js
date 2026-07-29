'use strict';

/**
 * FEAT-081 — the sequential chaining engine.
 *
 * The C/B named the edge cases here as the largest test-cost item in the whole
 * cortex slate, and the CI test job is non-blocking, so these are the real gate:
 * condition-on-missing-var, guardrail-halt, and step failure. The invariant
 * under test throughout is "guardrails are added per-step, never bypassed" —
 * every model-producing step's output is screened BEFORE it can enter the
 * context, so no later step can consume text the engine would have refused.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const { runChain, applyTransform, evalCondition } = require('../../src/engine/chain');

const pass = { action: null, hits: [] };

/** Deps with sane no-op defaults; override per test. */
function deps(over = {}) {
  return {
    runPrompt: jest.fn(async (p) => `answer:${p}`),
    runToolLoop: jest.fn(async (g) => ({ text: `loop:${g}`, transcript: [] })),
    screenOutput: jest.fn(async () => pass),
    evaluateGuardrails: jest.fn(async () => pass),
    moderate: jest.fn(async () => null),
    skillBlock: jest.fn(async (n) => `[skill:${n}]`),
    retrieve: jest.fn(async () => ''),
    onEscalate: jest.fn(async () => {}),
    ...over,
  };
}

const hit = (action, name = 'rule') => ({ action, hits: [{ guardrail: name, action }] });

describe('sequential execution + {{var}} threading', () => {
  it('runs steps in order and threads values between them', async () => {
    const d = deps();
    const r = await runChain([
      { type: 'prompt', prompt: 'first: {{input}}', as: 'a' },
      { type: 'prompt', prompt: 'second saw {{a}}', as: 'b' },
    ], 'GO', d);

    expect(d.runPrompt.mock.calls.map((c) => c[0])).toEqual([
      'first: GO',
      'second saw answer:first: GO',
    ]);
    expect(r.output).toBe('answer:second saw answer:first: GO');
    expect(r.halted).toBe(false);
  });

  it('exposes the run input as {{input}}', async () => {
    const d = deps();
    await runChain([{ type: 'prompt', prompt: '{{input}}' }], 'HELLO', d);
    expect(d.runPrompt.mock.calls[0][0]).toBe('HELLO');
  });

  it('binds under both `as` and `id`', async () => {
    const d = deps();
    await runChain([
      { type: 'prompt', prompt: 'x', as: 'viaAs', id: 'viaId' },
      { type: 'prompt', prompt: '{{viaAs}}|{{viaId}}' },
    ], 'in', d);
    expect(d.runPrompt.mock.calls[1][0]).toBe('answer:x|answer:x');
  });

  it('returns the last step value as the chain output', async () => {
    const r = await runChain([
      { type: 'transform', op: 'upper', value: 'a' },
      { type: 'transform', op: 'upper', value: 'b' },
    ], 'in', deps());
    expect(r.output).toBe('B');
  });

  it('records per-step inputs and outputs in the transcript (FEAT-080 ledger)', async () => {
    const r = await runChain([{ type: 'prompt', prompt: 'p {{input}}', as: 'a' }], 'IN', deps());
    const entries = r.transcript.filter((e) => e.type === 'prompt');
    expect(entries[0]).toMatchObject({ role: 'step', step: 'steps[0]', input: 'p IN' });
    expect(entries[1]).toMatchObject({ role: 'step', step: 'steps[0]', output: 'answer:p IN' });
  });
});

describe('step types', () => {
  it('skill prepends the skill block to the prompt', async () => {
    const d = deps();
    await runChain([{ type: 'skill', skill: 'concise', prompt: 'do it' }], 'in', d);
    expect(d.skillBlock).toHaveBeenCalledWith('concise');
    expect(d.runPrompt.mock.calls[0][0]).toBe('[skill:concise]\n\ndo it');
  });

  it('retrieve degrades to an empty result rather than erroring (until FEAT-095)', async () => {
    const d = deps();
    const r = await runChain([{ type: 'retrieve', query: '{{input}}', as: 'chunks' }], 'q', d);
    expect(d.retrieve).toHaveBeenCalledWith('q', { topK: 5 });
    expect(r.halted).toBe(false);
    expect(r.context.chunks).toBe('');
    expect(r.transcript.find((e) => e.type === 'retrieve').note).toMatch(/no KB bound/);
  });

  it('a chain containing only a retrieve step still completes', async () => {
    const r = await runChain([{ type: 'retrieve', query: 'q' }], 'in', deps());
    expect(r.halted).toBe(false);
  });

  it('tool_loop folds the inner loop transcript into the run ledger', async () => {
    const d = deps({
      runToolLoop: async () => ({
        text: 'done',
        transcript: [{ role: 'tool', name: 'read_file', content: 'x' }],
      }),
    });
    const r = await runChain([{ type: 'tool_loop', goal: 'g' }], 'in', d);
    expect(r.transcript).toContainEqual(
      expect.objectContaining({ role: 'tool', name: 'read_file', step: 'steps[0]' }));
  });

  it('tool_loop passes through its model / iteration / tool overrides', async () => {
    const d = deps();
    await runChain([{
      type: 'tool_loop', goal: 'g', model: 'm2', max_iterations: 3, tools: ['weather'],
    }], 'in', d);
    expect(d.runToolLoop).toHaveBeenCalledWith('g', {
      model: 'm2', maxIterations: 3, tools: ['weather'],
    });
  });

  it('moderate routes through the moderator hook and passes when clean', async () => {
    const d = deps({ moderate: jest.fn(async () => ({ effective: 'pass' })) });
    const r = await runChain([{ type: 'moderate', value: '{{input}}' }], 'text', d);
    expect(d.moderate).toHaveBeenCalledWith('text');
    expect(r.halted).toBe(false);
  });

  it('moderate tolerates a null verdict (moderation disabled / unreachable)', async () => {
    const r = await runChain([{ type: 'moderate', value: 'v' }], 'in', deps());
    expect(r.halted).toBe(false);
  });
});

describe('transforms', () => {
  const t = (step, ctx = {}) => applyTransform(step, ctx);

  it('trim / lower / upper / slice', () => {
    expect(t({ op: 'trim', value: '  x  ' })).toBe('x');
    expect(t({ op: 'lower', value: 'AB' })).toBe('ab');
    expect(t({ op: 'upper', value: 'ab' })).toBe('AB');
    expect(t({ op: 'slice', value: 'abcdef', start: 1, end: 3 })).toBe('bc');
  });

  it('json_parse returns an error VALUE rather than throwing', () => {
    // Models return near-JSON constantly; a parse failure must be branchable
    // with a condition step, not fatal to the run.
    expect(t({ op: 'json_parse', value: '{"a":1}' })).toEqual({ a: 1 });
    expect(t({ op: 'json_parse', value: 'nope' }).error).toMatch(/invalid JSON/);
  });

  it('json_stringify round-trips a parsed value', () => {
    expect(t({ op: 'json_stringify', value: '{{o}}' }, { o: { a: 1 } })).toBe('"{\\"a\\":1}"');
  });

  it('regex_extract returns the first group, or the whole match, or empty', () => {
    expect(t({ op: 'regex_extract', value: 'id=42', pattern: 'id=(\\d+)' })).toBe('42');
    expect(t({ op: 'regex_extract', value: 'id=42', pattern: '\\d+' })).toBe('42');
    expect(t({ op: 'regex_extract', value: 'none', pattern: '(\\d+)' })).toBe('');
  });

  it('replace and concat interpolate their arguments', () => {
    expect(t({ op: 'replace', value: 'a-b', pattern: '-', replacement: '{{sep}}' }, { sep: '+' })).toBe('a+b');
    expect(t({ op: 'concat', values: ['{{a}}', 'B'], separator: '/' }, { a: 'A' })).toBe('A/B');
  });

  it('interpolates the value before transforming', () => {
    expect(t({ op: 'upper', value: '{{x}}' }, { x: 'hi' })).toBe('HI');
  });
});

describe('conditions', () => {
  const c = (step, ctx = {}) => evalCondition(step, ctx);

  it('supports every documented operator', () => {
    expect(c({ op: 'contains', when: 'abc', value: 'b' })).toBe(true);
    expect(c({ op: 'not_contains', when: 'abc', value: 'z' })).toBe(true);
    expect(c({ op: 'equals', when: 'a', value: 'a' })).toBe(true);
    expect(c({ op: 'not_equals', when: 'a', value: 'b' })).toBe(true);
    expect(c({ op: 'matches', when: 'x42', value: '\\d+' })).toBe(true);
    expect(c({ op: 'empty', when: '   ' })).toBe(true);
    expect(c({ op: 'not_empty', when: 'x' })).toBe(true);
    expect(c({ op: 'gt', when: '5', value: '3' })).toBe(true);
    expect(c({ op: 'lt', when: '3', value: '5' })).toBe(true);
  });

  it('a missing variable is empty — the documented way to branch on "no result"', () => {
    // Named in the C/B as an edge case to cover: condition-on-missing-var.
    expect(c({ op: 'empty', when: '{{nothing}}' }, {})).toBe(true);
    expect(c({ op: 'not_empty', when: '{{nothing}}' }, {})).toBe(false);
  });

  it('takes the then branch and runs its steps', async () => {
    const d = deps();
    const r = await runChain([{
      type: 'condition', op: 'contains', when: '{{input}}', value: 'yes',
      then: [{ type: 'prompt', prompt: 'THEN' }],
      else: [{ type: 'prompt', prompt: 'ELSE' }],
    }], 'yes please', d);
    expect(d.runPrompt.mock.calls[0][0]).toBe('THEN');
    expect(r.transcript.find((e) => e.type === 'condition').branch).toBe('then');
  });

  it('takes the else branch when the test fails', async () => {
    const d = deps();
    await runChain([{
      type: 'condition', op: 'contains', when: '{{input}}', value: 'yes',
      then: [{ type: 'prompt', prompt: 'THEN' }],
      else: [{ type: 'prompt', prompt: 'ELSE' }],
    }], 'no thanks', d);
    expect(d.runPrompt.mock.calls[0][0]).toBe('ELSE');
  });

  it('is a no-op when the taken branch is absent', async () => {
    const d = deps();
    const r = await runChain([
      { type: 'transform', op: 'upper', value: 'keep' },
      { type: 'condition', op: 'equals', when: 'a', value: 'b', then: [{ type: 'prompt', prompt: 'x' }] },
    ], 'in', d);
    expect(d.runPrompt).not.toHaveBeenCalled();
    expect(r.output).toBe('KEEP'); // a condition writes no value of its own
  });

  it('runs nested branch steps with correct transcript paths', async () => {
    const r = await runChain([{
      type: 'condition', op: 'not_empty', when: '{{input}}',
      then: [{ type: 'prompt', prompt: 'inner' }],
    }], 'x', deps());
    expect(r.transcript.some((e) => e.step === 'steps[0].then[0]')).toBe(true);
  });
});

describe('guardrails are added per-step, never bypassed', () => {
  it('screens EVERY model-producing step output before it enters the context', async () => {
    const d = deps();
    await runChain([
      { type: 'prompt', prompt: 'a', as: 'x' },
      { type: 'tool_loop', goal: 'b' },
      { type: 'skill', skill: 's', prompt: 'c' },
    ], 'in', d);
    expect(d.screenOutput).toHaveBeenCalledTimes(3);
  });

  it('does NOT let blocked text reach a later step', async () => {
    const d = deps({ screenOutput: jest.fn(async () => hit('block', 'no-secrets')) });
    const r = await runChain([
      { type: 'prompt', prompt: 'leak', as: 'secret' },
      { type: 'prompt', prompt: 'now use {{secret}}' },
    ], 'in', d);
    expect(r.halted).toBe(true);
    expect(d.runPrompt).toHaveBeenCalledTimes(1);      // the second step never ran
    expect(r.context.secret).toBeUndefined();          // and nothing was bound
    expect(r.haltReason.message).toMatch(/blocked by guardrail\(s\): no-secrets/);
  });

  it('escalating a step output files a Review and halts', async () => {
    const d = deps({ screenOutput: jest.fn(async () => hit('escalate', 'needs-review')) });
    const r = await runChain([{ type: 'prompt', prompt: 'p' }], 'in', d);
    expect(d.onEscalate).toHaveBeenCalledTimes(1);
    expect(r.halted).toBe(true);
    expect(r.haltReason.action).toBe('escalate');
  });

  it('records a warn hit but keeps going', async () => {
    const d = deps({ screenOutput: jest.fn(async () => hit('warn', 'style')) });
    const r = await runChain([
      { type: 'prompt', prompt: 'a' }, { type: 'prompt', prompt: 'b' },
    ], 'in', d);
    expect(r.halted).toBe(false);
    expect(d.runPrompt).toHaveBeenCalledTimes(2);
    expect(r.transcript.some((e) => e.role === 'guardrail' && e.action === 'warn')).toBe(true);
  });

  it('an explicit guardrail step ADDS named checks without replacing the global screen', async () => {
    const d = deps({ evaluateGuardrails: jest.fn(async () => pass) });
    await runChain([
      { type: 'prompt', prompt: 'p', as: 'draft' },
      { type: 'guardrail', guardrails: ['no-pii'], value: '{{draft}}' },
    ], 'in', d);
    expect(d.screenOutput).toHaveBeenCalledTimes(1);          // global, on the prompt step
    expect(d.evaluateGuardrails).toHaveBeenCalledWith('answer:p', ['no-pii']);
  });
});

describe('failure policy', () => {
  it('halts by default on a guardrail-step block', async () => {
    const d = deps({ evaluateGuardrails: jest.fn(async () => hit('block')) });
    const r = await runChain([
      { type: 'guardrail', guardrails: ['g'], value: '{{input}}' },
      { type: 'prompt', prompt: 'never' },
    ], 'in', d);
    expect(r.halted).toBe(true);
    expect(d.runPrompt).not.toHaveBeenCalled();
  });

  it('on_fail=continue records the hit and carries on', async () => {
    const d = deps({ evaluateGuardrails: jest.fn(async () => hit('block')) });
    const r = await runChain([
      { type: 'guardrail', guardrails: ['g'], value: '{{input}}', on_fail: 'continue' },
      { type: 'prompt', prompt: 'still runs' },
    ], 'in', d);
    expect(r.halted).toBe(false);
    expect(d.runPrompt).toHaveBeenCalledTimes(1);
    expect(r.transcript.some((e) => e.note === 'on_fail=continue')).toBe(true);
  });

  it('on_fail=escalate files a Review and halts', async () => {
    const d = deps({ evaluateGuardrails: jest.fn(async () => hit('block')) });
    const r = await runChain([
      { type: 'guardrail', guardrails: ['g'], value: '{{input}}', on_fail: 'escalate' },
    ], 'in', d);
    expect(d.onEscalate).toHaveBeenCalledTimes(1);
    expect(r.haltReason.action).toBe('escalate');
  });

  it('an escalate verdict defaults to escalating even without on_fail', async () => {
    const d = deps({ evaluateGuardrails: jest.fn(async () => hit('escalate')) });
    const r = await runChain([
      { type: 'guardrail', guardrails: ['g'], value: '{{input}}' },
    ], 'in', d);
    expect(r.haltReason.action).toBe('escalate');
  });

  it('a blocking moderator verdict halts the chain', async () => {
    const d = deps({ moderate: jest.fn(async () => ({ effective: 'block', rejected: true })) });
    const r = await runChain([
      { type: 'moderate', value: '{{input}}' },
      { type: 'prompt', prompt: 'never' },
    ], 'in', d);
    expect(r.halted).toBe(true);
    expect(d.runPrompt).not.toHaveBeenCalled();
  });

  it('a warn verdict never halts', async () => {
    const d = deps({ evaluateGuardrails: jest.fn(async () => hit('warn')) });
    const r = await runChain([{ type: 'guardrail', guardrails: ['g'], value: 'v' }], 'in', d);
    expect(r.halted).toBe(false);
  });

  it('a step that throws propagates as a run failure, not a silent skip', async () => {
    const d = deps({ runPrompt: jest.fn(async () => { throw new Error('router down'); }) });
    await expect(runChain([{ type: 'prompt', prompt: 'p' }], 'in', d)).rejects.toThrow('router down');
  });

  it('records the halting step and reason in the transcript', async () => {
    const d = deps({ screenOutput: jest.fn(async () => hit('block', 'nope')) });
    const r = await runChain([{ type: 'prompt', prompt: 'p' }], 'in', d);
    const sys = r.transcript.find((e) => e.role === 'system');
    expect(sys.step).toBe('steps[0]');
    expect(sys.action).toBe('halt');
  });

  it('bounds total executed steps so a pathological spec cannot spin', async () => {
    const many = Array.from({ length: 30 }, () => ({ type: 'transform', op: 'trim', value: 'x' }));
    const r = await runChain(many, 'in', deps(), { maxSteps: 10 });
    expect(r.halted).toBe(true);
    expect(r.haltReason.message).toMatch(/exceeded 10 executed steps/);
  });
});
