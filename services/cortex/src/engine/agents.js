'use strict';

/**
 * Agent-definition registry (FEAT-080): DB-backed agent specs replacing the 3
 * hard-coded personas in engine/agent.js, with a draft → validated → enabled
 * lifecycle.
 *
 * Spec v1 (stored in cortex.agents.spec, JSONB):
 *
 *     {
 *       "version": 1,
 *       "name": "kebab-slug",             // mirrors the name column
 *       "description": "one sentence",
 *       "system_prompt": "persona text",  // required, non-empty
 *       "channel": "task",                // guardrail channel: task|chat|cs_chat|cs_email
 *       "model": null,                    // null = brain model; else router model id
 *       "tools": null,                    // null = all enabled custom tools; else name subset
 *       "skills": [],                     // skill names injected into the system prompt
 *       "guardrails": null,               // names must exist; the global enabled-
 *                                         // guardrails-per-channel engine always applies.
 *                                         // FEAT-081 `guardrail` steps ADD named checks
 *                                         // on top — they never replace the global screen.
 *       "max_iterations": 12,             // 1..50 tool-loop bound
 *       "steps": []                       // FEAT-081: sequential chain (see engine/steps.js).
 *                                         // Empty = the classic single tool-loop agent.
 *                                         // A `parallel` step validates and saves but is
 *                                         // refused by the enable gate until FEAT-096.
 *     }
 *
 * Lifecycle (per the FEAT-080 C/B condition, pinned as AC): the
 * draft → validated/enabled gate is DETERMINISTIC spec validation ONLY —
 * schema valid (validateSpec), referenced tools/skills/guardrails exist and
 * the model is resolvable (gateProblems, refs injected by the caller). Smoke
 * runs are advisory and never gate anything. No LLM-judged tests in v1.
 *
 * NOTE on channel vocabulary: the values are the GuardrailEngine's runtime
 * channels as used by engine/jobs.js ('chat' is the assistant channel;
 * PromptLog's 'assistant' is telemetry-only) — a guardrail row's `channels`
 * list matches against these exact strings.
 */

const { namedError, TASK_SYSTEM, CHAT_SYSTEM, CS_SYSTEM } = require('./agent');
const { validateSteps, stepGateProblems } = require('./steps');
const { Agent } = require('../models');

const NAME_RE = /^[\w-]{1,64}$/;
const CHANNELS = ['task', 'chat', 'cs_chat', 'cs_email'];
const SPEC_VERSION = 1;
const MAX_ITER_LIMIT = 50;
const DEFAULT_MAX_ITER = 12;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isStrList = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string');

// ---------------------------------------------------------------- validation

// Pure schema validation (the SAVE gate — no reference checks, no I/O).
// Returns a list of problems; empty list means the spec is schema-valid.
// `steps` may be present (even non-empty) on drafts — FEAT-081 authoring space;
// the transition gate below is what rejects non-empty steps.
function validateSpec(spec) {
  const problems = [];
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return ['spec must be a JSON object'];
  }
  if ((spec.version ?? SPEC_VERSION) !== SPEC_VERSION) {
    problems.push(`version must be ${SPEC_VERSION}`);
  }
  if (!NAME_RE.test(String(spec.name ?? ''))) {
    problems.push('name: letters, digits, _ - only (max 64)');
  }
  if (!String(spec.description ?? '').trim()) problems.push('description required');
  if (!String(spec.system_prompt ?? '').trim()) problems.push('system_prompt required');
  const channel = spec.channel ?? 'task';
  if (!CHANNELS.includes(channel)) {
    problems.push(`channel must be one of ('${CHANNELS.join("', '")}')`);
  }
  if (spec.model != null && (typeof spec.model !== 'string' || !spec.model.trim())) {
    problems.push('model must be null or a non-empty model id string');
  }
  if (spec.tools != null && !isStrList(spec.tools)) {
    problems.push('tools must be null (all enabled) or a list of tool names');
  }
  if (spec.skills != null && !isStrList(spec.skills)) {
    problems.push('skills must be a list of skill names');
  }
  if (spec.guardrails != null && !isStrList(spec.guardrails)) {
    problems.push('guardrails must be null or a list of guardrail names');
  }
  const mi = spec.max_iterations ?? DEFAULT_MAX_ITER;
  if (!Number.isInteger(mi) || mi < 1 || mi > MAX_ITER_LIMIT) {
    problems.push(`max_iterations must be an integer 1..${MAX_ITER_LIMIT}`);
  }
  if (spec.steps != null && !Array.isArray(spec.steps)) {
    problems.push('steps must be an array');
  } else if (Array.isArray(spec.steps) && spec.steps.length) {
    // FEAT-081: steps now have a real grammar. This is the SAVE gate, so a
    // `parallel` step VALIDATES here and is rejected only at enable time —
    // that asymmetry is what lets an author write a parallel step today and
    // have it start working when FEAT-096 lands, with no spec rewrite.
    problems.push(...validateSteps(spec.steps));
  }
  return problems;
}

// The draft → validated/enabled transition gate — DETERMINISTIC ONLY.
// Schema validity + reference existence + model resolvability. All reference
// data is injected by the caller so this stays pure and unit-testable:
//   refs = {
//     toolNames:      Set of existing custom-tool names,
//     skillNames:     Set of existing skill names,
//     guardrailNames: Set of existing guardrail names,
//     modelIds:       Set of router model ids, or null when spec.model is null
//                     (the brain model is resolvable by definition),
//   }
function gateProblems(spec, refs) {
  const problems = validateSpec(spec);
  if (problems.length) return problems; // reference checks need a sane shape
  const missing = (names, set, noun) => {
    for (const n of names ?? []) {
      if (!set.has(n)) problems.push(`${noun} not found: ${n}`);
    }
  };
  missing(spec.tools, refs.toolNames, 'tool');
  missing(spec.skills, refs.skillNames, 'skill');
  missing(spec.guardrails, refs.guardrailNames, 'guardrail');
  // FEAT-081: per-step reference checks + rejection of deferred step types
  // (`parallel` → FEAT-096). This is the ONLY place a deferred type is refused.
  if (Array.isArray(spec.steps) && spec.steps.length) {
    problems.push(...stepGateProblems(spec.steps, refs));
  }
  if (spec.model != null) {
    if (!refs.modelIds) {
      problems.push('model list unavailable; cannot verify model is resolvable');
    } else if (!refs.modelIds.has(spec.model)) {
      problems.push(`model not resolvable on the router: ${spec.model}`);
    }
  }
  return problems;
}

// Fill defaults so stored specs are self-describing.
function normalizeSpec(spec) {
  return {
    version: SPEC_VERSION,
    name: spec.name,
    description: spec.description,
    system_prompt: spec.system_prompt,
    channel: spec.channel ?? 'task',
    model: spec.model ?? null,
    tools: spec.tools ?? null,
    skills: spec.skills ?? [],
    guardrails: spec.guardrails ?? null,
    max_iterations: spec.max_iterations ?? DEFAULT_MAX_ITER,
    steps: spec.steps ?? [],
  };
}

// ---------------------------------------------------------------- registry

function rowToBrief(row) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    description: row.description ?? '',
    channel: row.spec?.channel ?? 'task',
    model: row.spec?.model ?? null,
    builtin: row.builtin,
    updated_at: row.updatedAt,
  };
}

class AgentRegistry {
  async loadAll() {
    return Agent.findAll({ order: [['name', 'ASC']] });
  }

  // Resolve by UUID id or by unique name.
  async resolve(idOrName) {
    if (UUID_RE.test(String(idOrName ?? ''))) {
      const byId = await Agent.findByPk(idOrName);
      if (byId) return byId;
    }
    if (!NAME_RE.test(String(idOrName ?? ''))) return null;
    return Agent.findOne({ where: { name: idOrName } });
  }

  // Save (create or update by name). ALWAYS lands as a draft — any edit
  // invalidates prior validation, so validated/enabled must be re-earned
  // through the deterministic gate.
  async save(spec, userId = null) {
    const problems = validateSpec(spec);
    if (problems.length) throw namedError('ValueError', problems.join('; '));
    const normalized = normalizeSpec(spec);
    const values = {
      name: normalized.name,
      description: normalized.description,
      spec: normalized,
      status: 'draft',
      lastValidation: null,
      builtFrom: spec.built_from ?? null,
    };
    const existing = await Agent.findOne({ where: { name: normalized.name } });
    if (existing) {
      await existing.update(values);
      return existing;
    }
    return Agent.create({ ...values, createdBy: userId });
  }
}

// ---------------------------------------------------------------- personas

// The 3 legacy hard-coded personas (engine/agent.js) as seedable agent specs.
// Prompts are the SAME constants the flow layer falls back to, so persona
// parity is structural: seeded row text === legacy constant by construction.
const PERSONAS = [
  {
    name: 'task',
    description: 'Autonomous task runner (legacy TASK_SYSTEM persona)',
    system_prompt: TASK_SYSTEM,
    channel: 'task',
  },
  {
    name: 'assistant',
    description: 'Owner-facing assistant chat (legacy CHAT_SYSTEM persona)',
    system_prompt: CHAT_SYSTEM,
    channel: 'chat',
  },
  {
    name: 'cs',
    description: 'Guarded customer-service persona (legacy CS_SYSTEM; the KB block is appended at runtime)',
    system_prompt: CS_SYSTEM,
    channel: 'cs_chat',
  },
].map((p) => normalizeSpec(p));

// Seed the legacy personas as enabled agent rows (idempotent; never overwrites
// an existing row, so admin edits to a persona survive restarts). The seeds go
// through the SAME deterministic gate as any other agent — no special casing;
// they pass offline because model=null and they reference no tools/skills.
async function seedLegacyAgents(logger = null) {
  const EMPTY_REFS = {
    toolNames: new Set(), skillNames: new Set(), guardrailNames: new Set(), modelIds: null,
  };
  for (const spec of PERSONAS) {
    const existing = await Agent.findOne({ where: { name: spec.name } });
    if (existing) continue;
    const problems = gateProblems(spec, EMPTY_REFS);
    if (problems.length) {
      // Should be impossible (persona-parity test pins it) — fail loudly.
      throw namedError('ValueError', `persona seed '${spec.name}' failed the gate: ${problems.join('; ')}`);
    }
    await Agent.create({
      name: spec.name,
      description: spec.description,
      spec,
      status: 'enabled',
      builtin: true,
      lastValidation: { ok: true, problems: [], at: new Date().toISOString(), seeded: true },
    });
    if (logger) logger.info('Seeded legacy persona agent', { name: spec.name });
  }
}

// System prompt for a persona: the ENABLED agent row's spec wins, the legacy
// constant is the fallback (so flows keep working even if a persona row is
// disabled or deleted). Best-effort: a DB hiccup falls back rather than
// failing an interactive turn.
async function personaPrompt(name, fallback) {
  try {
    const row = await Agent.findOne({ where: { name, status: 'enabled' } });
    const prompt = row?.spec?.system_prompt;
    return (typeof prompt === 'string' && prompt.trim()) ? prompt : fallback;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------- builder

const BUILDER_SYSTEM = 'You design agents for a local AI agent system. An agent ' +
'is a persona with a system prompt that runs a tool-calling loop. Given a ' +
'description, produce ONE JSON object (no markdown fences, no commentary) ' +
'with exactly these fields:\n' +
'\n' +
'name: short-kebab-case-slug\n' +
'description: one sentence, shown in the agent picker\n' +
'system_prompt: the persona/system prompt the agent runs with — concrete and ' +
'imperative: who the agent is, how it should work step by step, its quality ' +
'bar, and how to finish (e.g. end with a clear summary). 100-300 words.\n' +
"channel: one of \"task\", \"chat\", \"cs_chat\", \"cs_email\" — \"task\" for " +
'autonomous background work, "chat" for interactive assistant work, the cs_* ' +
'channels for customer-facing personas\n' +
'model: null (use the default local model)\n' +
'tools: null (all enabled tools) or an array of specific tool names the ' +
'description explicitly calls for\n' +
'skills: [] (or skill names the description explicitly calls for)\n' +
'max_iterations: integer 1-50 (default 12; raise only for long multi-step work)\n' +
'\n' +
'Return only the JSON object.';

// Draft an agent spec from a natural-language description (registryFactory
// /build pattern). Returns { spec, problems }; the caller always saves the
// draft DISABLED (status stays 'draft' — the deterministic gate is the only
// path to enabled).
async function buildSpec(description, chatFn, { name = null } = {}) {
  let user = `Agent: ${description}`;
  if (name) user += `\nUse name: "${name}"`;
  const raw = await chatFn(BUILDER_SYSTEM, user);
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  if (!m) return { spec: null, problems: ['model returned no JSON object'] };
  let spec;
  try {
    spec = JSON.parse(m[0]);
  } catch (e) {
    return { spec: null, problems: [`model returned invalid JSON: ${e.message}`] };
  }
  if (name) spec.name = name;
  if (typeof spec.max_iterations === 'string' && /^\d+$/.test(spec.max_iterations)) {
    spec.max_iterations = parseInt(spec.max_iterations, 10);
  }
  spec.version = SPEC_VERSION;
  spec.steps = [];
  spec.built_from = description;
  return { spec, problems: validateSpec(spec) };
}

module.exports = {
  CHANNELS, SPEC_VERSION, PERSONAS,
  validateSpec, gateProblems, normalizeSpec, rowToBrief,
  AgentRegistry,
  seedLegacyAgents, personaPrompt,
  buildSpec,
};
