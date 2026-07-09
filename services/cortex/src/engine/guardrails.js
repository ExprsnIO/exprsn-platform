'use strict';

/**
 * Guardrail engine + builder (port of the MacOS LLM service's
 * agents/guardrails.js), storage moved from disk JSON to the cortex.guardrails
 * table.
 *
 * A guardrail spec:
 *
 *     {
 *       "name": "no-promises",
 *       "description": "Never promise refunds or guarantees",
 *       "enabled": true,
 *       "scope": ["output"],                  // input | output | tool_call
 *       "channels": ["cs_chat", "cs_email"],  // omit = all channels
 *       "action": "escalate",                 // warn | escalate | block
 *       "rules": [
 *         {"type": "regex", "pattern": "(?i)full refund", "description": "..."},
 *         {"type": "contains", "values": ["guaranteed"], "case_sensitive": false},
 *         {"type": "max_length", "limit": 4000},
 *         {"type": "llm_judge", "prompt": "...", "fail_marker": "FAIL"}
 *       ],
 *       "tests": [
 *         {"text": "You get a full refund, guaranteed!", "expect": "trigger"},
 *         {"text": "Let me look into your order.", "expect": "pass"}
 *       ]
 *     }
 *
 * Deterministic rules run first (free); llm_judge rules only run if no
 * deterministic rule already fired, using the configured judge model. The
 * *builder* turns a natural-language policy description into a draft spec
 * (with tests); drafts are saved disabled and must have a passing test suite
 * before being enabled.
 *
 * Enabled specs are cached in memory for a few seconds so a 12-iteration
 * agent run doesn't issue a SELECT per tool call; the cache is invalidated on
 * every save/delete in this process.
 */

const { createLogger } = require('@exprsn/shared');
const { Guardrail } = require('../models');
const { namedError } = require('./agent');

const logger = createLogger('exprsn-cortex');

const ACTIONS = ['warn', 'escalate', 'block']; // weakest -> strongest
const SCOPES = ['input', 'output', 'tool_call'];
const RULE_TYPES = ['regex', 'contains', 'max_length', 'llm_judge'];

const pyTuple = (arr) => '(' + arr.map((v) => `'${v}'`).join(', ') + ')';
const NAME_RE = /^[\w-]{1,64}$/;
const ENABLED_CACHE_TTL_MS = 3000;

// Compile a Python-re-style pattern: leading inline flag groups like (?i)
// (which JS RegExp rejects) are lifted into RegExp flags.
const regexCache = new Map();
function compilePyRegex(pattern) {
  const key = String(pattern ?? '');
  if (regexCache.has(key)) return regexCache.get(key);
  let src = key;
  let flags = '';
  let m;
  while ((m = src.match(/^\(\?([aiLmsux]+)\)/))) {
    for (const f of m[1]) {
      if ('ims'.includes(f) && !flags.includes(f)) flags += f;
    }
    src = src.slice(m[0].length);
  }
  const re = new RegExp(src, flags);
  if (regexCache.size < 512) regexCache.set(key, re);
  return re;
}

// ---------------------------------------------------------------- validation

// Return a list of problems; empty list means the spec is valid.
function validateSpec(spec) {
  const problems = [];
  if (!NAME_RE.test(String(spec.name ?? ''))) {
    problems.push('name: letters, digits, _ - only (max 64)');
  }
  if (!ACTIONS.includes(spec.action)) {
    problems.push(`action must be one of ${pyTuple(ACTIONS)}`);
  }
  const scope = spec.scope ?? [];
  if (!Array.isArray(scope) || !scope.length || !scope.every((s) => SCOPES.includes(s))) {
    problems.push(`scope must be a non-empty subset of ${pyTuple(SCOPES)}`);
  }
  const rules = spec.rules ?? [];
  if (!rules.length) problems.push('at least one rule required');
  rules.forEach((r, i) => {
    const t = r.type;
    if (!RULE_TYPES.includes(t)) {
      problems.push(`rule ${i}: type must be one of ${pyTuple(RULE_TYPES)}`);
    } else if (t === 'regex') {
      try {
        compilePyRegex(r.pattern ?? '');
      } catch (e) {
        problems.push(`rule ${i}: bad regex: ${e.message}`);
      }
    } else if (t === 'contains' && !(Array.isArray(r.values) && r.values.length)) {
      problems.push(`rule ${i}: contains needs non-empty 'values'`);
    } else if (t === 'max_length' && !Number.isInteger(r.limit)) {
      problems.push(`rule ${i}: max_length needs integer 'limit'`);
    } else if (t === 'llm_judge' && !r.prompt) {
      problems.push(`rule ${i}: llm_judge needs 'prompt'`);
    }
  });
  (spec.tests ?? []).forEach((t, i) => {
    if (!['trigger', 'pass'].includes(t.expect) || !t.text) {
      problems.push(`test ${i}: needs 'text' and expect: trigger|pass`);
    }
  });
  return problems;
}

// ---------------------------------------------------------------- engine

// DB row -> the plain spec object the API and evaluator work with (same shape
// as the source JSON files, snake_case built_from included).
function rowToSpec(row) {
  return {
    name: row.name,
    description: row.description ?? '',
    enabled: row.enabled,
    scope: row.scope,
    ...(row.channels != null && { channels: row.channels }),
    action: row.action,
    rules: row.rules,
    tests: row.tests ?? [],
    ...(row.builtFrom != null && { built_from: row.builtFrom }),
  };
}

class GuardrailEngine {
  // judgeFn(prompt, text) -> Promise<string>: asks the judge model, returns
  // its (short) verdict text. Injected so this module stays HTTP-free.
  constructor(judgeFn = null) {
    this.judgeFn = judgeFn;
    this._enabledCache = { at: 0, specs: null };
  }

  // -- storage --------------------------------------------------------------

  invalidate() {
    this._enabledCache = { at: 0, specs: null };
  }

  async loadAll() {
    const rows = await Guardrail.findAll({ order: [['name', 'ASC']] });
    return rows.map(rowToSpec);
  }

  // Enabled specs only, cached briefly (agent runs evaluate per tool call).
  async enabledSpecs() {
    const now = Date.now();
    if (this._enabledCache.specs && now - this._enabledCache.at < ENABLED_CACHE_TTL_MS) {
      return this._enabledCache.specs;
    }
    const rows = await Guardrail.findAll({ where: { enabled: true }, order: [['name', 'ASC']] });
    const specs = rows.map(rowToSpec);
    this._enabledCache = { at: now, specs };
    return specs;
  }

  async get(name) {
    if (!NAME_RE.test(String(name ?? ''))) return null;
    const row = await Guardrail.findOne({ where: { name } });
    return row ? rowToSpec(row) : null;
  }

  async save(spec, userId = null) {
    const problems = validateSpec(spec);
    if (problems.length) throw namedError('ValueError', problems.join('; '));
    const values = {
      name: spec.name,
      description: spec.description ?? '',
      enabled: Boolean(spec.enabled),
      scope: spec.scope,
      channels: spec.channels ?? null,
      action: spec.action,
      rules: spec.rules,
      tests: spec.tests ?? [],
      builtFrom: spec.built_from ?? null,
    };
    const existing = await Guardrail.findOne({ where: { name: spec.name } });
    if (existing) await existing.update(values);
    else await Guardrail.create({ ...values, createdBy: userId });
    this.invalidate();
    return spec;
  }

  async delete(name) {
    await Guardrail.destroy({ where: { name } });
    this.invalidate();
  }

  // -- evaluation -----------------------------------------------------------

  async ruleFires(rule, text) {
    const t = rule.type;
    if (t === 'regex') return compilePyRegex(rule.pattern).test(text);
    if (t === 'contains') {
      const cs = rule.case_sensitive;
      const hay = cs ? text : text.toLowerCase();
      return rule.values.some((v) => hay.includes(cs ? String(v) : String(v).toLowerCase()));
    }
    if (t === 'max_length') return text.length > rule.limit;
    if (t === 'llm_judge') {
      if (!this.judgeFn) return false;
      let verdict;
      try {
        verdict = await this.judgeFn(rule.prompt, text);
      } catch (e) {
        // Judge transport failure: deliberate fail-open for the LLM layer —
        // deterministic rules still apply. Logged so it never fails silently.
        logger.warn('llm_judge unavailable; treating rule as not fired', { error: e.message });
        return false;
      }
      return verdict.toLowerCase().includes(String(rule.fail_marker ?? 'FAIL').toLowerCase());
    }
    return false;
  }

  // Run all enabled guardrails for this scope/channel over text.
  // Returns {"action": null|"warn"|"escalate"|"block", "hits": [...]}
  // where action is the strongest among the hits.
  async evaluate(text, scope, channel, specs = null) {
    const hits = [];
    for (const spec of specs !== null ? specs : await this.enabledSpecs()) {
      if (specs === null && !spec.enabled) continue;
      if (!spec.scope.includes(scope)) continue;
      if (channel != null && spec.channels && spec.channels.length &&
          !spec.channels.includes(channel)) continue;
      const det = spec.rules.filter((r) => r.type !== 'llm_judge');
      const llm = spec.rules.filter((r) => r.type === 'llm_judge');
      let fired = null;
      for (const rule of det) {
        if (await this.ruleFires(rule, text)) {
          fired = rule;
          break;
        }
      }
      if (fired === null) {
        for (const rule of llm) {
          if (await this.ruleFires(rule, text)) {
            fired = rule;
            break;
          }
        }
      }
      if (fired !== null) {
        hits.push({
          guardrail: spec.name,
          action: spec.action,
          rule_type: fired.type,
          rule: fired.description || fired.pattern || String(fired.prompt ?? '').slice(0, 80),
        });
      }
    }
    let action = null;
    for (const h of hits) {
      if (action === null || ACTIONS.indexOf(h.action) > ACTIONS.indexOf(action)) {
        action = h.action;
      }
    }
    return { action, hits };
  }

  // -- testing ---------------------------------------------------------------

  // Run the spec's test cases against itself (regardless of enabled).
  async runTests(spec) {
    const results = [];
    for (const testCase of spec.tests ?? []) {
      const verdict = await this.evaluate(testCase.text, spec.scope[0], null, [spec]);
      const triggered = verdict.hits.length > 0;
      const ok = triggered === (testCase.expect === 'trigger');
      results.push({ text: testCase.text, expect: testCase.expect, triggered, ok });
    }
    return {
      passed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }
}

// ---------------------------------------------------------------- builder

const BUILDER_SYSTEM = 'You write guardrail specifications for a customer-facing ' +
'AI system. Given a policy description, produce ONE JSON object (no markdown, ' +
'no commentary) with exactly these fields:\n' +
'\n' +
'name: short-kebab-case-slug\n' +
'description: one sentence\n' +
'scope: array from ["input","output","tool_call"] (input = text customers send, ' +
'output = text the AI sends, tool_call = JSON of a tool invocation)\n' +
'action: "warn" | "escalate" | "block"  (escalate = hold for human review)\n' +
'rules: array. Prefer 2-4 cheap deterministic rules plus at most one llm_judge:\n' +
'  {"type":"regex","pattern":"...","description":"..."}   (Python re syntax, use (?i) for case-insensitive)\n' +
'  {"type":"contains","values":["..."],"case_sensitive":false}\n' +
'  {"type":"max_length","limit":N}\n' +
'  {"type":"llm_judge","prompt":"<instructions for a judge model; it must answer PASS or FAIL>","fail_marker":"FAIL"}\n' +
'tests: 4-8 cases {"text":"...","expect":"trigger"|"pass"} covering clear ' +
'violations, clear non-violations, and near-misses. Tests must be consistent ' +
'with the rules you wrote: every "trigger" case must actually match a rule.\n' +
'\n' +
'Return only the JSON object.';

// Draft a guardrail spec from a natural-language policy.
// chatFn(system, user) -> Promise<assistant text> (the brain model).
// Returns { spec, problems }. The spec is always saved DISABLED by caller.
async function buildSpec(policyDescription, chatFn, { name = null, action = null } = {}) {
  let user = `Policy: ${policyDescription}`;
  if (name) user += `\nUse name: "${name}"`;
  if (action) user += `\nUse action: "${action}"`;
  const raw = await chatFn(BUILDER_SYSTEM, user);
  const m = (raw || '').match(/\{[\s\S]*\}/);
  if (!m) return { spec: null, problems: ['model returned no JSON object'] };
  let spec;
  try {
    spec = JSON.parse(m[0]);
  } catch (e) {
    return { spec: null, problems: [`model returned invalid JSON: ${e.message}`] };
  }
  if (name) spec.name = name;
  if (action) spec.action = action;
  spec.enabled = false;
  spec.built_from = policyDescription;
  return { spec, problems: validateSpec(spec) };
}

module.exports = {
  ACTIONS, SCOPES, RULE_TYPES,
  compilePyRegex, validateSpec,
  GuardrailEngine, buildSpec,
};
