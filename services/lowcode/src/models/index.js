'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Low-Code module — Sequelize models (schema `lowcode`).
 *
 * The low-code platform is its OWN runtime (entities / forms / flows / lookups)
 * but REUSES the plugins module's trust layer — scope model, capability
 * vocabulary, condition evaluator, state-machine engine, and hook bus — rather
 * than building a second one (decisions ledger §Lowcode↔Plugin = "separate,
 * shares infra"). That sharing happens in the services, not the schema: these
 * tables are independent of the `plugins` schema.
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');
const { getSequelize } = require('../../../../src/db/sequelize');

const sequelize = getSequelize('lowcode');

// ── An app groups entities/forms/flows/lookups ──────────────────────────────
const LcApp = sequelize.define('LcApp', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  key: { type: DataTypes.STRING(64), allowNull: false, unique: true, validate: { is: /^[a-z][a-z0-9_-]*$/ } },
  name: { type: DataTypes.STRING(255), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  status: { type: DataTypes.ENUM('draft', 'published', 'archived'), allowNull: false, defaultValue: 'draft' },
  createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' },
  // Ownership scope of the app itself (decisions ledger: apps are app-scoped +
  // standalone studio + Nexus/org embeds). scopeId names the org/group/user.
  scopeType: { type: DataTypes.ENUM('platform', 'organization', 'group', 'user'), allowNull: false, defaultValue: 'platform', field: 'scope_type' },
  scopeId: { type: DataTypes.UUID, allowNull: true, field: 'scope_id' },
  // Capabilities granted to this app's flows for capability-gated module actions
  // (subset of the plugins capability vocabulary). A flow's module write action
  // only runs if the app declares its required capability. Default: none.
  capabilities: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
}, {
  tableName: 'lc_apps', underscored: true, timestamps: true,
  indexes: [{ fields: ['scope_type', 'scope_id'] }],
});

// ── Reusable lookup lists (enum sources, reference data) ─────────────────────
const LcLookup = sequelize.define('LcLookup', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  appId: { type: DataTypes.UUID, allowNull: true, field: 'app_id' },
  key: { type: DataTypes.STRING(64), allowNull: false, validate: { is: /^[a-z][a-z0-9_-]*$/ } },
  name: { type: DataTypes.STRING(255), allowNull: false },
  // Inline/static list: [{ value, label, color?, order?, metadata? }]. For
  // provider-backed lookups this is a cached fallback; `source` is authoritative.
  values: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  /**
   * How the list is sourced (decisions ledger look.source = static + dynamic):
   *   { type: 'static' }                                   → use `values`
   *   { type: 'provider', provider: '<key>', params: {} }  → resolve at runtime
   * A null/absent source is treated as static (backward compatible).
   */
  source: { type: DataTypes.JSONB, allowNull: true },
}, {
  tableName: 'lc_lookups', underscored: true, timestamps: true,
  indexes: [{ unique: true, fields: ['app_id', 'key'] }],
});

// ── Entity = a strongly-typed record type ───────────────────────────────────
const LcEntity = sequelize.define('LcEntity', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  appId: { type: DataTypes.UUID, allowNull: false, field: 'app_id' },
  key: { type: DataTypes.STRING(64), allowNull: false, validate: { is: /^[a-z][a-z0-9_-]*$/ } },
  name: { type: DataTypes.STRING(255), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  /**
   * Strongly-typed property definitions (Tableau/PowerBI-style). Each field:
   *   { key, label, type, required?, unique?, role, enumValues?, enumLookup?,
   *     refEntity?, aggregation?, format?, default?, min?, max? }
   * type ∈ string|text|number|integer|boolean|date|datetime|enum|reference|json
   * role ∈ dimension|measure|attribute   aggregation ∈ sum|avg|count|min|max
   */
  fields: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  // Optional record lifecycle state machine: { initial, states, transitions }.
  stateMachine: { type: DataTypes.JSONB, allowNull: true, field: 'state_machine' },
  /**
   * Where records are persisted (decisions ledger: "all modes, per-entity"):
   *   { mode: 'db' | 'mirror' | 'filevault' | 'export', directoryId?, directory? }
   *   · db        — Postgres lc_records only (default)
   *   · mirror    — Postgres (authoritative + queryable) + JSON file per record
   *   · filevault — Postgres shadow kept for query/refs; FileVault JSON authoritative
   *   · export    — Postgres + on-demand collection export (no per-write file)
   * A null/absent storage is treated as { mode: 'db' } (backward compatible).
   */
  storage: { type: DataTypes.JSONB, allowNull: true },
}, {
  tableName: 'lc_entities', underscored: true, timestamps: true,
  indexes: [{ unique: true, fields: ['app_id', 'key'] }],
});

// ── Record = one strongly-typed row of an entity ────────────────────────────
const LcRecord = sequelize.define('LcRecord', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  entityId: { type: DataTypes.UUID, allowNull: false, field: 'entity_id' },
  appId: { type: DataTypes.UUID, allowNull: false, field: 'app_id' },
  data: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  state: { type: DataTypes.STRING(64), allowNull: true },
  ownerId: { type: DataTypes.UUID, allowNull: true, field: 'owner_id' },
  // Visibility scope (decisions ledger ent.ownership = "scope like flows"). MVP
  // enforces platform (all authed) vs owner-only; scopeId reserves org/group.
  scopeType: { type: DataTypes.ENUM('platform', 'organization', 'group', 'user'), allowNull: false, defaultValue: 'platform', field: 'scope_type' },
  scopeId: { type: DataTypes.UUID, allowNull: true, field: 'scope_id' },
  // Pointer to external storage for mirror/filevault modes, e.g. { filevaultId }.
  storageRef: { type: DataTypes.JSONB, allowNull: true, field: 'storage_ref' },
}, {
  tableName: 'lc_records', underscored: true, timestamps: true,
  indexes: [{ fields: ['entity_id'] }, { fields: ['owner_id'] }, { fields: ['scope_type', 'scope_id'] }],
});

// ── Form = a declarative UI surface over an entity ──────────────────────────
const LcForm = sequelize.define('LcForm', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  appId: { type: DataTypes.UUID, allowNull: false, field: 'app_id' },
  entityKey: { type: DataTypes.STRING(64), allowNull: false, field: 'entity_key' },
  key: { type: DataTypes.STRING(64), allowNull: false, validate: { is: /^[a-z][a-z0-9_-]*$/ } },
  name: { type: DataTypes.STRING(255), allowNull: false },
  /**
   * { sections: [{ title?, fields: [ 'fieldKey' | { key, visibleWhen?,
   *   placeholder?, help? } ] }], steps?: boolean, submitLabel? }
   * `visibleWhen` is a condition tree over the in-progress record data
   * (shared evaluator); `steps: true` renders each section as a wizard step.
   */
  layout: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  // Public (anonymous) form: reachable at /api/hooks/forms/:slug with no auth.
  // Only fields listed in the layout are accepted from anonymous submitters.
  isPublic: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_public' },
  slug: { type: DataTypes.STRING(64), allowNull: true, unique: true },
  // { successMessage?, allowMultipleSubmissions? … } — renderer hints.
  settings: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
}, {
  tableName: 'lc_forms', underscored: true, timestamps: true,
  indexes: [{ unique: true, fields: ['app_id', 'key'] }],
});

// ── Saved view = a named grid/kanban/calendar configuration over an entity ──
const LcView = sequelize.define('LcView', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  appId: { type: DataTypes.UUID, allowNull: false, field: 'app_id' },
  entityKey: { type: DataTypes.STRING(64), allowNull: false, field: 'entity_key' },
  name: { type: DataTypes.STRING(255), allowNull: false },
  // null ownerId = shared with everyone who can see the app (admin-created).
  ownerId: { type: DataTypes.UUID, allowNull: true, field: 'owner_id' },
  viewType: { type: DataTypes.ENUM('grid', 'kanban', 'calendar'), allowNull: false, defaultValue: 'grid', field: 'view_type' },
  // { filters?, sort?, columns?, groupByField? (kanban), dateField? (calendar) }
  config: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
}, {
  tableName: 'lc_views', underscored: true, timestamps: true,
  indexes: [{ fields: ['app_id', 'entity_key'] }, { fields: ['owner_id'] }],
});

// ── Flow = trigger → condition → action, executed on the plugins hook bus ───
const LcFlow = sequelize.define('LcFlow', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  appId: { type: DataTypes.UUID, allowNull: false, field: 'app_id' },
  key: { type: DataTypes.STRING(64), allowNull: false, validate: { is: /^[a-z][a-z0-9_-]*$/ } },
  name: { type: DataTypes.STRING(255), allowNull: false },
  /**
   * `event` is the hook-bus event key for event-triggered flows. Non-event
   * triggers store a sentinel here (_schedule/_webhook/_manual) — sentinels are
   * never emitted on the bus, so the event index stays the dispatch path.
   */
  event: { type: DataTypes.STRING(128), allowNull: false },
  /**
   * How the flow fires (null = legacy event trigger using `event`):
   *   { type: 'event' }
   *   { type: 'schedule', cron: '0 9 * * 1' }  (standard 5-field cron)
   *   { type: 'webhook', secret: '<hex>' }   → POST /api/hooks/flows/:appKey/:flowKey
   *   { type: 'manual' }                     → design-API execute only
   */
  trigger: { type: DataTypes.JSONB, allowNull: true },
  match: { type: DataTypes.JSONB, allowNull: true },        // condition tree
  /**
   * Ordered action list. Each action: { type, …params } plus optional
   * per-action controls: `when` (condition tree gating just this action),
   * `onError` ('continue'|'stop', default continue), `retries` (0–3).
   */
  actions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  scopeType: { type: DataTypes.ENUM('platform', 'organization', 'group', 'user'), allowNull: false, defaultValue: 'platform', field: 'scope_type' },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  tableName: 'lc_flows', underscored: true, timestamps: true,
  indexes: [{ unique: true, fields: ['app_id', 'key'] }, { fields: ['event'] }, { fields: ['enabled'] }],
});

// ── Flow run = one execution's audit trail (per-step results) ───────────────
const LcFlowRun = sequelize.define('LcFlowRun', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  flowId: { type: DataTypes.UUID, allowNull: false, field: 'flow_id' },
  appId: { type: DataTypes.UUID, allowNull: false, field: 'app_id' },
  // What fired it: the hook-bus event key, or 'manual' | 'schedule' | 'webhook'.
  trigger: { type: DataTypes.STRING(128), allowNull: false },
  status: { type: DataTypes.ENUM('success', 'partial', 'error', 'skipped'), allowNull: false },
  // Truncated snapshot of the triggering context (secrets never land here).
  context: { type: DataTypes.JSONB, allowNull: true },
  // [{ i, type, status: 'ok'|'error'|'skipped', error?, result?, ms, attempts }]
  steps: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  error: { type: DataTypes.TEXT, allowNull: true },
  triggeredBy: { type: DataTypes.UUID, allowNull: true, field: 'triggered_by' },
  startedAt: { type: DataTypes.DATE, allowNull: false, field: 'started_at' },
  finishedAt: { type: DataTypes.DATE, allowNull: true, field: 'finished_at' },
}, {
  tableName: 'lc_flow_runs', underscored: true, timestamps: true, updatedAt: false,
  indexes: [{ fields: ['flow_id', 'created_at'] }, { fields: ['app_id'] }],
});

// ── Associations ────────────────────────────────────────────────────────────
LcApp.hasMany(LcEntity, { foreignKey: 'app_id', as: 'entities' });
LcEntity.belongsTo(LcApp, { foreignKey: 'app_id', as: 'app' });
LcEntity.hasMany(LcRecord, { foreignKey: 'entity_id', as: 'records' });
LcRecord.belongsTo(LcEntity, { foreignKey: 'entity_id', as: 'entity' });
LcApp.hasMany(LcForm, { foreignKey: 'app_id', as: 'forms' });
LcApp.hasMany(LcFlow, { foreignKey: 'app_id', as: 'flows' });
LcApp.hasMany(LcLookup, { foreignKey: 'app_id', as: 'lookups' });
LcFlow.hasMany(LcFlowRun, { foreignKey: 'flow_id', as: 'runs' });
LcFlowRun.belongsTo(LcFlow, { foreignKey: 'flow_id', as: 'flow' });

module.exports = { sequelize, LcApp, LcLookup, LcEntity, LcRecord, LcForm, LcFlow, LcFlowRun, LcView };
