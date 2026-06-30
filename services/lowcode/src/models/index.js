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
}, { tableName: 'lc_apps', underscored: true, timestamps: true });

// ── Reusable lookup lists (enum sources, reference data) ─────────────────────
const LcLookup = sequelize.define('LcLookup', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  appId: { type: DataTypes.UUID, allowNull: true, field: 'app_id' },
  key: { type: DataTypes.STRING(64), allowNull: false, validate: { is: /^[a-z][a-z0-9_-]*$/ } },
  name: { type: DataTypes.STRING(255), allowNull: false },
  // [{ value, label, color?, order?, metadata? }]
  values: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
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
}, {
  tableName: 'lc_records', underscored: true, timestamps: true,
  indexes: [{ fields: ['entity_id'] }, { fields: ['owner_id'] }],
});

// ── Form = a declarative UI surface over an entity ──────────────────────────
const LcForm = sequelize.define('LcForm', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  appId: { type: DataTypes.UUID, allowNull: false, field: 'app_id' },
  entityKey: { type: DataTypes.STRING(64), allowNull: false, field: 'entity_key' },
  key: { type: DataTypes.STRING(64), allowNull: false, validate: { is: /^[a-z][a-z0-9_-]*$/ } },
  name: { type: DataTypes.STRING(255), allowNull: false },
  // { sections:[{ title, fields:[fieldKey] }], submitLabel? }
  layout: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
}, {
  tableName: 'lc_forms', underscored: true, timestamps: true,
  indexes: [{ unique: true, fields: ['app_id', 'key'] }],
});

// ── Flow = trigger → condition → action, executed on the plugins hook bus ───
const LcFlow = sequelize.define('LcFlow', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  appId: { type: DataTypes.UUID, allowNull: false, field: 'app_id' },
  key: { type: DataTypes.STRING(64), allowNull: false, validate: { is: /^[a-z][a-z0-9_-]*$/ } },
  name: { type: DataTypes.STRING(255), allowNull: false },
  event: { type: DataTypes.STRING(128), allowNull: false }, // hook-bus event key
  match: { type: DataTypes.JSONB, allowNull: true },        // condition tree
  actions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  scopeType: { type: DataTypes.ENUM('platform', 'organization', 'group', 'user'), allowNull: false, defaultValue: 'platform', field: 'scope_type' },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  tableName: 'lc_flows', underscored: true, timestamps: true,
  indexes: [{ unique: true, fields: ['app_id', 'key'] }, { fields: ['event'] }, { fields: ['enabled'] }],
});

// ── Associations ────────────────────────────────────────────────────────────
LcApp.hasMany(LcEntity, { foreignKey: 'app_id', as: 'entities' });
LcEntity.belongsTo(LcApp, { foreignKey: 'app_id', as: 'app' });
LcEntity.hasMany(LcRecord, { foreignKey: 'entity_id', as: 'records' });
LcRecord.belongsTo(LcEntity, { foreignKey: 'entity_id', as: 'entity' });
LcApp.hasMany(LcForm, { foreignKey: 'app_id', as: 'forms' });
LcApp.hasMany(LcFlow, { foreignKey: 'app_id', as: 'flows' });
LcApp.hasMany(LcLookup, { foreignKey: 'app_id', as: 'lookups' });

module.exports = { sequelize, LcApp, LcLookup, LcEntity, LcRecord, LcForm, LcFlow };
