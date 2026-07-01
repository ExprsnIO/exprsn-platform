'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Plugins module — Sequelize models
 *
 * A plugin is a declarative, scoped, capability-gated extension described by a
 * manifest and stored as DATA — never arbitrary code loaded into the gateway.
 * See PLUGINS_PLAN.md §2 for the data model rationale.
 *
 * All tables live in the `plugins` schema. The instance is obtained from the
 * platform's shared getSequelize() so the gateway process and the migrate-sync
 * child both target the one database, schema-namespaced.
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');
const { getSequelize } = require('../../../../src/db/sequelize');

const sequelize = getSequelize('plugins');

// ── Catalog of known plugins ────────────────────────────────────────────────
const Plugin = sequelize.define('Plugin', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  pluginKey: {
    type: DataTypes.STRING(128),
    allowNull: false,
    unique: true,
    field: 'plugin_key',
    validate: { is: /^[a-z][a-z0-9_-]*$/ }, // mirrors ModeratorConfig key discipline
  },
  name: { type: DataTypes.STRING(255), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  publisher: { type: DataTypes.STRING(255), allowNull: true },
  latestVersion: { type: DataTypes.STRING(32), allowNull: false, field: 'latest_version' },
  kind: { type: DataTypes.ENUM('declarative', 'webhook', 'script', 'internal'), allowNull: false },
  source: { type: DataTypes.ENUM('builtin', 'registry', 'uploaded'), allowNull: false, defaultValue: 'uploaded' },
  status: { type: DataTypes.ENUM('draft', 'published', 'deprecated', 'disabled'), allowNull: false, defaultValue: 'published' },
  manifest: { type: DataTypes.JSONB, allowNull: false },
  signature: { type: DataTypes.TEXT, allowNull: true },
}, {
  tableName: 'plugins',
  underscored: true,
  timestamps: true,
});

// ── Immutable manifest history ──────────────────────────────────────────────
const PluginVersion = sequelize.define('PluginVersion', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  pluginId: { type: DataTypes.UUID, allowNull: false, field: 'plugin_id' },
  version: { type: DataTypes.STRING(32), allowNull: false },
  manifest: { type: DataTypes.JSONB, allowNull: false },
  checksum: { type: DataTypes.STRING(64), allowNull: true },
}, {
  tableName: 'plugin_versions',
  underscored: true,
  timestamps: true,
  updatedAt: false,
  indexes: [{ unique: true, fields: ['plugin_id', 'version'] }],
});

// ── A plugin enabled at a scope ─────────────────────────────────────────────
const PluginInstallation = sequelize.define('PluginInstallation', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  pluginId: { type: DataTypes.UUID, allowNull: false, field: 'plugin_id' },
  scopeType: { type: DataTypes.ENUM('platform', 'organization', 'group', 'user'), allowNull: false, field: 'scope_type' },
  scopeId: { type: DataTypes.UUID, allowNull: true, field: 'scope_id' }, // null only for platform
  version: { type: DataTypes.STRING(32), allowNull: false },
  status: { type: DataTypes.ENUM('installed', 'enabled', 'disabled', 'error'), allowNull: false, defaultValue: 'enabled' },
  // Free-form lifecycle state driven by the state-machine engine (default
  // machine: installed → enabled ⇄ disabled → uninstalled). Distinct from the
  // coarse `status` column which the resolver keys off.
  lifecycleState: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'installed', field: 'lifecycle_state' },
  config: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  secretsRef: { type: DataTypes.STRING(255), allowNull: true, field: 'secrets_ref' },
  installedBy: { type: DataTypes.UUID, allowNull: true, field: 'installed_by' },
  lastError: { type: DataTypes.TEXT, allowNull: true, field: 'last_error' },
}, {
  tableName: 'plugin_installations',
  underscored: true,
  timestamps: true,
  indexes: [
    { unique: true, fields: ['plugin_id', 'scope_type', 'scope_id'] },
    { fields: ['scope_type', 'scope_id'] },
    { fields: ['status'] },
  ],
});

// ── Capability grants approved at install ───────────────────────────────────
const PluginGrant = sequelize.define('PluginGrant', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  installationId: { type: DataTypes.UUID, allowNull: false, field: 'installation_id' },
  capability: { type: DataTypes.STRING(128), allowNull: false }, // closed vocabulary
  resource: { type: DataTypes.STRING(255), allowNull: true },
  grantedBy: { type: DataTypes.UUID, allowNull: true, field: 'granted_by' },
}, {
  tableName: 'plugin_grants',
  underscored: true,
  timestamps: true,
  updatedAt: false,
  indexes: [{ fields: ['installation_id'] }],
});

// ── Hook / webhook delivery + execution log (also the audit trail) ──────────
const PluginDelivery = sequelize.define('PluginDelivery', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  installationId: { type: DataTypes.UUID, allowNull: true, field: 'installation_id' },
  pluginKey: { type: DataTypes.STRING(128), allowNull: true, field: 'plugin_key' },
  event: { type: DataTypes.STRING(128), allowNull: false },
  kind: { type: DataTypes.ENUM('declarative', 'webhook', 'script', 'internal'), allowNull: false },
  status: { type: DataTypes.ENUM('queued', 'running', 'completed', 'failed', 'skipped'), allowNull: false, defaultValue: 'queued' },
  matched: { type: DataTypes.BOOLEAN, allowNull: true },
  attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  responseCode: { type: DataTypes.INTEGER, allowNull: true, field: 'response_code' },
  result: { type: DataTypes.JSONB, allowNull: true },
  error: { type: DataTypes.TEXT, allowNull: true },
  correlationId: { type: DataTypes.STRING(64), allowNull: true, field: 'correlation_id' },
  finishedAt: { type: DataTypes.DATE, allowNull: true, field: 'finished_at' },
}, {
  tableName: 'plugin_deliveries',
  underscored: true,
  timestamps: true,
  updatedAt: false,
  indexes: [
    { fields: ['installation_id'] },
    { fields: ['event'] },
    { fields: ['status'] },
    { fields: ['created_at'] },
  ],
});

// ── Endpoint management (named outbound/inbound endpoints) ──────────────────
const PluginEndpoint = sequelize.define('PluginEndpoint', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  pluginId: { type: DataTypes.UUID, allowNull: true, field: 'plugin_id' },
  installationId: { type: DataTypes.UUID, allowNull: true, field: 'installation_id' },
  name: { type: DataTypes.STRING(128), allowNull: false, validate: { is: /^[a-z][a-z0-9_-]*$/ } },
  direction: { type: DataTypes.ENUM('outbound', 'inbound'), allowNull: false, defaultValue: 'outbound' },
  method: { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'POST' },
  url: { type: DataTypes.TEXT, allowNull: true }, // outbound target; inbound has a generated path
  inboundPath: { type: DataTypes.STRING(255), allowNull: true, field: 'inbound_path' },
  timeoutMs: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 4000, field: 'timeout_ms' },
  secretRef: { type: DataTypes.STRING(255), allowNull: true, field: 'secret_ref' },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  // Lightweight circuit-breaker state, updated by the dispatcher.
  failureCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'failure_count' },
  openedUntil: { type: DataTypes.DATE, allowNull: true, field: 'opened_until' },
}, {
  tableName: 'plugin_endpoints',
  underscored: true,
  timestamps: true,
  indexes: [
    { unique: true, fields: ['installation_id', 'name'] },
    { fields: ['inbound_path'] },
  ],
});

// ── State-machine transition log ────────────────────────────────────────────
const PluginTransition = sequelize.define('PluginTransition', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  installationId: { type: DataTypes.UUID, allowNull: false, field: 'installation_id' },
  machine: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'install' },
  fromState: { type: DataTypes.STRING(64), allowNull: true, field: 'from_state' },
  toState: { type: DataTypes.STRING(64), allowNull: false, field: 'to_state' },
  event: { type: DataTypes.STRING(64), allowNull: false },
  actor: { type: DataTypes.UUID, allowNull: true },
}, {
  tableName: 'plugin_transitions',
  underscored: true,
  timestamps: true,
  updatedAt: false,
  indexes: [{ fields: ['installation_id'] }],
});

// ── Associations ────────────────────────────────────────────────────────────
Plugin.hasMany(PluginVersion, { foreignKey: 'plugin_id', as: 'versions' });
PluginVersion.belongsTo(Plugin, { foreignKey: 'plugin_id', as: 'plugin' });

Plugin.hasMany(PluginInstallation, { foreignKey: 'plugin_id', as: 'installations' });
PluginInstallation.belongsTo(Plugin, { foreignKey: 'plugin_id', as: 'plugin' });

PluginInstallation.hasMany(PluginGrant, { foreignKey: 'installation_id', as: 'grants' });
PluginGrant.belongsTo(PluginInstallation, { foreignKey: 'installation_id', as: 'installation' });

PluginInstallation.hasMany(PluginDelivery, { foreignKey: 'installation_id', as: 'deliveries' });
PluginDelivery.belongsTo(PluginInstallation, { foreignKey: 'installation_id', as: 'installation' });

PluginInstallation.hasMany(PluginEndpoint, { foreignKey: 'installation_id', as: 'endpoints' });
PluginEndpoint.belongsTo(PluginInstallation, { foreignKey: 'installation_id', as: 'installation' });

PluginInstallation.hasMany(PluginTransition, { foreignKey: 'installation_id', as: 'transitions' });
PluginTransition.belongsTo(PluginInstallation, { foreignKey: 'installation_id', as: 'installation' });

module.exports = {
  sequelize,
  Plugin,
  PluginVersion,
  PluginInstallation,
  PluginGrant,
  PluginDelivery,
  PluginEndpoint,
  PluginTransition,
};
