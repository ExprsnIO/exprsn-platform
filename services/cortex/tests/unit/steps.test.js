'use strict';

/**
 * FEAT-081 — step grammar, `{{var}}` interpolation, and the enable gate.
 *
 * The single most load-bearing behaviour in this file is the `parallel`
 * asymmetry: it must VALIDATE and SAVE today, and be refused only at the enable
 * gate. That is what lets an author write a parallel step now and have it start
 * working when FEAT-096 lands, with no spec rewrite and no migration. Four
 * downstream tickets consume this spec format, so a change here is expensive.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const {
  STEP_TYPES, DEFERRED_STEP_TYPES,
  interpolate, referencedVars,
  validateSteps, stepGateProblems, walkSteps,
  MAX_DEPTH,
} = require('../../src/engine/steps');

const REFS = {
  skillNames: new Set(['concise-writing']),
  guardrailNames: new Set(['no-pii', 'switched-off']),
  enabledGuardrailNames: new Set(['no-pii']),
  toolNames: new Set(['weather']),
};

const ok = (steps) => expect(validateSteps(steps)).toEqual([]);
const problemsFor = (steps) => validateSteps(steps).join('; ');

describe('interpolate', () => {
  it('substitutes known variables', () => {
    expect(interpolate('Hello {{name}}!', { name: 'world' })).toBe('Hello world!');
  });

  it('tolerates whitespace inside the braces', () => {
    expect(interpolate('{{ name }}', { name: 'x' })).toBe('x');
  });

  it('renders an unknown variable as empty rather than throwing', () => {
    // A half-completed chain should degrade, not explode; `condition`'s `empty`
    // operator is the intended way to branch on "the last step produced nothing".
    expect(interpolate('[{{missing}}]', {})).toBe('[]');
  });

  it('renders null and undefined as empty', () => {
    expect(interpolate('[{{a}}{{b}}]', { a: null, b: undefined })).toBe('[]');
  });

  it('JSON-encodes non-string values so parsed objects can be fed back into prompts', () => {
    expect(interpolate('{{o}}', { o: { a: 1 } })).toBe('{"a":1}');
    expect(interpolate('{{n}}', { n: 42 })).toBe('42');
  });

  it('substitutes the same variable more than once', () => {
    expect(interpolate('{{x}}-{{x}}', { x: 'a' })).toBe('a-a');
  });

  it('leaves malformed or non-identifier placeholders alone', () => {
    expect(interpolate('{{ 9bad }} {{}} {single}', { '9bad': 'v' }))
      .toBe('{{ 9bad }} {{}} {single}');
  });

  it('returns empty for a non-string template', () => {
    expect(interpolate(null, {})).toBe('');
    expect(interpolate(42, {})).toBe('');
  });
});

describe('referencedVars', () => {
  it('lists each referenced variable once, in order', () => {
    expect(referencedVars('{{a}} {{b}} {{a}}')).toEqual(['a', 'b']);
  });

  it('returns empty for templates with no references', () => {
    expect(referencedVars('plain text')).toEqual([]);
  });
});

describe('validateSteps — the SAVE gate', () => {
  it('accepts null/empty (the classic single tool-loop agent)', () => {
    expect(validateSteps(null)).toEqual([]);
    expect(validateSteps([])).toEqual([]);
  });

  it('rejects a non-array', () => {
    expect(validateSteps('nope')).toEqual(['steps must be an array']);
  });

  it('rejects an unknown step type, naming the position', () => {
    expect(problemsFor([{ type: 'teleport' }])).toMatch(/steps\[0\]: type must be one of/);
  });

  it('accepts every executable step type in its minimal valid form', () => {
    ok([
      { type: 'prompt', prompt: 'p' },
      { type: 'skill', skill: 'concise-writing', prompt: 'p' },
      { type: 'retrieve', query: 'q' },
      { type: 'guardrail', guardrails: ['no-pii'], value: '{{input}}' },
      { type: 'moderate', value: '{{input}}' },
      { type: 'transform', op: 'trim', value: '{{input}}' },
      { type: 'condition', op: 'not_empty', when: '{{input}}', then: [{ type: 'prompt', prompt: 'x' }] },
      { type: 'tool_loop', goal: 'g' },
    ]);
  });

  it('covers all 8 executable types in that list', () => {
    expect(STEP_TYPES).toHaveLength(8);
  });

  describe('per-type required fields', () => {
    it.each([
      [{ type: 'prompt' }, /prompt: required/],
      [{ type: 'skill', prompt: 'p' }, /skill name required/],
      [{ type: 'skill', skill: 's' }, /prompt: required/],
      [{ type: 'retrieve' }, /query: required/],
      [{ type: 'guardrail', value: 'v' }, /non-empty list of guardrail names required/],
      [{ type: 'guardrail', guardrails: ['g'] }, /value: required/],
      [{ type: 'moderate' }, /value: required/],
      [{ type: 'transform', value: 'v' }, /op: must be one of/],
      [{ type: 'transform', op: 'trim' }, /value: required/],
      [{ type: 'condition', when: 'x' }, /op: must be one of/],
      [{ type: 'tool_loop' }, /goal: required/],
    ])('%j', (step, re) => {
      expect(problemsFor([step])).toMatch(re);
    });
  });

  it('concat reads `values`, not `value` — a concat step is saveable without one', () => {
    // Caught by the live smoke: requiring `value` for every transform made
    // every concat step unsaveable.
    ok([{ type: 'transform', op: 'concat', values: ['a', '{{b}}'] }]);
    expect(problemsFor([{ type: 'transform', op: 'concat' }]))
      .toMatch(/values: non-empty list required for concat/);
  });

  it('validates a regex-bearing transform actually compiles', () => {
    expect(problemsFor([{ type: 'transform', op: 'regex_extract', value: 'v', pattern: '([' }]))
      .toMatch(/invalid regex/);
    ok([{ type: 'transform', op: 'regex_extract', value: 'v', pattern: '(\\d+)' }]);
  });

  it('validates a `matches` condition regex', () => {
    expect(problemsFor([{ type: 'condition', op: 'matches', when: '{{x}}', value: '(', then: [] }]))
      .toMatch(/invalid regex/);
  });

  it('requires a condition to have at least one branch', () => {
    expect(problemsFor([{ type: 'condition', op: 'not_empty', when: '{{x}}' }]))
      .toMatch(/needs at least one of 'then' \/ 'else'/);
  });

  it('validates steps nested inside condition branches, with a path', () => {
    expect(problemsFor([{
      type: 'condition', op: 'not_empty', when: '{{x}}',
      then: [{ type: 'prompt' }],
    }])).toMatch(/steps\[0\]\.then\[0\]\.prompt: required/);
  });

  it('rejects a bad `as` / `id` variable name', () => {
    expect(problemsFor([{ type: 'prompt', prompt: 'p', as: '9bad' }])).toMatch(/\.as: must be a variable name/);
    expect(problemsFor([{ type: 'prompt', prompt: 'p', id: 'has space' }])).toMatch(/\.id: must be a/);
  });

  it('bounds nesting depth', () => {
    let inner = { type: 'prompt', prompt: 'deep' };
    for (let i = 0; i <= MAX_DEPTH + 1; i++) {
      inner = { type: 'condition', op: 'not_empty', when: '{{x}}', then: [inner] };
    }
    expect(problemsFor([inner])).toMatch(/nesting deeper than/);
  });

  it('bounds list length', () => {
    const many = Array.from({ length: 60 }, () => ({ type: 'prompt', prompt: 'p' }));
    expect(problemsFor(many)).toMatch(/more than 50 steps/);
  });
});

describe('the `parallel` contract (C/B reduction, pinned as an AC)', () => {
  const parallelStep = {
    type: 'parallel',
    steps: [{ type: 'prompt', prompt: 'a' }, { type: 'prompt', prompt: 'b' }],
  };

  it('is NOT in the executable list', () => {
    expect(STEP_TYPES).not.toContain('parallel');
    expect(DEFERRED_STEP_TYPES).toEqual(['parallel']);
  });

  it('VALIDATES at save time — authoring stays open', () => {
    ok([parallelStep]);
  });

  it('is still fully validated, not waved through', () => {
    expect(problemsFor([{ type: 'parallel' }])).toMatch(/steps: non-empty list of steps required/);
    expect(problemsFor([{ type: 'parallel', steps: [{ type: 'prompt' }] }]))
      .toMatch(/steps\[0\]\.steps\[0\]\.prompt: required/);
  });

  it('is refused at the ENABLE gate with a clear, actionable message', () => {
    const problems = stepGateProblems([parallelStep], REFS).join('; ');
    expect(problems).toMatch(/not yet supported \(deferred to FEAT-096\)/);
    expect(problems).toMatch(/may be saved but cannot be enabled/);
  });

  it('is refused even when nested inside a condition branch', () => {
    const problems = stepGateProblems([{
      type: 'condition', op: 'not_empty', when: '{{input}}', then: [parallelStep],
    }], REFS).join('; ');
    expect(problems).toMatch(/steps\[0\]\.then\[0\].*deferred to FEAT-096/);
  });
});

describe('stepGateProblems — the ENABLE gate', () => {
  it('passes a valid chain whose references all exist', () => {
    expect(stepGateProblems([
      { type: 'skill', skill: 'concise-writing', prompt: 'p' },
      { type: 'guardrail', guardrails: ['no-pii'], value: '{{input}}' },
      { type: 'tool_loop', goal: 'g', tools: ['weather'] },
    ], REFS)).toEqual([]);
  });

  it('reports missing skill / guardrail / tool references with paths', () => {
    const problems = stepGateProblems([
      { type: 'skill', skill: 'ghost', prompt: 'p' },
      { type: 'guardrail', guardrails: ['no-pii', 'ghost-rail'], value: '{{input}}' },
      { type: 'tool_loop', goal: 'g', tools: ['ghost-tool'] },
    ], REFS).join('; ');
    expect(problems).toMatch(/steps\[0\]\.skill: skill not found: ghost/);
    expect(problems).toMatch(/steps\[1\]\.guardrails: guardrail not found: ghost-rail/);
    expect(problems).toMatch(/steps\[2\]\.tools: tool not found: ghost-tool/);
    expect(problems).not.toMatch(/no-pii/); // the existing one is not flagged
  });

  it('checks references inside nested branches too', () => {
    const problems = stepGateProblems([{
      type: 'condition', op: 'not_empty', when: '{{input}}',
      else: [{ type: 'skill', skill: 'ghost', prompt: 'p' }],
    }], REFS).join('; ');
    expect(problems).toMatch(/steps\[0\]\.else\[0\]\.skill: skill not found: ghost/);
  });

  it('short-circuits on a schema problem rather than reporting phantom refs', () => {
    expect(stepGateProblems([{ type: 'skill', skill: 'ghost' }], REFS).join('; '))
      .toMatch(/prompt: required/);
  });

  it('refuses a guardrail step naming a DISABLED guardrail (BUG-070)', () => {
    // Existence is not enough: the engine evaluates ENABLED specs only, so such
    // a step silently never fires. That is worse than omitting it, because the
    // spec reads as though the value is screened.
    expect(stepGateProblems([
      { type: 'guardrail', guardrails: ['switched-off'], value: '{{input}}' },
    ], REFS).join('; ')).toMatch(/guardrail is disabled, so this step would never fire: switched-off/);
  });

  it('accepts an enabled guardrail, and reports only the disabled one in a mixed list', () => {
    const problems = stepGateProblems([
      { type: 'guardrail', guardrails: ['no-pii', 'switched-off'], value: '{{input}}' },
    ], REFS).join('; ');
    expect(problems).toMatch(/switched-off/);
    expect(problems).not.toMatch(/no-pii/);
  });

  it('falls back to existence-only when enabled state is not supplied', () => {
    // Older callers pass no enabledGuardrailNames — better to under-report than
    // to fail every spec.
    expect(stepGateProblems([
      { type: 'guardrail', guardrails: ['switched-off'], value: '{{input}}' },
    ], { guardrailNames: new Set(['switched-off']) })).toEqual([]);
  });

  it('treats absent refs as empty sets rather than crashing', () => {
    expect(stepGateProblems([{ type: 'skill', skill: 'x', prompt: 'p' }], {}).join('; '))
      .toMatch(/skill not found: x/);
  });
});

describe('walkSteps', () => {
  it('visits nested then/else/parallel steps', () => {
    const seen = [];
    walkSteps([
      { type: 'prompt', prompt: 'a' },
      {
        type: 'condition', op: 'not_empty', when: '{{x}}',
        then: [{ type: 'prompt', prompt: 'b' }],
        else: [{ type: 'parallel', steps: [{ type: 'prompt', prompt: 'c' }] }],
      },
    ], (s, p) => seen.push(p));
    expect(seen).toEqual([
      'steps[0]', 'steps[1]', 'steps[1].then[0]', 'steps[1].else[0]', 'steps[1].else[0].steps[0]',
    ]);
  });
});
