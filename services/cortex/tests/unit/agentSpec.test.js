'use strict';

// FEAT-080 — deterministic agent-spec validation (the enable gate).
//
// The C/B condition pinned as AC: the draft → validated/enabled gate is
// deterministic spec validation ONLY — schema validity, referenced
// tools/skills/guardrails exist, model resolvable. These tests exercise the
// pure validators with injected reference sets: no DB, no Redis, no LLM.

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const {
  validateSpec, gateProblems, normalizeSpec, buildSpec, CHANNELS, SPEC_VERSION,
} = require('../../src/engine/agents');

const REFS = {
  toolNames: new Set(['weather', 'word-count']),
  skillNames: new Set(['concise-writing']),
  guardrailNames: new Set(['no-pii']),
  modelIds: new Set(['aurora-0.6b', 'big-brain-7b']),
};

const valid = (over = {}) => ({
  version: 1,
  name: 'research-helper',
  description: 'Researches things',
  system_prompt: 'You are a careful research agent.',
  channel: 'task',
  model: null,
  tools: null,
  skills: [],
  guardrails: null,
  max_iterations: 12,
  steps: [],
  ...over,
});

describe('validateSpec (schema / save gate)', () => {
  test('a well-formed spec has no problems', () => {
    expect(validateSpec(valid())).toEqual([]);
  });

  test('defaults are accepted (channel/model/tools/skills/max_iterations omitted)', () => {
    expect(validateSpec({
      name: 'minimal', description: 'd', system_prompt: 'p',
    })).toEqual([]);
  });

  test.each([
    ['bad name', { name: 'no spaces allowed!' }, /name/],
    ['missing description', { description: ' ' }, /description/],
    ['missing system_prompt', { system_prompt: '' }, /system_prompt/],
    ['unknown channel', { channel: 'assistant' }, /channel/],
    ['unknown version', { version: 2 }, /version/],
    ['empty-string model', { model: '  ' }, /model/],
    ['tools not a list', { tools: 'weather' }, /tools/],
    ['skills not strings', { skills: [1] }, /skills/],
    ['guardrails not a list', { guardrails: 'no-pii' }, /guardrails/],
    ['max_iterations 0', { max_iterations: 0 }, /max_iterations/],
    ['max_iterations 51', { max_iterations: 51 }, /max_iterations/],
    ['max_iterations float', { max_iterations: 1.5 }, /max_iterations/],
    ['steps not an array', { steps: {} }, /steps/],
  ])('%s is rejected', (_label, over, re) => {
    const problems = validateSpec(valid(over));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join('; ')).toMatch(re);
  });

  test("channel vocabulary is the guardrail engine's runtime set", () => {
    // 'chat' (assistant flows), NOT PromptLog's telemetry 'assistant'.
    expect(CHANNELS).toEqual(['task', 'chat', 'cs_chat', 'cs_email']);
    for (const channel of CHANNELS) {
      expect(validateSpec(valid({ channel }))).toEqual([]);
    }
  });

  test('steps now carry a real grammar — an incomplete step fails the save gate', () => {
    // FEAT-080 accepted ANY array here (steps were reserved authoring space).
    // FEAT-081 gives them a grammar, so a step missing its required field is
    // caught at SAVE time rather than surviving to the enable gate.
    const problems = validateSpec(valid({ steps: [{ type: 'prompt' }] }));
    expect(problems.join('; ')).toMatch(/steps\[0\]\.prompt: required/);
  });

  test('a well-formed step list is saveable', () => {
    expect(validateSpec(valid({
      steps: [{ type: 'prompt', prompt: 'Summarize {{input}}', as: 'draft' }],
    }))).toEqual([]);
  });

  test('a `parallel` step is SAVEABLE — deferred, not forbidden (FEAT-096)', () => {
    // Load-bearing: an author must be able to write and save a parallel step
    // today and have it start working when FEAT-096 lands, with no spec
    // rewrite. Rejecting it here would break that forward-compatibility promise.
    expect(validateSpec(valid({
      steps: [{ type: 'parallel', steps: [{ type: 'prompt', prompt: 'a' }] }],
    }))).toEqual([]);
  });
});

describe('gateProblems (deterministic validate/enable gate)', () => {
  test('valid spec with existing references passes', () => {
    expect(gateProblems(valid({
      model: 'aurora-0.6b',
      tools: ['weather'],
      skills: ['concise-writing'],
      guardrails: ['no-pii'],
    }), REFS)).toEqual([]);
  });

  test('null model needs no router list (brain model resolvable by definition)', () => {
    expect(gateProblems(valid(), { ...REFS, modelIds: null })).toEqual([]);
  });

  test.each([
    ['unknown tool', { tools: ['nope'] }, /tool not found: nope/],
    ['unknown skill', { skills: ['nope'] }, /skill not found: nope/],
    ['unknown guardrail', { guardrails: ['nope'] }, /guardrail not found: nope/],
    ['unresolvable model', { model: 'ghost-13b' }, /model not resolvable/],
  ])('%s fails the gate', (_label, over, re) => {
    expect(gateProblems(valid(over), REFS).join('; ')).toMatch(re);
  });

  test('a valid multi-step spec now PASSES the gate (FEAT-081)', () => {
    expect(gateProblems(valid({
      steps: [
        { type: 'prompt', prompt: 'Draft: {{input}}', as: 'draft' },
        { type: 'guardrail', guardrails: ['no-pii'], value: '{{draft}}' },
        { type: 'tool_loop', goal: '{{draft}}', tools: ['weather'] },
      ],
    }), REFS)).toEqual([]);
  });

  test('a `parallel` step is rejected AT THE GATE, and only there', () => {
    const spec = valid({
      steps: [{ type: 'parallel', steps: [{ type: 'prompt', prompt: 'a' }] }],
    });
    expect(validateSpec(spec)).toEqual([]);            // saveable
    const problems = gateProblems(spec, REFS);          // not enableable
    expect(problems.join('; ')).toMatch(/not yet supported \(deferred to FEAT-096\)/);
  });

  test('the gate checks per-step references', () => {
    const problems = gateProblems(valid({
      steps: [
        { type: 'skill', skill: 'nope', prompt: 'x' },
        { type: 'guardrail', guardrails: ['ghost'], value: '{{input}}' },
        { type: 'tool_loop', goal: 'g', tools: ['missing-tool'] },
      ],
    }), REFS).join('; ');
    expect(problems).toMatch(/skill not found: nope/);
    expect(problems).toMatch(/guardrail not found: ghost/);
    expect(problems).toMatch(/tool not found: missing-tool/);
  });

  test('the gate is pure — no I/O, deterministic across calls', () => {
    const spec = valid({ model: 'aurora-0.6b', tools: ['weather'] });
    expect(gateProblems(spec, REFS)).toEqual(gateProblems(spec, REFS));
  });
});

describe('normalizeSpec', () => {
  test('fills defaults and stamps the version', () => {
    const n = normalizeSpec({ name: 'x', description: 'd', system_prompt: 'p' });
    expect(n).toEqual({
      version: SPEC_VERSION, name: 'x', description: 'd', system_prompt: 'p',
      channel: 'task', model: null, tools: null, skills: [], guardrails: null,
      max_iterations: 12, steps: [],
    });
  });
});

describe('buildSpec (NL builder — deterministic parsing around the LLM draft)', () => {
  const draft = {
    name: 'summarizer', description: 'Summarizes documents',
    system_prompt: 'You summarize documents carefully and end with a bullet list.',
    channel: 'task', model: null, tools: null, skills: [], max_iterations: 12,
  };

  test('parses a clean JSON draft; always drafts (never enabled), steps cleared', async () => {
    const chatFn = jest.fn(async () => JSON.stringify({ ...draft, steps: [{ type: 'prompt' }] }));
    const { spec, problems } = await buildSpec('summarize docs', chatFn);
    expect(problems).toEqual([]);
    expect(spec.steps).toEqual([]);
    expect(spec.built_from).toBe('summarize docs');
    expect(spec.enabled).toBeUndefined(); // lifecycle lives in status, not the spec
  });

  test('caller-forced name wins over the model draft', async () => {
    const chatFn = async () => JSON.stringify(draft);
    const { spec } = await buildSpec('x', chatFn, { name: 'forced-name' });
    expect(spec.name).toBe('forced-name');
  });

  test('no JSON in the reply => problems, no spec', async () => {
    const { spec, problems } = await buildSpec('x', async () => 'sorry, no');
    expect(spec).toBeNull();
    expect(problems).toEqual(['model returned no JSON object']);
  });

  test('schema-invalid draft surfaces validation problems', async () => {
    const { problems } = await buildSpec('x',
      async () => JSON.stringify({ ...draft, system_prompt: '' }));
    expect(problems.join('; ')).toMatch(/system_prompt/);
  });
});
