'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Cortex module — Sequelize models
 *
 * Storage for the local-LLM agents engine (FEAT-021). Registry entities
 * (guardrails / tools / skills) are keyed by unique `name` in the API and get
 * platform-standard UUID PKs. Run artifacts (tasks / sessions / outbox /
 * reviews) keep the engine's human-readable string ids (`task-<epoch>-<hex>`)
 * as their PKs because the API surface exposes and cross-references them.
 *
 * All tables live in the `cortex` schema via the platform's shared
 * getSequelize() factory.
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');
const { getSequelize } = require('../../../../src/db/sequelize');

const sequelize = getSequelize('cortex');

const NAME_VALIDATE = { is: /^[\w-]{1,64}$/ };

// ── Guardrails: declarative content policies with a test-gated lifecycle ────
const Guardrail = sequelize.define('Guardrail', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(64), allowNull: false, unique: true, validate: NAME_VALIDATE },
  description: { type: DataTypes.TEXT, allowNull: true },
  // Builder drafts always save disabled; enabling requires the full test suite
  // to pass (enforced in the engine, not here).
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  scope: { type: DataTypes.JSONB, allowNull: false }, // subset of input|output|tool_call
  channels: { type: DataTypes.JSONB, allowNull: true }, // null/empty = all channels
  action: { type: DataTypes.ENUM('warn', 'escalate', 'block'), allowNull: false },
  rules: { type: DataTypes.JSONB, allowNull: false }, // regex|contains|max_length|llm_judge
  tests: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  builtFrom: { type: DataTypes.TEXT, allowNull: true, field: 'built_from' },
  createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' },
}, {
  tableName: 'guardrails',
  underscored: true,
  timestamps: true,
  indexes: [{ fields: ['enabled'] }],
});

// ── Skills: reusable instruction packs injected into system prompts ─────────
const Skill = sequelize.define('Skill', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(64), allowNull: false, unique: true, validate: NAME_VALIDATE },
  description: { type: DataTypes.TEXT, allowNull: false },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  instructions: { type: DataTypes.TEXT, allowNull: false },
  recommendedTools: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'recommended_tools' },
  builtFrom: { type: DataTypes.TEXT, allowNull: true, field: 'built_from' },
  createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' },
}, {
  tableName: 'skills',
  underscored: true,
  timestamps: true,
  indexes: [{ fields: ['enabled'] }],
});

// ── Custom tools: http request templates / python snippets, test-gated ──────
const Tool = sequelize.define('Tool', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(64), allowNull: false, unique: true, validate: NAME_VALIDATE },
  description: { type: DataTypes.TEXT, allowNull: false },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  kind: { type: DataTypes.ENUM('http', 'python'), allowNull: false },
  parameters: { type: DataTypes.JSONB, allowNull: false }, // JSON-schema object
  code: { type: DataTypes.TEXT, allowNull: true }, // python kind: def run(args)
  request: { type: DataTypes.JSONB, allowNull: true }, // http kind: {method,url,headers,body}
  timeout: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 10 }, // seconds, 1..120
  tests: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  builtFrom: { type: DataTypes.TEXT, allowNull: true, field: 'built_from' },
  createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' },
}, {
  tableName: 'tools',
  underscored: true,
  timestamps: true,
  indexes: [{ fields: ['enabled'] }],
});

// ── Agents: DB-backed agent definitions (FEAT-080) ──────────────────────────
// The JSON `spec` is versioned ({version:1, system_prompt, channel, model,
// tools, skills, guardrails, max_iterations, steps}) so future validators
// (FEAT-081 step types) can branch deterministically. Lifecycle lives in
// `status`: draft → validated → enabled; the draft→validated/enabled gate is
// deterministic spec validation ONLY (schema, referenced tools/skills/
// guardrails exist, model resolvable) — smoke runs are advisory, never a gate.
const Agent = sequelize.define('Agent', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(64), allowNull: false, unique: true, validate: NAME_VALIDATE },
  description: { type: DataTypes.TEXT, allowNull: true },
  status: { type: DataTypes.ENUM('draft', 'validated', 'enabled'), allowNull: false, defaultValue: 'draft' },
  spec: { type: DataTypes.JSONB, allowNull: false },
  // Seeded legacy personas (task/assistant/cs) — protected from deletion.
  builtin: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  lastValidation: { type: DataTypes.JSONB, allowNull: true, field: 'last_validation' }, // {ok, problems, at}
  builtFrom: { type: DataTypes.TEXT, allowNull: true, field: 'built_from' },
  createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' },
}, {
  tableName: 'agents',
  underscored: true,
  timestamps: true,
  indexes: [{ fields: ['status'] }],
});

// ── Agent runs: per-agent run ledger with transcripts (FEAT-080) ────────────
// origin is a plain STRING (not ENUM) so FEAT-082 can add 'scheduled'/
// 'webhook' without an ALTER; trigger_ref is its generic slot (schedule id /
// webhook id). Lifecycle columns mirror AgentTask so FEAT-082's overlap guard
// ("skip while the previous run is still active") reads straight off status.
const AgentRun = sequelize.define('AgentRun', {
  id: { type: DataTypes.STRING(64), primaryKey: true }, // run-<epoch>-<hex>
  agentId: { type: DataTypes.UUID, allowNull: false, field: 'agent_id' },
  status: { type: DataTypes.ENUM('queued', 'running', 'done', 'failed'), allowNull: false, defaultValue: 'queued' },
  origin: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'manual' }, // manual|smoke (FEAT-082: scheduled|webhook)
  triggerRef: { type: DataTypes.STRING(64), allowNull: true, field: 'trigger_ref' },
  input: { type: DataTypes.TEXT, allowNull: false },
  model: { type: DataTypes.STRING(128), allowNull: true }, // effective model override (null = spec/brain)
  result: { type: DataTypes.TEXT, allowNull: true },
  error: { type: DataTypes.TEXT, allowNull: true },
  transcript: { type: DataTypes.JSONB, allowNull: true },
  guardrails: { type: DataTypes.JSONB, allowNull: true }, // final output verdict {action, hits}
  userId: { type: DataTypes.UUID, allowNull: true, field: 'user_id' },
  finishedAt: { type: DataTypes.DATE, allowNull: true, field: 'finished_at' },
}, {
  tableName: 'agent_runs',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['agent_id', 'created_at'] },
    { fields: ['status'] },
  ],
});

// ── Agent tasks (long-running, executed by the Bull worker) ─────────────────
const AgentTask = sequelize.define('AgentTask', {
  id: { type: DataTypes.STRING(64), primaryKey: true }, // task-<epoch>-<hex>
  goal: { type: DataTypes.TEXT, allowNull: false },
  model: { type: DataTypes.STRING(128), allowNull: true }, // null = brain model
  status: { type: DataTypes.ENUM('queued', 'running', 'done', 'failed'), allowNull: false, defaultValue: 'queued' },
  tools: { type: DataTypes.JSONB, allowNull: true }, // custom-tool name list (null = all enabled)
  skills: { type: DataTypes.JSONB, allowNull: true },
  result: { type: DataTypes.TEXT, allowNull: true },
  error: { type: DataTypes.TEXT, allowNull: true },
  transcript: { type: DataTypes.JSONB, allowNull: true },
  guardrails: { type: DataTypes.JSONB, allowNull: true }, // final output verdict {action, hits}
  userId: { type: DataTypes.UUID, allowNull: true, field: 'user_id' },
  finishedAt: { type: DataTypes.DATE, allowNull: true, field: 'finished_at' },
}, {
  tableName: 'tasks',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['status'] },
    { fields: ['user_id'] },
    { fields: ['created_at'] },
  ],
});

// ── Chat sessions (assistant + guarded customer-service channels) ───────────
const ChatSession = sequelize.define('ChatSession', {
  id: { type: DataTypes.STRING(64), primaryKey: true }, // asst-… / chat-…
  channel: { type: DataTypes.ENUM('assistant', 'cs'), allowNull: false },
  model: { type: DataTypes.STRING(128), allowNull: true },
  skills: { type: DataTypes.JSONB, allowNull: true }, // assistant sessions only
  userId: { type: DataTypes.UUID, allowNull: true, field: 'user_id' },
}, {
  tableName: 'chat_sessions',
  underscored: true,
  timestamps: true,
  // BUG-067: the session list filters `channel` (admin) or `channel` + `user_id`
  // (owner) and orders (created_at, id) — so each path needs its own composite
  // ending in `id`. The bare `channel` index is a strict prefix of the first and
  // is dropped by the migration. `user_id` alone is NOT a prefix of anything
  // here, so it stays. Names are explicit so Sequelize's auto-naming cannot
  // drift from the migration's DDL.
  indexes: [
    { name: 'chat_sessions_channel_created_at_id', fields: ['channel', 'created_at', 'id'] },
    { name: 'chat_sessions_channel_user_id_created_at_id', fields: ['channel', 'user_id', 'created_at', 'id'] },
    { name: 'chat_sessions_user_id', fields: ['user_id'] },
  ],
});

const ChatMessage = sequelize.define('ChatMessage', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  sessionId: { type: DataTypes.STRING(64), allowNull: false, field: 'session_id' },
  role: { type: DataTypes.STRING(16), allowNull: false }, // user|assistant|customer|agent
  content: { type: DataTypes.TEXT, allowNull: false },
  // sent | blocked_input | blocked_output | escalated_input | escalated_output
  // | sent_after_review — null on user/customer messages.
  status: { type: DataTypes.STRING(32), allowNull: true },
}, {
  tableName: 'chat_messages',
  underscored: true,
  timestamps: true,
  updatedAt: false,
  // BUG-067: `id` must be IN the index, not just the filter+sort prefix —
  // without it the pathkeys stop one column short and Postgres adds an
  // Incremental Sort to every keyset page.
  indexes: [{ name: 'chat_messages_session_id_created_at_id', fields: ['session_id', 'created_at', 'id'] }],
});

// ── Outbox: drafted CS email replies (sent / held / blocked) ────────────────
const OutboxEntry = sequelize.define('OutboxEntry', {
  id: { type: DataTypes.STRING(64), primaryKey: true }, // mail-…
  toAddress: { type: DataTypes.STRING(320), allowNull: false, field: 'to_address' },
  subject: { type: DataTypes.STRING(998), allowNull: false },
  body: { type: DataTypes.TEXT, allowNull: true },
  status: { type: DataTypes.ENUM('sent', 'pending_review', 'blocked'), allowNull: false },
  guardrails: { type: DataTypes.JSONB, allowNull: true },
  userId: { type: DataTypes.UUID, allowNull: true, field: 'user_id' },
}, {
  tableName: 'outbox',
  underscored: true,
  timestamps: true,
  indexes: [{ fields: ['status'] }],
});

// ── Human-review queue for escalated content ────────────────────────────────
const Review = sequelize.define('Review', {
  id: { type: DataTypes.STRING(64), primaryKey: true }, // rev-…
  kind: {
    // FEAT-081 adds 'agent_step': a chained agent run escalated at a specific
    // step. Sequelize cannot ALTER an existing Postgres enum, so an existing DB
    // needs migration 20260729000002 — without it, escalating a chained run
    // throws `invalid input value for enum cortex.enum_reviews_kind`.
    type: DataTypes.ENUM('assistant_reply', 'cs_chat_input', 'cs_chat_reply', 'cs_email', 'agent_step'),
    allowNull: false,
  },
  sessionId: { type: DataTypes.STRING(64), allowNull: true, field: 'session_id' },
  outboxId: { type: DataTypes.STRING(64), allowNull: true, field: 'outbox_id' },
  draft: { type: DataTypes.TEXT, allowNull: true },
  customerMessage: { type: DataTypes.TEXT, allowNull: true, field: 'customer_message' },
  guardrails: { type: DataTypes.JSONB, allowNull: true },
  status: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), allowNull: false, defaultValue: 'pending' },
  note: { type: DataTypes.TEXT, allowNull: true },
  resolvedAt: { type: DataTypes.DATE, allowNull: true, field: 'resolved_at' },
  resolvedBy: { type: DataTypes.UUID, allowNull: true, field: 'resolved_by' },
}, {
  tableName: 'reviews',
  underscored: true,
  timestamps: true,
  indexes: [{ fields: ['status'] }],
});

// ── Prompt log: every LLM prompt/response, fire-and-forget telemetry ────────
const PromptLog = sequelize.define('PromptLog', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  channel: { type: DataTypes.STRING(32), allowNull: false }, // assistant|cs_chat|cs_email|task|judge|build
  sessionId: { type: DataTypes.STRING(64), allowNull: true, field: 'session_id' },
  model: { type: DataTypes.STRING(128), allowNull: true },
  prompt: { type: DataTypes.JSONB, allowNull: false },
  response: { type: DataTypes.JSONB, allowNull: true },
  usage: { type: DataTypes.JSONB, allowNull: true },
  cached: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  guardrails: { type: DataTypes.JSONB, allowNull: true },
  latencyMs: { type: DataTypes.INTEGER, allowNull: true, field: 'latency_ms' },
}, {
  tableName: 'prompt_logs',
  underscored: true,
  timestamps: true,
  updatedAt: false,
  indexes: [
    { fields: ['created_at'] },
    { fields: ['channel', 'created_at'] },
    { fields: ['session_id'] },
  ],
});

// ── Associations ────────────────────────────────────────────────────────────
ChatSession.hasMany(ChatMessage, { foreignKey: 'session_id', as: 'messages' });
ChatMessage.belongsTo(ChatSession, { foreignKey: 'session_id', as: 'session' });

// RESTRICT (the app also guards): agent delete is refused while runs exist so
// run-history attribution is never orphaned.
Agent.hasMany(AgentRun, { foreignKey: 'agent_id', as: 'runs', onDelete: 'RESTRICT' });
AgentRun.belongsTo(Agent, { foreignKey: 'agent_id', as: 'agent' });

module.exports = {
  sequelize,
  Guardrail,
  Skill,
  Tool,
  Agent,
  AgentRun,
  AgentTask,
  ChatSession,
  ChatMessage,
  OutboxEntry,
  Review,
  PromptLog,
};
