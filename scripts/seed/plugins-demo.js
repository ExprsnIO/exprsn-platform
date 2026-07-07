'use strict';

/**
 * Plugin-system demo seeder — proves the framework end-to-end and shows how it
 * interacts with the rest of the platform (timeline events → hook bus →
 * declarative/script/webhook plugins → notifications/flags/deliveries →
 * moderator rules + workflows → low-code records).
 *
 * What it seeds (all keyed/prefixed `demo-` and idempotent):
 *
 *   4 PLUGINS — one per execution kind, at varied scopes/config/grants:
 *     1. demo-welcome-coach   declarative · scope=user   · nudges short posts
 *     2. demo-toxic-tripwire  declarative · scope=platform· nested match → moderator.flag
 *     3. demo-spam-sentry     webhook     · scope=platform· signed outbound to a scorer
 *     4. demo-hashtag-enricher script     · scope=platform· sandboxed JS derives tags
 *
 *   RULES + WORKFLOWS (moderator schema) the plugins feed into:
 *     - 3 moderation rules that act on what the tripwire/sentry surface
 *     - 3 workflows (moderator_config category 'workflows') documenting the
 *       plugin-integrated pipeline
 *
 *   LOW-CODE (shares the SAME hook bus, separate runtime):
 *     - app `demo-ops` + entity `incident` + flow `flag-to-incident` that
 *       subscribes to timeline.post.created and create_record's an incident.
 *
 * Usage:
 *   node scripts/seed/plugins-demo.js                 # seed everything (idempotent)
 *   SEED_DEMO_RESET=1 node scripts/seed/plugins-demo.js   # delete demo rows only
 *   SEED_DEMO_EMIT=1  node scripts/seed/plugins-demo.js   # also fire sample events
 *                                                          and print the deliveries
 *
 * Notes:
 *   - Run `npm run db:migrate` first so the plugins/lowcode schemas exist.
 *   - The `notify` and `webhook` actions call back through the gateway, so for a
 *     full live demo of those start the gateway (PLUGINS_ENABLED=true) and a
 *     plugins webhook worker; the in-process actions (match/flag/audit/script/
 *     create_record) are demonstrated without any network by SEED_DEMO_EMIT=1.
 */

const path = require('path');

require('./prod-guard');

const ROOT = path.resolve(__dirname, '..', '..');
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
// moderator's index transitively constructs a Stripe client at require time.
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_seed_dummy';
// Allow the in-process emit demo to dispatch (no effect on register/install).
process.env.PLUGINS_ENABLED = process.env.PLUGINS_ENABLED || 'true';
require('dotenv').config({ path: path.join(ROOT, '.env') });

const { Op } = require('sequelize');

// ── module wiring ────────────────────────────────────────────────────────────
const pluginsDb = require(path.join(ROOT, 'services/plugins/src/models'));
const lifecycle = require(path.join(ROOT, 'services/plugins/src/services/lifecycleService'));
const lowcodeDb = require(path.join(ROOT, 'services/lowcode/src/models'));
const modModels = require(path.join(ROOT, 'services/moderator/models/sequelize-index'));
const { ModerationRule, ModeratorConfig } = modModels;

let ruleEngine;
try { ruleEngine = require(path.join(ROOT, 'services/moderator/services/ruleEngineService')); } catch (_) { /* optional */ }

const {
  Plugin, PluginInstallation, PluginGrant, PluginDelivery, PluginVersion, PluginEndpoint, PluginTransition,
} = pluginsDb;
const { LcApp, LcEntity, LcRecord, LcForm, LcFlow } = lowcodeDb;

// Stable demo actor ids (shared with the moderation seed so consoles line up).
const U = {
  tester: '3182a6c6-dcbb-49bf-8773-9f6e6c4fae72',
  sv: 'f089f956-e08d-4ffa-be0b-9b0083e45c16',
};

// ─────────────────────────────────────────────────────────────────────────────
// 1) The four demonstration plugin manifests (one per execution kind).
// ─────────────────────────────────────────────────────────────────────────────
const PLUGINS = [
  {
    // DECLARATIVE · scope=user · reads timeline, emits a notification.
    manifest: {
      key: 'demo-welcome-coach',
      name: 'Welcome Coach',
      description: 'Nudges a user with a tip when they publish a very short post.',
      version: '1.0.0', publisher: 'exprsn-demo', kind: 'declarative',
      appliesTo: ['timeline'], events: ['timeline.post.created'],
      scopes: ['platform', 'user'],
      capabilities: ['read:timeline.posts', 'emit:notifications', 'emit:audit'],
      configSchema: { type: 'object', properties: { shortLen: { type: 'integer' } } },
      behavior: {
        // Fire only on short posts — shows multi-leaf AND + the length operator.
        match: { all: [{ field: 'post.content', op: 'exists' }, { field: 'post.content', op: 'length_lt', value: 40 }] },
        actions: [
          { type: 'notify', notificationType: 'tip', title: 'Tip: add a little more', body: 'Longer posts get more reach on Exprsn. Try adding a detail or a #hashtag.' },
          { type: 'audit', note: 'coached a short post' },
        ],
      },
      surfaces: [{ type: 'admin-section', id: 'demo-welcome-coach', title: 'Welcome Coach', path: '/admin/plugins/demo-welcome-coach' }],
    },
    install: { scopeType: 'user', scopeId: U.tester, config: { shortLen: 40 }, installedBy: U.tester },
  },
  {
    // DECLARATIVE · scope=platform · multi-module, nested boolean tree → moderator.flag.
    manifest: {
      key: 'demo-toxic-tripwire',
      name: 'Toxic Tripwire',
      description: 'Advisory flag when a post/message is abusive and not marked satire.',
      version: '1.1.0', publisher: 'exprsn-demo', kind: 'declarative',
      appliesTo: ['timeline', 'spark'], events: ['timeline.post.created', 'spark.message.created'],
      scopes: ['platform'],
      capabilities: ['read:timeline.posts', 'read:spark.messages', 'emit:moderator.flag', 'emit:audit'],
      behavior: {
        // (keyword OR regex) AND NOT satire — a nested all/any/none tree.
        match: {
          all: [
            { any: [
              { field: 'post.content', op: 'keywords_any', value: ['you idiot', 'kys', 'shut up loser'] },
              { field: 'post.content', op: 'matches', value: '\\b(moron|idiot)s?\\b' },
            ] },
            { none: [{ field: 'post.content', op: 'keywords_any', value: ['/satire', '/s'] }] },
          ],
        },
        actions: [
          { type: 'flag', reason: 'tripwire: abusive language (advisory — moderator decides)' },
          { type: 'audit', note: 'tripwire matched' },
        ],
      },
    },
    install: { scopeType: 'platform', scopeId: null, config: {}, installedBy: U.sv },
  },
  {
    // WEBHOOK · scope=platform · signed outbound delivery to an external scorer.
    manifest: {
      key: 'demo-spam-sentry',
      name: 'Spam Sentry',
      description: 'Posts new content to an external spam scorer over a signed webhook.',
      version: '1.0.0', publisher: 'exprsn-demo', kind: 'webhook',
      appliesTo: ['timeline'], events: ['timeline.post.created'],
      scopes: ['platform'],
      capabilities: ['read:timeline.posts', 'call:webhook'],
      endpoint: { url: 'https://hooks.exprsn.io/demo/spam-sentry', timeoutMs: 4000 },
      surfaces: [{ type: 'admin-section', id: 'demo-spam-sentry', title: 'Spam Sentry', path: '/admin/plugins/demo-spam-sentry' }],
    },
    install: { scopeType: 'platform', scopeId: null, config: {}, installedBy: U.sv },
  },
  {
    // SCRIPT · scope=platform · sandboxed JS derives hashtags; all I/O via the gateway.
    manifest: {
      key: 'demo-hashtag-enricher',
      name: 'Hashtag Enricher',
      description: 'Runs sandboxed JS to derive hashtags + length signal from a post.',
      version: '1.0.0', publisher: 'exprsn-demo', kind: 'script',
      appliesTo: ['timeline'], events: ['timeline.post.created'],
      scopes: ['platform'],
      capabilities: ['read:timeline.posts', 'emit:audit'],
      script: {
        source: [
          'const text = (ctx.post && ctx.post.content) || "";',
          'const tags = (text.match(/#[a-z0-9_]+/gi) || []).map(function (t) { return t.toLowerCase(); });',
          'platform.log("hashtag-enricher derived " + tags.length + " tag(s)");',
          'return { tags: tags, length: text.length };',
        ].join('\n'),
        timeoutMs: 1500, memoryMb: 32,
      },
    },
    install: { scopeType: 'platform', scopeId: null, config: {}, installedBy: U.sv },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 2) Moderator rules + workflows the plugins feed into (cross-module interaction).
// ─────────────────────────────────────────────────────────────────────────────
const RULES = [
  { name: 'demo-plugin:Tripwire abuse → require review', description: 'Content the Toxic Tripwire plugin flags is routed to human review.', action: 'require_review', priority: 65, appliesTo: ['post', 'comment', 'message'], conditions: { any: [{ keywords: ['you idiot', 'kys', 'shut up loser'] }, { regex: '\\b(moron|idiot)s?\\b' }] } },
  { name: 'demo-plugin:Spam-sentry score ≥ 80 → hide', description: 'Acts on the spam score Spam Sentry returns over its webhook.', action: 'hide', priority: 75, appliesTo: ['post'], conditions: { min_spam_score: 80 } },
  { name: 'demo-plugin:Verified exempt from plugin flags', description: 'Safeguard — verified partners are never auto-actioned by plugin signals.', action: 'approve', priority: 100, conditions: { keywords_list: 'brand_safe' }, metadata: { safeguard: true } },
];

const WORKFLOWS = [
  { id: 'wf-plugin-intake', name: 'Plugin intake pipeline', description: 'Hook-bus event → resolve scoped installs → run declarative/script/webhook → log delivery → route flags to moderator review.', enabled: true, trigger: 'event: timeline.post.created', steps: ['resolve_installs', 'run_plugins', 'log_deliveries', 'route_flags_to_review'], tags: ['plugins'] },
  { id: 'wf-webhook-spam-loop', name: 'Webhook spam loop', description: 'Spam Sentry delivery returns a score → apply the spam rule → hide or queue for review.', enabled: true, trigger: 'event: plugin.delivery.completed (spam-sentry)', steps: ['read_score', 'apply_spam_rule', 'hide_or_queue'], tags: ['plugins', 'webhook'] },
  { id: 'wf-lowcode-incident', name: 'Low-code incident capture', description: 'Same hook-bus event also drives the low-code flow flag-to-incident, creating an incident record (separate runtime, shared infra).', enabled: true, trigger: 'event: timeline.post.created', steps: ['lowcode_flow_match', 'create_incident_record'], tags: ['plugins', 'lowcode'] },
];

// ─────────────────────────────────────────────────────────────────────────────
// 3) Low-code app/entity/flow riding the SAME hook bus.
// ─────────────────────────────────────────────────────────────────────────────
const LC_APP = { key: 'demo-ops', name: 'Ops Console (demo)', description: 'Demonstrates the low-code runtime subscribing to the plugins hook bus.', status: 'published', createdBy: U.sv };
const LC_ENTITY = {
  key: 'incident', name: 'Incident',
  description: 'An incident auto-captured from a flagged post.',
  fields: [
    { key: 'title', label: 'Title', type: 'string', role: 'attribute', required: true },
    { key: 'source', label: 'Source', type: 'string', role: 'dimension' },
    { key: 'severity', label: 'Severity', type: 'enum', role: 'dimension', enumValues: ['low', 'medium', 'high'] },
    { key: 'status', label: 'Status', type: 'enum', role: 'dimension', enumValues: ['open', 'closed'] },
  ],
};
const LC_FLOW = {
  key: 'flag-to-incident', name: 'Flag → Incident',
  event: 'timeline.post.created',
  match: { field: 'post.content', op: 'keywords_any', value: ['you idiot', 'moron', 'kys'] },
  actions: [
    { type: 'create_record', entityKey: 'incident', data: { title: 'Auto-captured from flagged post', source: 'timeline', severity: 'medium', status: 'open' } },
    { type: 'audit', note: 'lowcode flag-to-incident fired' },
  ],
  scopeType: 'platform', enabled: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// cleanup (idempotent)
// ─────────────────────────────────────────────────────────────────────────────
async function cleanPlugins() {
  const keys = PLUGINS.map((p) => p.manifest.key);
  const rows = await Plugin.findAll({ where: { pluginKey: { [Op.in]: keys } }, attributes: ['id'] });
  const ids = rows.map((r) => r.id);
  if (ids.length) {
    const insts = await PluginInstallation.findAll({ where: { pluginId: { [Op.in]: ids } }, attributes: ['id'] });
    const instIds = insts.map((i) => i.id);
    if (instIds.length) {
      await PluginDelivery.destroy({ where: { installationId: { [Op.in]: instIds } } });
      await PluginGrant.destroy({ where: { installationId: { [Op.in]: instIds } } });
      await PluginTransition.destroy({ where: { installationId: { [Op.in]: instIds } } });
      await PluginEndpoint.destroy({ where: { installationId: { [Op.in]: instIds } } });
    }
    await PluginInstallation.destroy({ where: { pluginId: { [Op.in]: ids } } });
    await PluginVersion.destroy({ where: { pluginId: { [Op.in]: ids } } });
    await Plugin.destroy({ where: { id: { [Op.in]: ids } } });
  }
}

async function cleanLowcode() {
  const app = await LcApp.findOne({ where: { key: LC_APP.key } });
  if (app) {
    const ents = await LcEntity.findAll({ where: { appId: app.id }, attributes: ['id'] });
    const entIds = ents.map((e) => e.id);
    if (entIds.length) await LcRecord.destroy({ where: { entityId: { [Op.in]: entIds } } });
    await LcFlow.destroy({ where: { appId: app.id } });
    await LcForm.destroy({ where: { appId: app.id } });
    await LcEntity.destroy({ where: { appId: app.id } });
    await app.destroy();
  }
}

async function cleanModerator() {
  await ModerationRule.destroy({ where: { name: { [Op.in]: RULES.map((r) => r.name) } } });
  await ModeratorConfig.destroy({ where: { key: { [Op.in]: WORKFLOWS.map((w) => `workflow_${w.id.replace(/[^a-z0-9_]/gi, '_')}`) } } });
}

async function clean() {
  await cleanPlugins();
  await cleanLowcode();
  await cleanModerator();
}

// ─────────────────────────────────────────────────────────────────────────────
// optional live emit demo
// ─────────────────────────────────────────────────────────────────────────────
async function emitDemo() {
  const pluginHost = require(path.join(ROOT, 'services/plugins/src/services/pluginHost'));
  let flowEngine;
  try { flowEngine = require(path.join(ROOT, 'services/lowcode/src/services/flowEngine')); flowEngine.start(); } catch (_) { /* optional */ }

  const samples = [
    { label: 'normal post', ctx: { userId: U.tester, module: 'timeline', post: { userId: U.tester, content: 'Just shipped the plugin framework! #exprsn #plugins' } } },
    { label: 'short post (coach)', ctx: { userId: U.tester, module: 'timeline', post: { userId: U.tester, content: 'hi' } } },
    { label: 'abusive post (tripwire + lowcode)', ctx: { userId: U.tester, module: 'timeline', post: { userId: U.tester, content: 'you idiot, nobody cares' } } },
  ];

  console.log('\n── emitting sample timeline.post.created events ──');
  for (const s of samples) {
    console.log(`  • ${s.label}`);
    await pluginHost.emit('timeline.post.created', s.ctx);
  }
  // give best-effort async handlers a beat to record deliveries
  await new Promise((r) => setTimeout(r, 750));

  const instIds = (await PluginInstallation.findAll({
    include: [{ model: Plugin, as: 'plugin', where: { pluginKey: { [Op.in]: PLUGINS.map((p) => p.manifest.key) } }, attributes: [] }],
    attributes: ['id'],
  })).map((i) => i.id);
  const deliveries = await PluginDelivery.findAll({
    where: { installationId: { [Op.in]: instIds } },
    order: [['created_at', 'DESC']], limit: 12,
  });
  console.log('\n── recent plugin_deliveries ──');
  for (const d of deliveries) {
    const detail = d.matched === false ? 'no match'
      : (d.result && d.result.actions ? d.result.actions.map((a) => a.type + (a.error ? '!' : '')).join(',') : (d.kind));
    console.log(`  ${String(d.status).padEnd(9)} ${String(d.pluginKey || '').padEnd(22)} ${d.event}  [${detail}]`);
  }
  const incidents = await LcRecord.count();
  console.log(`\n── low-code: ${incidents} incident record(s) now exist (flag-to-incident via the shared bus) ──`);
}

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  await pluginsDb.sequelize.authenticate();
  // The plugins/lowcode schemas are newer; make sure their tables exist.
  await pluginsDb.sequelize.sync();
  await lowcodeDb.sequelize.sync();

  await clean();

  if (process.env.SEED_DEMO_RESET) {
    console.log('SEED_DEMO_RESET set — demo plugin/lowcode/rule data removed; skipping insert.');
    await closeAll();
    return;
  }

  // Plugins: register catalog entry → install at its scope (state-machine enables it).
  for (const p of PLUGINS) {
    await lifecycle.register(p.manifest, { source: 'registry' });
    await lifecycle.install({
      pluginKey: p.manifest.key,
      scopeType: p.install.scopeType,
      scopeId: p.install.scopeId,
      config: p.install.config,
      installedBy: p.install.installedBy,
    });
  }

  // Moderator rules + workflows.
  for (const r of RULES) {
    await ModerationRule.create({ enabled: true, ...r, metadata: { ...(r.metadata || {}), seedDemo: true, demoPlugins: true } });
  }
  for (const wf of WORKFLOWS) {
    await ModeratorConfig.setConfig(`workflow_${wf.id.replace(/[^a-z0-9_]/gi, '_')}`, wf, 'workflows', null);
  }
  if (ruleEngine && ruleEngine.clearWordListCache) ruleEngine.clearWordListCache();

  // Low-code app/entity/flow on the shared bus.
  const app = await LcApp.create(LC_APP);
  await LcEntity.create({ ...LC_ENTITY, appId: app.id });
  await LcFlow.create({ ...LC_FLOW, appId: app.id });

  console.log('Seeded plugin demo:');
  console.log(`  • ${PLUGINS.length} plugins (declarative/webhook/script) registered + installed`);
  PLUGINS.forEach((p) => console.log(`      - ${p.manifest.key.padEnd(22)} ${p.manifest.kind.padEnd(11)} scope=${p.install.scopeType}`));
  console.log(`  • ${RULES.length} moderator rules + ${WORKFLOWS.length} workflows wired to plugin signals`);
  console.log('  • low-code app demo-ops + entity incident + flow flag-to-incident (shared hook bus)');
  console.log('\nInteraction flow:');
  console.log('  timeline.post.created ─▶ pluginHost.emit ─▶ scopeResolver');
  console.log('     ├─ declarative welcome-coach  → emit:notifications (short posts)');
  console.log('     ├─ declarative toxic-tripwire → emit:moderator.flag → moderator rule "→ require review"');
  console.log('     ├─ webhook     spam-sentry    → signed delivery → score → rule "score≥80 → hide"');
  console.log('     ├─ script      hashtag-enricher (sandboxed JS) → tags');
  console.log('     └─ subscriber  lowcode flag-to-incident → create_record(incident)');
  console.log('\nTry it live:  SEED_DEMO_EMIT=1 node scripts/seed/plugins-demo.js');

  if (process.env.SEED_DEMO_EMIT) {
    try { await emitDemo(); } catch (err) { console.error('emit demo failed (non-fatal):', err.message); }
  }

  await closeAll();
}

async function closeAll() {
  await pluginsDb.sequelize.close().catch(() => {});
  try { await lowcodeDb.sequelize.close(); } catch (_) { /* may share the pool */ }
  try { await modModels.sequelize.close(); } catch (_) { /* may share the pool */ }
}

main().catch((err) => {
  console.error('plugins-demo seed failed:', err && err.message ? err.message : err);
  if (err && err.details) console.error(err.details);
  if (err && err.errors) console.error(err.errors.map((e) => e.message));
  process.exit(1);
});
