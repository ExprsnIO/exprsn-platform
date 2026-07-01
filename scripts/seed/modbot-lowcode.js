'use strict';

/**
 * Moderator-bot low-code application seeder — provisions a self-contained
 * moderation "bot" as a low-code app at BOTH the organization and group scope,
 * and engages the platform's AI/moderation settings it relies on.
 *
 * Per scope it creates:
 *   APP       modbot-<org|group>  (capability: call:queues.enqueue), scoped
 *   ENTITIES  mb_incident (typed + state machine open→reviewing→actioned/dismissed)
 *             mb_watchword (data-driven banned-term rules)  + seeded terms
 *   LOOKUPS   mb_severity, mb_category, mb_source (static)
 *             mb_watchwords (DYNAMIC — sourced from the mb_watchword records)
 *   FORM      mb_incident_form
 *   FLOWS     flag-toxic-post   (timeline.post.created → flag + incident + notify + enqueue)
 *             log-mod-flags     (moderator.content.flagged → incident + enqueue)
 *             screen-new-members (group only: nexus.group.member.joined → incident + notify)
 *   PLUGIN    modbot-guard-<scope>  (declarative, installed at the scope — hook-bus flag+notify)
 *
 * Once, globally, it ENGAGES moderation/AI settings (moderator schema):
 *   ModeratorConfig: ai_moderation_enabled, ai_auto_moderate, toxicity_threshold, modbot_engaged
 *   ModerationRule:  modbot-keyword-guard (action=flag)
 *
 * Scope ids come from env (MODBOT_ORG_ID / MODBOT_GROUP_ID) or fall back to demo
 * UUIDs — the app functions regardless; membership just governs who sees its data.
 *
 * Usage:
 *   node scripts/seed/modbot-lowcode.js                  # provision (idempotent)
 *   MODBOT_ORG_ID=<uuid> MODBOT_GROUP_ID=<uuid> node scripts/seed/modbot-lowcode.js
 *   MODBOT_RESET=1 node scripts/seed/modbot-lowcode.js   # remove modbot-* rows
 *
 * Run `npm run db:migrate` first so the lowcode/plugins/moderator schemas exist.
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_seed_dummy';
process.env.LOWCODE_ENABLED = process.env.LOWCODE_ENABLED || 'true';
process.env.PLUGINS_ENABLED = process.env.PLUGINS_ENABLED || 'true';
require('dotenv').config({ path: path.join(ROOT, '.env') });

const { Op } = require('sequelize');
const lc = require(path.join(ROOT, 'services/lowcode/src/models'));
const { LcApp, LcLookup, LcEntity, LcRecord, LcForm, LcFlow } = lc;
const entityService = require(path.join(ROOT, 'services/lowcode/src/services/entityService'));
const pluginsDb = require(path.join(ROOT, 'services/plugins/src/models'));
const lifecycle = require(path.join(ROOT, 'services/plugins/src/services/lifecycleService'));

// Moderator models are optional — the lowcode/plugin bot works without them; if
// present we also engage the platform AI/moderation settings the bot leans on.
let ModerationRule = null;
let ModeratorConfig = null;
try { ({ ModerationRule, ModeratorConfig } = require(path.join(ROOT, 'services/moderator/models/sequelize-index'))); } catch (_) { /* optional */ }

const ORG_ID = process.env.MODBOT_ORG_ID || '00000000-0000-4000-8000-0000000000a1';
const GROUP_ID = process.env.MODBOT_GROUP_ID || '00000000-0000-4000-8000-0000000000b2';
const BANNED = ['spammyword', 'buy-now', 'free-crypto', 'kill', 'scam-link'];

// ── idempotent upserts ──────────────────────────────────────────────────────
async function upsertApp(scopeType, scopeId, suffix) {
  const key = `modbot-${suffix}`;
  const [app] = await LcApp.findOrCreate({
    where: { key },
    defaults: { key, name: `Moderator Bot (${suffix})`, description: 'Low-code moderation bot', status: 'published', scopeType, scopeId, capabilities: ['call:queues.enqueue'] },
  });
  app.scopeType = scopeType; app.scopeId = scopeId; app.capabilities = ['call:queues.enqueue']; app.status = 'published';
  await app.save();
  return app;
}
async function upsertEntity(appId, key, name, fields, stateMachine) {
  const [e] = await LcEntity.findOrCreate({ where: { appId, key }, defaults: { appId, key, name, fields, stateMachine: stateMachine || null } });
  e.fields = fields; e.stateMachine = stateMachine || null; await e.save();
  return e;
}
async function upsertLookup(appId, key, name, values, source) {
  const [l] = await LcLookup.findOrCreate({ where: { appId, key }, defaults: { appId, key, name, values, source: source || null } });
  l.values = values; l.source = source || null; await l.save();
  return l;
}
async function upsertForm(appId, key, name, entityKey, layout) {
  await LcForm.findOrCreate({ where: { appId, key }, defaults: { appId, key, name, entityKey, layout } });
}
async function upsertFlow(appId, scopeType, key, name, event, match, actions) {
  const [f] = await LcFlow.findOrCreate({ where: { appId, key }, defaults: { appId, key, name, event, match, actions, scopeType, enabled: true } });
  f.match = match; f.actions = actions; f.event = event; f.enabled = true; f.scopeType = scopeType; await f.save();
}
async function ensureRecord(entity, data, dedupeField) {
  const existing = await LcRecord.findOne({ where: { entityId: entity.id, [`data.${dedupeField}`]: data[dedupeField] } });
  if (existing) return existing;
  return entityService.createRecord(entity, data, {});
}

// ── the bot definition, applied per scope ───────────────────────────────────
async function provisionModbot(scopeType, scopeId, suffix) {
  const app = await upsertApp(scopeType, scopeId, suffix);

  await upsertLookup(app.id, 'mb_severity', 'Severity', ['low', 'medium', 'high', 'critical'].map((v) => ({ value: v, label: v })), { type: 'static' });
  await upsertLookup(app.id, 'mb_category', 'Category', ['spam', 'harassment', 'violence', 'nsfw', 'other'].map((v) => ({ value: v, label: v })), { type: 'static' });
  await upsertLookup(app.id, 'mb_source', 'Source', ['timeline', 'spark', 'nexus', 'moderator'].map((v) => ({ value: v, label: v })), { type: 'static' });
  await upsertLookup(app.id, 'mb_watchwords', 'Watchwords', [], { type: 'provider', provider: 'lowcode.entity', params: { entityKey: 'mb_watchword', valueField: 'term', labelField: 'term' } });

  const watchword = await upsertEntity(app.id, 'mb_watchword', 'Watchword', [
    { key: 'term', label: 'Term', type: 'string', required: true, unique: true, role: 'dimension' },
    { key: 'category', label: 'Category', type: 'enum', enumLookup: 'mb_category', role: 'dimension' },
    { key: 'severity', label: 'Severity', type: 'enum', enumLookup: 'mb_severity', role: 'dimension' },
    { key: 'enabled', label: 'Enabled', type: 'boolean' },
  ]);

  await upsertEntity(app.id, 'mb_incident', 'Incident', [
    { key: 'source', label: 'Source', type: 'enum', enumLookup: 'mb_source', role: 'dimension' },
    { key: 'contentType', label: 'Content type', type: 'string' },
    { key: 'contentId', label: 'Content id', type: 'string' },
    { key: 'author', label: 'Author', type: 'string' },
    { key: 'reason', label: 'Reason', type: 'text' },
    { key: 'category', label: 'Category', type: 'enum', enumLookup: 'mb_category', role: 'dimension' },
    { key: 'severity', label: 'Severity', type: 'enum', enumLookup: 'mb_severity', role: 'dimension' },
    { key: 'aiScore', label: 'AI score', type: 'number', role: 'measure', aggregation: 'avg' },
  ], {
    initial: 'open',
    states: ['open', 'reviewing', 'actioned', 'dismissed'],
    transitions: [
      { from: 'open', event: 'review', to: 'reviewing' },
      { from: 'open', event: 'dismiss', to: 'dismissed' },
      { from: 'reviewing', event: 'action', to: 'actioned' },
      { from: 'reviewing', event: 'dismiss', to: 'dismissed' },
    ],
  });

  await upsertForm(app.id, 'mb_incident_form', 'Incident', 'mb_incident', {
    sections: [{ title: 'Incident', fields: ['source', 'severity', 'category', 'author', 'reason'] }], submitLabel: 'Log incident',
  });

  // Seed a few watchword rules (records inherit the app scope).
  for (const w of [
    { term: 'spammyword', category: 'spam', severity: 'low', enabled: true },
    { term: 'free-crypto', category: 'spam', severity: 'medium', enabled: true },
    { term: 'kill', category: 'violence', severity: 'critical', enabled: true },
  ]) await ensureRecord(watchword, w, 'term');

  // Flows: trigger → condition → action (native + hook-bus actions).
  await upsertFlow(app.id, scopeType, 'flag-toxic-post', 'Flag toxic posts', 'timeline.post.created',
    { all: [{ field: 'post.content', op: 'keywords_any', value: BANNED }] },
    [
      { type: 'flag', reason: 'modbot: banned keyword in post' },
      { type: 'create_record', appId: app.id, entityKey: 'mb_incident', data: { source: 'timeline', contentType: 'post', reason: 'matched banned keyword', category: 'spam', severity: 'medium' } },
      { type: 'notify', title: 'Content flagged', body: 'A post was flagged by the moderator bot.', notificationType: 'warning' },
      { type: 'enqueue_job', queue: 'moderation', payload: { source: 'modbot', kind: 'post' } },
    ]);

  await upsertFlow(app.id, scopeType, 'log-mod-flags', 'Log moderation flags', 'moderator.content.flagged',
    null,
    [
      { type: 'create_record', appId: app.id, entityKey: 'mb_incident', data: { source: 'moderator', reason: 'platform moderation flag', severity: 'high' } },
      { type: 'enqueue_job', queue: 'moderation', payload: { source: 'modbot', kind: 'moderator-flag' } },
    ]);

  if (scopeType === 'group') {
    await upsertFlow(app.id, scopeType, 'screen-new-members', 'Screen new members', 'nexus.group.member.joined',
      null,
      [
        { type: 'create_record', appId: app.id, entityKey: 'mb_incident', data: { source: 'nexus', reason: 'new member screening', category: 'other', severity: 'low' } },
        { type: 'notify', title: 'New member', body: 'A new member joined and was screened by the moderator bot.', notificationType: 'info' },
      ]);
  }

  // Companion declarative PLUGIN installed at the scope (hook-bus flag+notify).
  const manifest = {
    key: `modbot-guard-${suffix}`,
    name: `Moderator Bot Guard (${suffix})`,
    description: 'Declarative keyword guard companion to the moderator-bot low-code app.',
    version: '1.0.0',
    publisher: 'exprsn',
    kind: 'declarative',
    appliesTo: ['timeline', 'spark'],
    events: ['timeline.post.created'],
    scopes: [scopeType],
    capabilities: ['read:timeline.posts', 'emit:moderator.flag', 'emit:notifications', 'emit:audit'],
    behavior: {
      match: { field: 'post.content', op: 'keywords_any', value: BANNED },
      actions: [
        { type: 'flag', reason: 'modbot-guard: banned keyword' },
        { type: 'notify', title: 'Flagged by moderator bot', body: 'Your post was flagged for review.', notificationType: 'warning' },
        { type: 'audit', note: 'modbot-guard flagged content' },
      ],
    },
  };
  try {
    await lifecycle.register(manifest, { source: 'registry' });
    await lifecycle.install({ pluginKey: manifest.key, scopeType, scopeId, capabilities: manifest.capabilities, installedBy: null });
  } catch (err) {
    console.log(`  plugin ${manifest.key}: install skipped (${err.message})`);
  }

  console.log(`Provisioned ${app.key} @ ${scopeType}:${scopeId} — entities(mb_incident,mb_watchword), lookups(4, 1 dynamic), form, flows(${scopeType === 'group' ? 3 : 2}), plugin.`);
}

// ── engage platform AI/moderation settings (moderator schema) ───────────────
async function engageModeration() {
  if (!ModeratorConfig) { console.log('Moderator schema not available — skipped AI/moderation settings.'); return; }
  try {
    await ModeratorConfig.setConfig('ai_moderation_enabled', true, 'ai_providers', null);
    await ModeratorConfig.setConfig('ai_auto_moderate', true, 'advanced', null);
    await ModeratorConfig.setConfig('toxicity_threshold', 70, 'thresholds', null);
    await ModeratorConfig.setConfig('modbot_engaged', { enabled: true, scopes: ['organization', 'group'] }, 'general', null);
    if (ModerationRule) {
      await ModerationRule.findOrCreate({
        where: { name: 'modbot-keyword-guard' },
        defaults: {
          name: 'modbot-keyword-guard',
          description: 'Moderator-bot banned-keyword guard (flags matching content for review).',
          appliesTo: ['post', 'comment', 'message'],
          sourceServices: ['timeline', 'spark'],
          conditions: { any: [{ field: 'content', op: 'keywords_any', value: BANNED }] },
          thresholdScore: 50,
          action: 'flag',
          enabled: true,
          priority: 10,
          metadata: { modbot: true },
        },
      });
    }
    console.log('Engaged AI/moderation settings: ai_moderation_enabled, ai_auto_moderate, toxicity_threshold + modbot-keyword-guard rule.');
  } catch (err) {
    console.log(`AI/moderation settings partially engaged (${err.message}).`);
  }
}

async function reset() {
  for (const suffix of ['org', 'group']) {
    const app = await LcApp.findOne({ where: { key: `modbot-${suffix}` } });
    if (app) {
      const ents = await LcEntity.findAll({ where: { appId: app.id }, attributes: ['id'] });
      const ids = ents.map((e) => e.id);
      if (ids.length) await LcRecord.destroy({ where: { entityId: { [Op.in]: ids } } });
      await LcFlow.destroy({ where: { appId: app.id } });
      await LcForm.destroy({ where: { appId: app.id } });
      await LcLookup.destroy({ where: { appId: app.id } });
      await LcEntity.destroy({ where: { appId: app.id } });
      await app.destroy();
    }
    try {
      const { Plugin, PluginInstallation, PluginVersion } = pluginsDb;
      const p = await Plugin.findOne({ where: { pluginKey: `modbot-guard-${suffix}` } });
      if (p) { await PluginInstallation.destroy({ where: { pluginId: p.id } }); await PluginVersion.destroy({ where: { pluginId: p.id } }); await p.destroy(); }
    } catch (_) { /* best-effort */ }
  }
  if (ModeratorConfig) {
    try {
      await ModeratorConfig.destroy({ where: { key: 'modbot_engaged' } });
      if (ModerationRule) await ModerationRule.destroy({ where: { name: 'modbot-keyword-guard' } });
    } catch (_) { /* best-effort */ }
  }
  console.log('Removed modbot-* apps, plugins, and modbot moderation settings.');
}

(async () => {
  try {
    await lc.sequelize.authenticate();
    if (process.env.NODE_ENV === 'development') { await pluginsDb.sequelize.sync(); await lc.sequelize.sync({ alter: true }); }
    if (process.env.MODBOT_RESET) { await reset(); process.exit(0); }
    await provisionModbot('organization', ORG_ID, 'org');
    await provisionModbot('group', GROUP_ID, 'group');
    await engageModeration();
    console.log('\nModerator bot provisioned at organization + group scope. View data in Organizations → Apps and the group Apps tab.');
    process.exit(0);
  } catch (err) {
    console.error('modbot seed failed:', err.stack || err.message);
    process.exit(1);
  }
})();
