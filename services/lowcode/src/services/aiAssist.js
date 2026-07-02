'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * AI-assisted authoring — natural language → entity/flow drafts.
 *
 * Uses the platform's existing Anthropic configuration (CLAUDE_API_KEY, same
 * env convention as services/moderator). Nothing here executes AI output:
 * generation returns a DRAFT that is validated with the same design-time
 * validators as hand-authored definitions (typeSystem / flowActions), and the
 * studio user reviews + saves it through the normal design API. Fails soft —
 * with no key configured the endpoint 503s and the studio hides the button.
 * ═══════════════════════════════════════════════════════════
 */

const { createLogger } = require('@exprsn/shared');
const typeSystem = require('./typeSystem');
const flowActions = require('./flowActions');
const events = require('../../../plugins/src/events');

const logger = createLogger('exprsn-lowcode-ai');

function isConfigured() {
  return process.env.LOWCODE_AI_ENABLED !== 'false' && !!process.env.CLAUDE_API_KEY;
}

function model() {
  return process.env.LOWCODE_AI_MODEL || process.env.CLAUDE_MODEL || 'claude-sonnet-5';
}

/** One Claude call → parsed JSON (fences stripped). Throws on transport/parse. */
async function complete(prompt) {
  // Lazy require so the module loads fine without the SDK/key in tests.
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
  const message = await client.messages.create({
    model: model(),
    max_tokens: 2048,
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = (message.content && message.content[0] && message.content[0].text) || '';
  const stripped = text.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();
  return JSON.parse(stripped);
}

const ENTITY_PROMPT = (description) => `You design data models for a low-code platform. Produce ONLY a JSON object (no prose, no markdown fences) describing an entity for this request:

"${description}"

Shape:
{
  "key": "<snake_case identifier>",
  "name": "<Display Name>",
  "description": "<one line>",
  "fields": [{ "key": "<snake_case>", "label": "<Label>", "type": "<type>", "required": <bool>, "role": "<role>", ... }],
  "stateMachine": null | { "initial": "<state>", "states": ["..."], "transitions": [{ "from": "<state>", "to": "<state>", "event": "<verb>" }] }
}

Field rules:
- type ∈ string|text|number|integer|boolean|date|datetime|enum|json|file (avoid reference unless the request names another entity)
- role ∈ dimension|measure|attribute; numeric measures may add "aggregation": sum|avg|count|min|max
- enum fields need "enumValues": ["..."]
- computed fields may add "formula" using this language: field refs, + - * / %, & (concat), comparisons, and/or/not, if(c,a,b), concat, upper, lower, trim, length, round, floor, ceil, abs, min, max, coalesce, contains, now(), today(), year/month/day(date), days_between(a,b)
- 5-12 well-chosen fields; add a stateMachine only when the request implies a lifecycle.`;

const FLOW_PROMPT = (description, eventKeys, actionTypes) => `You design automations for a low-code platform. Produce ONLY a JSON object (no prose, no markdown fences) describing a flow for this request:

"${description}"

Shape:
{
  "key": "<snake_case>",
  "name": "<Display Name>",
  "trigger": { "type": "event" } | { "type": "schedule", "cron": "<5-field cron>" } | { "type": "webhook" } | { "type": "manual" },
  "event": "<required when trigger.type is event; one of: ${eventKeys.join(', ')}>",
  "match": null | <condition tree: { "all"|"any"|"none": [ { "field": "<dot.path>", "op": "equals|not_equals|contains|in|gt|gte|lt|lte|exists|matches", "value": ... } ] }>,
  "actions": [{ "type": "<one of: ${actionTypes.join(', ')}>", ...params, "when"?: <condition tree>, "onError"?: "continue"|"stop", "retries"?: 0-3 }]
}

Action params: create_record/update_record take { "entityKey", "data" }; transition_record takes { "entityKey", "event" }; http_request takes { "url", "method", "headers"?, "body"? }; notify takes { "userId", "title", "body" }; log takes { "message" }.
Prefer 1-4 actions. Use match/when conditions over imaginary events.`;

/**
 * Generate an entity draft. Returns { draft, warnings } — warnings are the
 * validator findings a builder must fix before saving (bad fields dropped).
 */
async function generateEntity(description) {
  const raw = await complete(ENTITY_PROMPT(description));
  const warnings = [];
  const fields = Array.isArray(raw.fields) ? raw.fields : [];
  const good = [];
  for (const f of fields) {
    const errs = typeSystem.validateFieldDef(f);
    if (errs.length) warnings.push(...errs.map((e) => `dropped field: ${e}`));
    else good.push(f);
  }
  const draft = {
    key: String(raw.key || 'entity').toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/^[^a-z]+/, 'e'),
    name: raw.name || 'Generated entity',
    description: raw.description || description,
    fields: good,
    stateMachine: raw.stateMachine || null,
  };
  return { draft, warnings };
}

/** Generate a flow draft; same contract as generateEntity. */
async function generateFlow(description) {
  const raw = await complete(FLOW_PROMPT(description, events.eventKeys(), flowActions.knownActionTypes()));
  const warnings = [];
  const actions = Array.isArray(raw.actions) ? raw.actions : [];
  const actionErrors = flowActions.validateActions(actions);
  const badIdx = new Set();
  for (const err of actionErrors) {
    warnings.push(`dropped action: ${err}`);
    const m = err.match(/^action\[(\d+)\]/);
    if (m) badIdx.add(Number(m[1]));
  }
  const trigger = raw.trigger && typeof raw.trigger === 'object' ? raw.trigger : { type: 'event' };
  if ((trigger.type === 'event' || !trigger.type) && !events.isKnownEvent(raw.event)) {
    warnings.push(`event "${raw.event}" is not a known hook-bus event — pick one in the editor`);
  }
  const draft = {
    key: String(raw.key || 'flow').toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/^[^a-z]+/, 'f'),
    name: raw.name || 'Generated flow',
    trigger,
    event: raw.event,
    match: raw.match || null,
    actions: actions.filter((_, i) => !badIdx.has(i)),
    enabled: false, // drafts never land armed
  };
  return { draft, warnings };
}

async function generate(kind, description) {
  if (!isConfigured()) { const e = new Error('AI assist is not configured (set CLAUDE_API_KEY)'); e.status = 503; throw e; }
  if (!description || typeof description !== 'string' || description.length > 2000) {
    const e = new Error('prompt must be a string ≤ 2000 chars'); e.status = 400; throw e;
  }
  try {
    if (kind === 'entity') return await generateEntity(description);
    if (kind === 'flow') return await generateFlow(description);
    const e = new Error("kind must be 'entity' or 'flow'"); e.status = 400; throw e;
  } catch (err) {
    if (err.status) throw err;
    logger.warn('AI generation failed', { kind, error: err.message });
    const e = new Error(`generation failed: ${err.message}`); e.status = 502; throw e;
  }
}

module.exports = { isConfigured, generate, generateEntity, generateFlow };
