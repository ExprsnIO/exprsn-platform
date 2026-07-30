'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Sequential multi-step agent chaining engine (FEAT-081).
 *
 * Executes a validated `spec.steps` list one step at a time, threading a flat
 * `{{var}}` context between them, and recording every step's input and output
 * into the FEAT-080 run transcript.
 *
 * ── Guardrails are added per-step, never bypassed ──────────────────────────
 * This is the invariant the whole cortex track is built on, and chaining is
 * where it is easiest to lose: a chain has many model outputs, not one.
 *
 *   - EVERY model-producing step (`prompt`, `skill`, `tool_loop`) has its output
 *     screened by the global channel guardrails before that output is written
 *     into the context — so a later step can never consume text that the engine
 *     would have refused to emit. A `block` verdict halts the chain.
 *   - An explicit `guardrail` step ADDS named checks on top; it never replaces
 *     the global screen.
 *   - `tool_loop` steps additionally keep engine/agent.js's own per-tool-call
 *     screening, unchanged.
 *
 * ── Failure posture ────────────────────────────────────────────────────────
 * `halt` ends the chain and marks the run failed-with-reason; `escalate` files
 * a Review row (the same human-review queue the flow layer uses) and ends the
 * chain; `continue` records the hit in the transcript and carries on. A step
 * that throws is a step failure, not a silent skip.
 *
 * ── Deliberate non-goals in v1 ─────────────────────────────────────────────
 * No `parallel` (deferred to FEAT-096 per the C/B; the spec still accepts it —
 * see engine/steps.js). No real `retrieve` — it degrades to an empty result
 * until FEAT-095 lands the KB, which is an AC, not an oversight: a chain
 * containing a retrieve step must run today and simply get nothing back.
 * ═══════════════════════════════════════════════════════════
 */

const { interpolate } = require('./steps');

const MAX_TRANSCRIPT_TEXT = 4000; // per transcript entry, chars

/** Outcome of a halted/escalated chain, distinguished from a thrown error. */
class ChainHalt extends Error {
  constructor(reason, { action = 'halt', step = null, verdict = null } = {}) {
    super(reason);
    this.name = 'ChainHalt';
    this.action = action;
    this.step = step;
    this.verdict = verdict;
  }
}

const clip = (s) => {
  const str = typeof s === 'string' ? s : JSON.stringify(s ?? '');
  return str.length > MAX_TRANSCRIPT_TEXT ? `${str.slice(0, MAX_TRANSCRIPT_TEXT)}…` : str;
};

// ---------------------------------------------------------------- transforms

function applyTransform(step, ctx) {
  const raw = typeof step.value === 'string' ? interpolate(step.value, ctx) : step.value;
  switch (step.op) {
    case 'trim': return String(raw).trim();
    case 'lower': return String(raw).toLowerCase();
    case 'upper': return String(raw).toUpperCase();
    case 'slice': return String(raw).slice(step.start ?? 0, step.end ?? undefined);
    case 'json_parse':
      try {
        return JSON.parse(String(raw));
      } catch (e) {
        // A parse failure is data-shaped, not exceptional: models return
        // near-JSON constantly. Surface it as a value the chain can branch on
        // with a `condition` step rather than killing the run.
        return { error: `invalid JSON: ${e.message}` };
      }
    case 'json_stringify': return JSON.stringify(raw ?? null);
    case 'regex_extract': {
      const m = new RegExp(step.pattern, step.flags || '').exec(String(raw));
      if (!m) return '';
      return m[1] !== undefined ? m[1] : m[0];
    }
    case 'replace':
      return String(raw).replace(
        new RegExp(step.pattern, step.flags || 'g'),
        typeof step.replacement === 'string' ? interpolate(step.replacement, ctx) : '');
    case 'concat':
      return step.values.map((v) => (typeof v === 'string' ? interpolate(v, ctx) : String(v ?? ''))).join(step.separator ?? '');
    default:
      return '';
  }
}

// ---------------------------------------------------------------- conditions

function evalCondition(step, ctx) {
  const left = typeof step.when === 'string' ? interpolate(step.when, ctx) : step.when;
  const right = typeof step.value === 'string' ? interpolate(step.value, ctx) : step.value;
  const ls = typeof left === 'string' ? left : JSON.stringify(left ?? '');
  switch (step.op) {
    case 'contains': return ls.includes(String(right));
    case 'not_contains': return !ls.includes(String(right));
    case 'equals': return ls === String(right);
    case 'not_equals': return ls !== String(right);
    case 'matches': return new RegExp(String(right), step.flags || '').test(ls);
    case 'empty': return ls.trim() === '';
    case 'not_empty': return ls.trim() !== '';
    case 'gt': return Number(ls) > Number(right);
    case 'lt': return Number(ls) < Number(right);
    default: return false;
  }
}

// ---------------------------------------------------------------- engine

/**
 * Run a step list.
 *
 * `deps` is every side-effecting capability the engine needs, injected so the
 * whole executor is unit-testable without a DB, a router, or a queue:
 *   runPrompt(prompt, {model})            -> string
 *   runToolLoop(goal, {model, maxIterations, tools}) -> {text, transcript}
 *   screenOutput(text)                    -> {action, hits}   (global channel screen)
 *   evaluateGuardrails(text, names)       -> {action, hits}   (named subset)
 *   moderate(text)                        -> verdict|null     (moderator hook)
 *   skillBlock(name)                      -> string
 *   retrieve(query, {topK})               -> string           ('' until FEAT-095)
 *   onEscalate(reason, {step, verdict, draft}) -> void         (files a Review)
 *
 * Returns { output, context, transcript, halted, haltReason }.
 */
async function runChain(steps, input, deps, { maxSteps = 200 } = {}) {
  const ctx = { input };
  const transcript = [];
  let last = input;
  let executed = 0;
  let halted = false;
  let haltReason = null;

  const record = (entry) => transcript.push(entry);

  /** Screen a model-produced value before it can enter the context. */
  async function screenAndBind(step, path, text) {
    const verdict = await deps.screenOutput(text);
    if (verdict && verdict.hits && verdict.hits.length) {
      record({ role: 'guardrail', step: path, type: step.type, scope: 'output', ...verdict });
    }
    if (verdict && verdict.action === 'block') {
      throw new ChainHalt(
        `step ${path} (${step.type}) output blocked by guardrail(s): ` +
        `${(verdict.hits || []).map((h) => h.guardrail).join(', ')}`,
        { action: 'halt', step: path, verdict });
    }
    if (verdict && verdict.action === 'escalate') {
      await deps.onEscalate(`step ${path} (${step.type}) output escalated`, { step: path, verdict, draft: text });
      throw new ChainHalt(`step ${path} (${step.type}) output escalated for human review`,
        { action: 'escalate', step: path, verdict });
    }
    return text;
  }

  /** Apply an on_fail policy to a verdict from a guardrail/moderate step. */
  async function applyPolicy(step, path, verdict, value) {
    const action = verdict?.action ?? verdict?.effective ?? null;
    if (!action || action === 'pass' || action === 'warn') return false;
    const policy = step.on_fail ?? (action === 'escalate' ? 'escalate' : 'halt');
    if (policy === 'continue') {
      record({ role: 'guardrail', step: path, type: step.type, action, note: 'on_fail=continue', ...verdict });
      return false;
    }
    if (policy === 'escalate') {
      await deps.onEscalate(`step ${path} (${step.type}) ${action}`, { step: path, verdict, draft: value });
      throw new ChainHalt(`step ${path} (${step.type}) escalated for human review`,
        { action: 'escalate', step: path, verdict });
    }
    throw new ChainHalt(`step ${path} (${step.type}) halted: ${action}`,
      { action: 'halt', step: path, verdict });
  }

  async function runOne(step, path) {
    executed += 1;
    if (executed > maxSteps) {
      throw new ChainHalt(`chain exceeded ${maxSteps} executed steps (loop?)`, { step: path });
    }
    const t = step.type;
    let out = '';

    if (t === 'prompt' || t === 'skill') {
      let prompt = interpolate(step.prompt, ctx);
      if (t === 'skill') {
        const block = await deps.skillBlock(step.skill);
        if (block) prompt = `${block}\n\n${prompt}`;
      }
      record({ role: 'step', step: path, type: t, input: clip(prompt) });
      const text = await deps.runPrompt(prompt, { model: step.model ?? null });
      out = await screenAndBind(step, path, text);
      record({ role: 'step', step: path, type: t, output: clip(out) });
    } else if (t === 'tool_loop') {
      const goal = interpolate(step.goal, ctx);
      record({ role: 'step', step: path, type: t, input: clip(goal) });
      const res = await deps.runToolLoop(goal, {
        model: step.model ?? null,
        maxIterations: step.max_iterations ?? undefined,
        tools: step.tools ?? null,
      });
      // The inner loop's own transcript (tool calls + per-call guardrail hits)
      // is folded in so the run ledger shows the full picture, not a summary.
      for (const e of res.transcript ?? []) record({ ...e, step: path });
      out = await screenAndBind(step, path, res.text ?? '');
      record({ role: 'step', step: path, type: t, output: clip(out) });
    } else if (t === 'retrieve') {
      const query = interpolate(step.query, ctx);
      // FEAT-095 will make this real. Until then it MUST return an empty result
      // rather than throwing — a chain with a retrieve step has to run today.
      out = await deps.retrieve(query, { topK: step.top_k ?? 5 });
      record({ role: 'step', step: path, type: t, input: clip(query), output: clip(out), note: out ? undefined : 'no KB bound (FEAT-095)' });
    } else if (t === 'guardrail') {
      const value = interpolate(step.value, ctx);
      const verdict = await deps.evaluateGuardrails(value, step.guardrails);
      record({ role: 'guardrail', step: path, type: t, guardrails: step.guardrails, ...verdict });
      await applyPolicy(step, path, verdict, value);
      out = value;
    } else if (t === 'moderate') {
      const value = interpolate(step.value, ctx);
      const verdict = await deps.moderate(value);
      record({ role: 'guardrail', step: path, type: t, scope: 'moderator', verdict: verdict ?? null });
      if (verdict) await applyPolicy(step, path, verdict, value);
      out = value;
    } else if (t === 'transform') {
      out = applyTransform(step, ctx);
      record({ role: 'step', step: path, type: t, op: step.op, output: clip(out) });
    } else if (t === 'condition') {
      const taken = evalCondition(step, ctx);
      record({ role: 'step', step: path, type: t, op: step.op, branch: taken ? 'then' : 'else' });
      const branch = taken ? step.then : step.else;
      if (Array.isArray(branch) && branch.length) {
        await runList(branch, `${path}.${taken ? 'then' : 'else'}`);
      }
      return; // a condition writes no value of its own; `last` stays as-is
    } else {
      // Unreachable for a spec that passed the enable gate (which rejects
      // `parallel` and unknown types). Loud rather than silent if it happens.
      throw new ChainHalt(`step ${path}: type '${t}' is not executable`, { step: path });
    }

    last = out;
    if (step.as) ctx[step.as] = out;
    if (step.id) ctx[step.id] = out;
  }

  async function runList(list, path) {
    for (let i = 0; i < list.length; i++) {
      // Steps are sequential by contract — awaiting in order IS the semantics.
      // eslint-disable-next-line no-await-in-loop
      await runOne(list[i], `${path}[${i}]`);
    }
  }

  try {
    await runList(steps, 'steps');
  } catch (e) {
    if (!(e instanceof ChainHalt)) throw e;
    halted = true;
    haltReason = { message: e.message, action: e.action, step: e.step, verdict: e.verdict ?? null };
    record({ role: 'system', step: e.step, note: e.message, action: e.action });
  }

  return { output: last, context: ctx, transcript, halted, haltReason };
}

module.exports = { runChain, ChainHalt, applyTransform, evalCondition, MAX_TRANSCRIPT_TEXT };
