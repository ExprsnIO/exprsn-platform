'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Agent step schema + `{{var}}` interpolation (FEAT-081).
 *
 * FEAT-080 reserved `spec.steps` as authoring space: drafts could hold any
 * array, and the enable gate rejected a non-empty one outright. This file gives
 * that array a real grammar — 8 executable step types, executed SEQUENTIALLY by
 * `engine/chain.js`.
 *
 *   prompt      one LLM call over an interpolated template
 *   skill       a prompt step with a named skill's guidance block prepended
 *   retrieve    KB lookup — a graceful no-op returning '' until FEAT-095
 *   guardrail   run named guardrails over a value; halt/escalate on a hit
 *   moderate    route a value through the moderator-module screen
 *   transform   deterministic text munging, no model involved
 *   condition   branch into `then` / `else` step lists
 *   tool_loop   the existing tool-calling agent loop (engine/agent.js runAgent)
 *
 * ── The `parallel` contract (C/B reduction, pinned as an AC) ────────────────
 * The 9th type, `parallel`, is DEFERRED to FEAT-096: the single-resident-model
 * semaphore serializes parallel LLM steps anyway, while `parallel` carries most
 * of the engine's failure-mode complexity. But the spec format accepts and
 * fully VALIDATES it from day one — it is only rejected at the *enable* gate,
 * with a clear "not yet supported" message. That asymmetry is deliberate and
 * load-bearing: an author can write a `parallel` step today, save it, and have
 * it start working when FEAT-096 lands, with no spec rewrite and no migration.
 * Anything that makes `parallel` fail at SAVE time breaks that promise.
 *
 * Everything here is pure and I/O-free so it can be unit-tested without a DB,
 * a router, or a queue — the same posture as FEAT-080's `validateSpec`.
 * ═══════════════════════════════════════════════════════════
 */

// Executable today. `parallel` is intentionally NOT in this list — see below.
const STEP_TYPES = [
  'prompt', 'skill', 'retrieve', 'guardrail', 'moderate',
  'transform', 'condition', 'tool_loop',
];

// Validated and saveable, but rejected by the enable gate until FEAT-096.
const DEFERRED_STEP_TYPES = ['parallel'];

const ALL_STEP_TYPES = [...STEP_TYPES, ...DEFERRED_STEP_TYPES];

// Deterministic, side-effect-free transforms. Deliberately a closed set: a
// step type that could run arbitrary expressions would be a sandbox-escape
// surface, and skills/functions (FEAT-083/084/085) are where real code belongs.
const TRANSFORM_OPS = ['trim', 'lower', 'upper', 'slice', 'json_parse', 'json_stringify', 'regex_extract', 'concat', 'replace'];

// Comparison operators for `condition`.
const CONDITION_OPS = ['contains', 'not_contains', 'equals', 'not_equals', 'matches', 'empty', 'not_empty', 'gt', 'lt'];

// What a guardrail/moderate hit does to the run.
const ON_FAIL = ['halt', 'escalate', 'continue'];

const VAR_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_STEPS = 50;      // per list, incl. nested branches
const MAX_DEPTH = 5;       // condition/parallel nesting

const isStrList = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string');

// ---------------------------------------------------------------- interpolation

/**
 * Substitute `{{var}}` references from `ctx`. An unknown variable renders as
 * the empty string rather than throwing: a chain that half-completes should
 * degrade, not explode, and `condition`'s `empty` operator is the intended way
 * to branch on "the previous step produced nothing".
 *
 * Values that aren't strings are JSON-encoded, so a `json_parse` result can be
 * fed back into a prompt without the author having to think about it.
 */
function interpolate(template, ctx = {}) {
  if (typeof template !== 'string') return '';
  return template.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (_, name) => {
    const v = ctx[name];
    if (v === undefined || v === null) return '';
    return typeof v === 'string' ? v : JSON.stringify(v);
  });
}

/** Every `{{var}}` name referenced by a template, in order of appearance. */
function referencedVars(template) {
  const out = [];
  if (typeof template !== 'string') return out;
  const re = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
  let m = re.exec(template);
  while (m) {
    if (!out.includes(m[1])) out.push(m[1]);
    m = re.exec(template);
  }
  return out;
}

// ---------------------------------------------------------------- validation

function pushIf(problems, cond, msg) {
  if (cond) problems.push(msg);
}

/**
 * Validate one step. `path` is a human-readable location like `steps[2].then[0]`
 * so a problem message points at the offending step rather than "somewhere".
 */
function validateStep(step, path, depth, problems) {
  if (!step || typeof step !== 'object' || Array.isArray(step)) {
    problems.push(`${path}: step must be an object`);
    return;
  }
  const t = step.type;
  if (!ALL_STEP_TYPES.includes(t)) {
    problems.push(`${path}: type must be one of ('${ALL_STEP_TYPES.join("', '")}')`);
    return;
  }
  if (step.id != null && !VAR_RE.test(String(step.id))) {
    problems.push(`${path}.id: must be a identifier (letters, digits, _)`);
  }
  // `as` names the context variable this step writes. Steps that produce no
  // value may still declare one; it just lands empty.
  if (step.as != null && !VAR_RE.test(String(step.as))) {
    problems.push(`${path}.as: must be a variable name (letters, digits, _)`);
  }

  switch (t) {
    case 'prompt':
      pushIf(problems, !String(step.prompt ?? '').trim(), `${path}.prompt: required`);
      pushIf(problems, step.model != null && typeof step.model !== 'string',
        `${path}.model: must be null or a model id`);
      break;

    case 'skill':
      pushIf(problems, !String(step.skill ?? '').trim(), `${path}.skill: skill name required`);
      pushIf(problems, !String(step.prompt ?? '').trim(), `${path}.prompt: required`);
      break;

    case 'retrieve':
      pushIf(problems, !String(step.query ?? '').trim(), `${path}.query: required`);
      pushIf(problems, step.top_k != null && (!Number.isInteger(step.top_k) || step.top_k < 1 || step.top_k > 50),
        `${path}.top_k: must be an integer 1..50`);
      break;

    case 'guardrail':
      pushIf(problems, !isStrList(step.guardrails) || !step.guardrails.length,
        `${path}.guardrails: non-empty list of guardrail names required`);
      pushIf(problems, !String(step.value ?? '').trim(), `${path}.value: required`);
      pushIf(problems, step.on_fail != null && !ON_FAIL.includes(step.on_fail),
        `${path}.on_fail: must be one of ('${ON_FAIL.join("', '")}')`);
      break;

    case 'moderate':
      pushIf(problems, !String(step.value ?? '').trim(), `${path}.value: required`);
      pushIf(problems, step.on_fail != null && !ON_FAIL.includes(step.on_fail),
        `${path}.on_fail: must be one of ('${ON_FAIL.join("', '")}')`);
      break;

    case 'transform':
      pushIf(problems, !TRANSFORM_OPS.includes(step.op),
        `${path}.op: must be one of ('${TRANSFORM_OPS.join("', '")}')`);
      // `concat` is the one op that reads a LIST (`values`) rather than a single
      // `value` — requiring both would make every concat step unsaveable.
      pushIf(problems, step.op !== 'concat' && step.value == null, `${path}.value: required`);
      if (step.op === 'slice') {
        pushIf(problems, step.start != null && !Number.isInteger(step.start), `${path}.start: must be an integer`);
        pushIf(problems, step.end != null && !Number.isInteger(step.end), `${path}.end: must be an integer`);
      }
      if (step.op === 'regex_extract' || step.op === 'replace') {
        pushIf(problems, !String(step.pattern ?? '').trim(), `${path}.pattern: required for ${step.op}`);
        if (step.pattern) {
          try {
            // eslint-disable-next-line no-new
            new RegExp(step.pattern);
          } catch (e) {
            problems.push(`${path}.pattern: invalid regex (${e.message})`);
          }
        }
      }
      if (step.op === 'concat') {
        pushIf(problems, !Array.isArray(step.values) || !step.values.length,
          `${path}.values: non-empty list required for concat`);
      }
      break;

    case 'condition': {
      pushIf(problems, !CONDITION_OPS.includes(step.op),
        `${path}.op: must be one of ('${CONDITION_OPS.join("', '")}')`);
      pushIf(problems, step.when == null, `${path}.when: required`);
      const needsValue = !['empty', 'not_empty'].includes(step.op);
      pushIf(problems, needsValue && step.value == null,
        `${path}.value: required for op '${step.op}'`);
      if (step.op === 'matches' && step.value) {
        try {
          // eslint-disable-next-line no-new
          new RegExp(String(step.value));
        } catch (e) {
          problems.push(`${path}.value: invalid regex (${e.message})`);
        }
      }
      pushIf(problems, step.then == null && step.else == null,
        `${path}: needs at least one of 'then' / 'else'`);
      for (const branch of ['then', 'else']) {
        if (step[branch] == null) continue;
        if (!Array.isArray(step[branch])) {
          problems.push(`${path}.${branch}: must be an array of steps`);
          continue;
        }
        validateStepList(step[branch], `${path}.${branch}`, depth + 1, problems);
      }
      break;
    }

    case 'tool_loop':
      pushIf(problems, !String(step.goal ?? '').trim(), `${path}.goal: required`);
      pushIf(problems, step.max_iterations != null
        && (!Number.isInteger(step.max_iterations) || step.max_iterations < 1 || step.max_iterations > 50),
        `${path}.max_iterations: must be an integer 1..50`);
      pushIf(problems, step.tools != null && !isStrList(step.tools),
        `${path}.tools: must be null or a list of tool names`);
      break;

    case 'parallel':
      // Fully validated even though it cannot run yet — see the header note.
      // Getting this wrong (e.g. rejecting at save time) breaks the forward
      // compatibility promise the C/B reduction was granted on.
      if (!Array.isArray(step.steps) || !step.steps.length) {
        problems.push(`${path}.steps: non-empty list of steps required`);
      } else {
        validateStepList(step.steps, `${path}.steps`, depth + 1, problems);
      }
      break;

    default:
      break;
  }
}

function validateStepList(steps, path, depth, problems) {
  if (depth > MAX_DEPTH) {
    problems.push(`${path}: nesting deeper than ${MAX_DEPTH} is not allowed`);
    return;
  }
  if (steps.length > MAX_STEPS) {
    problems.push(`${path}: more than ${MAX_STEPS} steps in one list`);
    return;
  }
  steps.forEach((s, i) => validateStep(s, `${path}[${i}]`, depth, problems));
}

/**
 * Validate `spec.steps`. Returns a list of problems; empty means schema-valid.
 * This is the SAVE gate — `parallel` passes here on purpose.
 */
function validateSteps(steps) {
  const problems = [];
  if (steps == null) return problems;
  if (!Array.isArray(steps)) return ['steps must be an array'];
  validateStepList(steps, 'steps', 0, problems);
  return problems;
}

/** Walk every step in a list, including nested branches. */
function walkSteps(steps, fn, path = 'steps') {
  (steps ?? []).forEach((step, i) => {
    const p = `${path}[${i}]`;
    fn(step, p);
    if (step && Array.isArray(step.then)) walkSteps(step.then, fn, `${p}.then`);
    if (step && Array.isArray(step.else)) walkSteps(step.else, fn, `${p}.else`);
    if (step && Array.isArray(step.steps)) walkSteps(step.steps, fn, `${p}.steps`);
  });
}

/**
 * The ENABLE-gate check for steps: everything that must be true before a
 * multi-step agent may run for real. Deferred types are rejected HERE and only
 * here, so authoring stays open.
 *
 * `refs` mirrors FEAT-080's `gateProblems` shape: Sets of existing
 * `skillNames` / `guardrailNames` / `toolNames`.
 */
function stepGateProblems(steps, refs = {}) {
  const problems = validateSteps(steps);
  if (problems.length) return problems;

  const skillNames = refs.skillNames ?? new Set();
  const guardrailNames = refs.guardrailNames ?? new Set();
  const toolNames = refs.toolNames ?? new Set();

  walkSteps(steps, (step, path) => {
    if (DEFERRED_STEP_TYPES.includes(step.type)) {
      problems.push(
        `${path}: step type '${step.type}' is not yet supported (deferred to FEAT-096); ` +
        'the spec may be saved but cannot be enabled');
      return;
    }
    if (step.type === 'skill' && !skillNames.has(step.skill)) {
      problems.push(`${path}.skill: skill not found: ${step.skill}`);
    }
    if (step.type === 'guardrail') {
      for (const g of step.guardrails ?? []) {
        if (!guardrailNames.has(g)) problems.push(`${path}.guardrails: guardrail not found: ${g}`);
      }
    }
    if (step.type === 'tool_loop') {
      for (const t of step.tools ?? []) {
        if (!toolNames.has(t)) problems.push(`${path}.tools: tool not found: ${t}`);
      }
    }
  });

  return problems;
}

module.exports = {
  STEP_TYPES, DEFERRED_STEP_TYPES, ALL_STEP_TYPES,
  TRANSFORM_OPS, CONDITION_OPS, ON_FAIL,
  MAX_STEPS, MAX_DEPTH,
  interpolate, referencedVars,
  validateSteps, stepGateProblems, walkSteps,
};
