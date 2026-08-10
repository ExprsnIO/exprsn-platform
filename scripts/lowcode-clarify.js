#!/usr/bin/env node
'use strict';

/**
 * Exprsn Lowcode & Plugins — Clarification Console.
 *
 * A decision/clarification walker (NOT a scaffolder, NOT a launcher). It walks
 * the open questions that must be answered before building out lowcode
 * entities / lookups / flows, the user-facing SPA, Socket.IO micro-apps for
 * Nexus/Live/Spark, expanded platform interaction, and the remaining plugin
 * lifecycle. Every item is grounded in the real code — models, services and
 * feature flags under services/lowcode + services/plugins (see the map that
 * seeded it). Record a choice (+ optional note) per item; the answers persist
 * to a state JSON and export to a markdown brief the implementer can act on.
 *
 * Sibling to the existing consoles (same pure-Node readline+ANSI style, same
 * keybindings): `npm run lowcode` (spec builder), `npm run lowcode:bridge`
 * (wiring), `npm run plan:plugins` (architecture decisions).
 *
 *   node scripts/lowcode-clarify.js            # opens/creates ./lowcode-clarify.state.json
 *   node scripts/lowcode-clarify.js my.json    # use a specific state file
 *   node scripts/lowcode-clarify.js --export    # headless: (re)write docs/plans/lowcode-clarifications.md and exit
 *
 * Keys: ↑/↓ move · Enter select · Space toggle (multi) · Esc back · Ctrl-C quit.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ─────────────────────────────── ANSI ──────────────────────────────────────
const E = '\x1b[';
const c = {
  reset: E + '0m', bold: E + '1m', dim: E + '2m', inverse: E + '7m',
  red: E + '31m', green: E + '32m', yellow: E + '33m', blue: E + '34m',
  magenta: E + '35m', cyan: E + '36m', white: E + '37m', gray: E + '90m',
};
const W = 72;
const clear = () => process.stdout.write(E + '2J' + E + 'H');
const out = (s) => process.stdout.write(s);

function strip(s) { return String(s).replace(/\x1b\[[0-9;]*m/g, ''); }
function pad(s, n) { const l = strip(s).length; return s + ' '.repeat(Math.max(0, n - l)); }
function trunc(s, n) {
  const raw = strip(s);
  if (raw.length <= n) return s;
  return raw.slice(0, n - 1) + '…';
}
function center(s, n) {
  const l = strip(s).length;
  const left = Math.max(0, Math.floor((n - l) / 2));
  const right = Math.max(0, n - l - left);
  return ' '.repeat(left) + s + ' '.repeat(right);
}
function wrap(s, n) {
  const words = String(s).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > n) { if (line) lines.push(line); line = w; }
    else line = (line ? line + ' ' : '') + w;
  }
  if (line) lines.push(line);
  return lines;
}

function header(sub) {
  const line = '═'.repeat(W);
  out(c.cyan + c.bold + '╔' + line + '╗\n');
  out('║' + center('◆  EXPRSN LOWCODE & PLUGINS — CLARIFICATION CONSOLE  ◆', W) + '║\n');
  out('╚' + line + '╝' + c.reset + '\n');
  if (sub) out('  ' + c.dim + sub + c.reset + '\n');
  out('\n');
}

// ─────────────────────────── input primitives ──────────────────────────────
function onCtrlC(key) { if (key && key.ctrl && key.name === 'c') { exitApp(0); } }

/** Scrollable single-choice menu. Resolves to selected index, or -1 on Esc. */
function selectMenu(title, items, footer) {
  const norm = items.map((it) => (typeof it === 'string' ? { label: it } : it));
  return new Promise((resolve) => {
    let idx = 0;
    while (norm[idx] && norm[idx].separator) idx = (idx + 1) % norm.length;
    const render = () => {
      clear();
      header(title);
      norm.forEach((it, i) => {
        if (it.separator) { out('  ' + c.gray + (it.label || '─'.repeat(24)) + c.reset + '\n'); return; }
        const active = i === idx;
        const cursor = active ? c.cyan + '❯ ' : '  ';
        const label = active ? c.bold + c.white + it.label + c.reset : it.label;
        out('  ' + cursor + label + c.reset);
        if (it.hint) out('  ' + c.dim + trunc(it.hint, W - strip(it.label).length - 8) + c.reset);
        out('\n');
        if (active && it.sub) it.sub.forEach((s) => out('      ' + c.dim + trunc(s, W - 6) + c.reset + '\n'));
      });
      out('\n' + c.dim + '  ↑/↓ move · Enter select · Esc back · Ctrl-C quit' + c.reset);
      if (footer) out('\n' + c.dim + '  ' + footer + c.reset);
    };
    const step = (dir) => {
      do { idx = (idx + dir + norm.length) % norm.length; } while (norm[idx] && norm[idx].separator);
      render();
    };
    const onKey = (str, key) => {
      onCtrlC(key);
      if (key.name === 'up') step(-1);
      else if (key.name === 'down') step(1);
      else if (key.name === 'return') { if (!norm[idx].separator) { cleanup(); resolve(idx); } }
      else if (key.name === 'escape') { cleanup(); resolve(-1); }
    };
    const cleanup = () => process.stdin.removeListener('keypress', onKey);
    process.stdin.on('keypress', onKey);
    render();
  });
}

/**
 * Multi-select checkbox menu over `options` (array of {label, hint, sub}).
 * `selected` is a Set of indices, mutated live. Resolves true on Enter (commit),
 * false on Esc (cancel). Space toggles the highlighted row.
 */
function checkboxMenu(title, options, selected, footer) {
  return new Promise((resolve) => {
    let idx = 0;
    const render = () => {
      clear();
      header(title);
      options.forEach((it, i) => {
        const active = i === idx;
        const cursor = active ? c.cyan + '❯ ' : '  ';
        const box = selected.has(i) ? c.green + '◉' + c.reset : c.gray + '○' + c.reset;
        const label = active ? c.bold + c.white + it.label + c.reset : it.label;
        out('  ' + cursor + box + ' ' + label + c.reset);
        if (it.hint) out('  ' + c.dim + trunc(it.hint, W - strip(it.label).length - 10) + c.reset);
        out('\n');
        if (active && it.sub) it.sub.forEach((s) => out('        ' + c.dim + trunc(s, W - 8) + c.reset + '\n'));
      });
      out('\n' + c.dim + '  ↑/↓ move · Space toggle · Enter commit · Esc cancel' + c.reset);
      if (footer) out('\n' + c.dim + '  ' + footer + c.reset);
    };
    const onKey = (str, key) => {
      onCtrlC(key);
      if (key.name === 'up') { idx = (idx - 1 + options.length) % options.length; render(); }
      else if (key.name === 'down') { idx = (idx + 1) % options.length; render(); }
      else if (key.name === 'space') { if (selected.has(idx)) selected.delete(idx); else selected.add(idx); render(); }
      else if (key.name === 'return') { cleanup(); resolve(true); }
      else if (key.name === 'escape') { cleanup(); resolve(false); }
    };
    const cleanup = () => process.stdin.removeListener('keypress', onKey);
    process.stdin.on('keypress', onKey);
    render();
  });
}

/** Free-text line editor. Resolves to string, or null on Esc. */
function textInput(label, initial = '', hint) {
  return new Promise((resolve) => {
    let buf = String(initial || '');
    const render = () => {
      clear();
      header('Note');
      out('  ' + c.cyan + label + c.reset + '\n');
      if (hint) out('  ' + c.dim + hint + c.reset + '\n');
      out('\n  ' + c.green + '❯ ' + c.reset + buf + c.inverse + ' ' + c.reset + '\n');
      out('\n' + c.dim + '  Enter save · Esc cancel · Backspace delete' + c.reset);
    };
    const onKey = (str, key) => {
      onCtrlC(key);
      if (key.name === 'return') { cleanup(); resolve(buf.trim()); }
      else if (key.name === 'escape') { cleanup(); resolve(null); }
      else if (key.name === 'backspace') { buf = buf.slice(0, -1); render(); }
      else if (str && str.length === 1 && str >= ' ') { buf += str; render(); }
    };
    const cleanup = () => process.stdin.removeListener('keypress', onKey);
    process.stdin.on('keypress', onKey);
    render();
  });
}

async function confirm(question) {
  const i = await selectMenu(question, ['Yes', 'No']);
  return i === 0;
}
async function toast(msg) { await selectMenu(msg, [c.green + 'OK' + c.reset]); }

// ────────────────────────────── content model ──────────────────────────────
// Categories → items. Each item is one clarification. `multi:true` means the
// answer is a set of options (checkbox); otherwise it's a single pick. Every
// option carries a short `note` (the trade-off) and one is flagged `rec` — the
// recommendation grounded in the current code + MVP posture. `ground` cites the
// real file(s)/model(s) so an answer maps straight onto an implementation site.

const CATEGORIES = [
  {
    key: 'scope', title: 'Scope & sequencing', icon: '◇',
    blurb: 'What we tackle first, and which feature flags flip on for this pass.',
    items: [
      {
        id: 'scope.primary',
        q: 'Primary track for this pass?',
        ground: 'All modules built + flag-gated; nothing runtime-enabled yet.',
        options: [
          { label: 'Entities/lookups/flows end-to-end', note: 'Make the runtime real + usable before surfacing it', rec: true },
          { label: 'User-facing SPA', note: 'Grids/forms for end-users, not just admin' },
          { label: 'Socket.IO micro-apps', note: 'Realtime lowcode apps in Nexus/Live/Spark' },
          { label: 'Platform emit points', note: 'Wire more module events into the hook bus' },
          { label: 'Finish plugin lifecycle', note: 'Webhook worker, identity, grants (Phase 2/3)' },
        ],
      },
      {
        id: 'scope.flags', multi: true,
        q: 'Which feature flags flip ON for the target (dev/staging) this pass?',
        ground: 'All default false: LOWCODE_ENABLED, PLUGINS_ENABLED, PLUGINS_SCRIPT_ENABLED, PLUGINS_WEBHOOK_ALLOW_PRIVATE.',
        options: [
          { label: 'LOWCODE_ENABLED', note: 'flowEngine subscribes to the hook bus', rec: true },
          { label: 'PLUGINS_ENABLED', note: 'hook bus dispatches + builtins seed', rec: true },
          { label: 'PLUGINS_SCRIPT_ENABLED', note: 'sandboxed JS (highest risk) — usually leave off' },
          { label: 'PLUGINS_WEBHOOK_ALLOW_PRIVATE', note: 'dev-only SSRF allowlist for loopback webhooks' },
        ],
      },
      {
        id: 'scope.also', multi: true,
        q: 'Which other tracks are in scope this pass (beyond the primary)?',
        options: [
          { label: 'Entities/lookups/flows end-to-end' },
          { label: 'User-facing SPA' },
          { label: 'Socket.IO micro-apps' },
          { label: 'Platform emit points' },
          { label: 'Finish plugin lifecycle' },
        ],
      },
    ],
  },
  {
    key: 'ent', title: 'Entities', icon: '▤',
    blurb: 'How typed records are stored, related, owned, and evolved (LcEntity/LcRecord).',
    items: [
      {
        id: 'ent.persistence',
        q: 'How should entity records be physically stored?',
        ground: 'Today: one lc_records table, values in a single JSONB `data` column, keyed by field.key.',
        options: [
          { label: 'Keep single JSONB table', note: 'Flexible, zero DDL; no per-field SQL indexes', rec: true },
          { label: 'Table-per-entity (DDL)', note: 'Real columns/indexes/FKs; needs schema generation + migration' },
          { label: 'Hybrid (JSONB + generated cols)', note: 'JSONB source of truth; index dimensions via expression/generated columns' },
        ],
      },
      {
        id: 'ent.references',
        q: 'How are `reference`-type fields (refEntity) enforced?',
        ground: "typeSystem supports `reference` + refEntity; nothing validates the target exists.",
        options: [
          { label: 'Validate existence on write', note: 'Reject dangling refs; no cascade', rec: true },
          { label: 'Soft reference (store id only)', note: 'Cheapest; no integrity guarantee' },
          { label: 'Real FK (needs table-per-entity)', note: 'DB-enforced; cascade rules; ties to persistence choice' },
        ],
      },
      {
        id: 'ent.ownership',
        q: 'Default data visibility / ownership model for records?',
        ground: 'LcRecord has ownerId; records API is requireUser but not scoped.',
        options: [
          { label: 'Scope like flows (platform/org/group/user)', note: 'Reuse scopeResolver precedent; per-entity scopeType', rec: true },
          { label: 'Owner-only + admin', note: 'Simple row-level: creator sees own rows' },
          { label: 'App-wide (all authed users)', note: 'Shared dataset, no row filtering' },
          { label: 'Per-entity configurable', note: 'Entity declares its visibility policy' },
        ],
      },
      {
        id: 'ent.evolution',
        q: 'When an entity’s field defs change, what happens to existing records?',
        ground: 'Entity.fields is JSONB; records validated at write only.',
        options: [
          { label: 'Tolerant lazy read (no migration)', note: 'Read old rows best-effort; validate on next write', rec: true },
          { label: 'Eager backfill/migrate', note: 'Rewrite rows to new shape on publish' },
          { label: 'Versioned entities', note: 'Records pinned to an entity version; migrate opt-in' },
        ],
      },
      {
        id: 'ent.uniqueness',
        q: 'How is field uniqueness enforced?',
        ground: 'entityService.checkUnique scans rows in JS per write.',
        options: [
          { label: 'DB unique index on JSONB expression', note: 'Correct under concurrency; needs index mgmt', rec: true },
          { label: 'Keep JS-level check', note: 'Simple; racy under concurrent writes' },
        ],
      },
    ],
  },
  {
    key: 'look', title: 'Lookups', icon: '▦',
    blurb: 'Reusable enum sources for entity fields (LcLookup).',
    items: [
      {
        id: 'look.source',
        q: 'What can a lookup be sourced from?',
        ground: 'Today: static JSONB values [{value,label,color,order}].',
        options: [
          { label: 'Static + dynamic providers', note: 'Keep static; add platform-data-backed lookups', rec: true },
          { label: 'Static only (current)', note: 'Hand-authored lists; no live platform data' },
          { label: 'Dynamic only', note: 'Always resolved from a provider' },
        ],
      },
      {
        id: 'look.providers', multi: true,
        q: 'Which dynamic lookup providers should exist?',
        ground: 'Requires read into other modules — capability-gated.',
        options: [
          { label: 'Platform users', note: 'auth/CA directory' },
          { label: 'Nexus groups', note: 'group picker' },
          { label: 'Timeline hashtags/topics', note: 'trending/known topics' },
          { label: 'Spark conversations', note: 'DM/thread targets' },
          { label: 'Live rooms', note: 'active rooms' },
          { label: 'FileVault files', note: 'file references' },
        ],
      },
      {
        id: 'look.scope',
        q: 'What scope can a lookup be shared at?',
        ground: 'LcLookup is app-scoped (appId, key unique per app).',
        options: [
          { label: 'App-scoped + platform-global', note: 'Allow shared platform lookups reused across apps', rec: true },
          { label: 'App-scoped only (current)', note: 'No cross-app reuse' },
          { label: 'Add org/group scope', note: 'Tenant-specific lists; needs org RBAC' },
        ],
      },
    ],
  },
  {
    key: 'flow', title: 'Flows', icon: '⇄',
    blurb: 'Trigger → condition → action automation (LcFlow / flowEngine on the shared hook bus).',
    items: [
      {
        id: 'flow.triggers', multi: true,
        q: 'Which events should flows be able to trigger on?',
        ground: 'Registered in events.js; emit sites must exist. Today: timeline.post.created + lowcode.record.created/updated only.',
        options: [
          { label: 'lowcode.record.* (exists)', note: 'record created/updated already emit', rec: true },
          { label: 'timeline.post.created (exists)', note: 'emit site present in posts.js', rec: true },
          { label: 'spark.message.created', note: 'new emit site in spark' },
          { label: 'moderator.content.flagged / verdict', note: 'moderation pipeline hook' },
          { label: 'live.room.* (created/joined)', note: 'live room lifecycle' },
          { label: 'nexus.group.* (member/post)', note: 'group activity' },
          { label: 'filevault.file.uploaded', note: 'file events' },
          { label: 'auth.user.registered', note: 'onboarding flows' },
        ],
      },
      {
        id: 'flow.actions', multi: true,
        q: 'Which write-back actions can a flow perform?',
        ground: 'Today: create_record (native) + plugin actions log/audit/notify/flag/webhook. New actions need capability + emit into target module.',
        options: [
          { label: 'create_record (exists)', note: 'lowcode-native', rec: true },
          { label: 'notify (exists)', note: 'in-app notification via emit:notifications', rec: true },
          { label: 'moderator flag (exists)', note: 'advisory flag', rec: true },
          { label: 'webhook (exists)', note: 'signed outbound' },
          { label: 'post to timeline', note: 'capability: write timeline' },
          { label: 'send spark message', note: 'capability: write spark' },
          { label: 'set/transition record state', note: 'drive entity state machine' },
          { label: 'emit to socket room', note: 'push to a Socket.IO micro-app (see RT track)' },
          { label: 'generic HTTP call', note: 'arbitrary outbound (SSRF-guarded)' },
        ],
      },
      {
        id: 'flow.execution',
        q: 'Execution model for flow actions?',
        ground: 'flowEngine runs synchronously, best-effort, in-process on the hook bus (never throws).',
        options: [
          { label: 'Keep sync in-process best-effort', note: 'Simplest; matches MVP single-gateway', rec: true },
          { label: 'Durable Bull-queued worker:lowcode', note: 'Retries + audit; new worker like worker:timeline' },
          { label: 'Hybrid', note: 'Sync for light actions, queue for external/heavy' },
        ],
      },
      {
        id: 'flow.scheduling',
        q: 'Do flows support scheduled/timed triggers?',
        ground: 'No scheduler today; triggers are event-driven only.',
        options: [
          { label: 'Event-driven only (for now)', note: 'Defer cron; smallest surface', rec: true },
          { label: 'Add cron/interval triggers', note: 'Scheduled flows via a timer worker' },
          { label: 'Add delayed/timer actions too', note: 'Wait N then act; needs durable queue' },
        ],
      },
      {
        id: 'flow.steps',
        q: 'Flow shape — single-shot vs multi-step?',
        ground: 'runFlow runs a flat list of actions; stateMachine engine exists but flows don’t use waits.',
        options: [
          { label: 'Single-shot action list', note: 'Fire actions in order, done', rec: true },
          { label: 'Multi-step with waits/approval', note: 'Human-in-loop / state waits via stateMachine' },
        ],
      },
      {
        id: 'flow.runlog',
        q: 'Where are flow runs logged?',
        ground: 'plugin_deliveries already logs declarative/plugin dispatch.',
        options: [
          { label: 'Reuse plugin_deliveries', note: 'One audit surface for bus dispatch', rec: true },
          { label: 'Separate lc_flow_runs table', note: 'Flow-specific columns/reporting' },
        ],
      },
    ],
  },
  {
    key: 'plat', title: 'Platform interaction', icon: '⧉',
    blurb: 'How lowcode/plugins reach into the rest of the platform (emit points, capabilities, surfaces).',
    items: [
      {
        id: 'plat.emit',
        q: 'How aggressively do we instrument emit points now?',
        ground: 'Only timeline.post.created + lowcode.record.* emit today; add via events.js + a pluginHost.emit call at the site.',
        options: [
          { label: 'Broad (major modules)', note: 'Wire spark/moderator/live/nexus so flows have real triggers', rec: true },
          { label: 'Minimal (spark + moderator)', note: 'Two high-value adds only' },
          { label: 'Only what the chosen flows need', note: 'Demand-driven instrumentation' },
        ],
      },
      {
        id: 'plat.capabilities',
        q: 'Capability vocabulary — extend or hold?',
        ground: 'Closed vocab in capabilities.js is the core trust control; write-back actions need matching caps.',
        options: [
          { label: 'Extend for chosen write-back actions', note: 'Add exactly the caps the new actions require', rec: true },
          { label: 'Hold as-is', note: 'Only reuse existing emit:* caps' },
          { label: 'Add per-module read caps too', note: 'For dynamic lookups reading modules' },
        ],
      },
      {
        id: 'plat.surfaces',
        q: 'Which SPA surfaces can lowcode/plugins contribute?',
        ground: 'surfaces feed supports admin-section/widget/menu-item; SPA renders known types.',
        options: [
          { label: 'Admin sections + user menu items/pages', note: 'Let apps appear in user nav, not just admin', rec: true },
          { label: 'Admin sections only (current)', note: 'Stay admin-facing' },
          { label: 'Add dashboards/analytics widgets', note: 'Use dimension/measure aggregations' },
        ],
      },
    ],
  },
  {
    key: 'spa', title: 'User-facing SPA', icon: '▶',
    blurb: 'Where and how end-users (not admins) use lowcode apps in web/.',
    items: [
      {
        id: 'spa.entry', multi: true,
        q: 'Where do end-users reach lowcode apps?',
        ground: 'Only admin sections exist today (LowcodeSection.tsx). Nexus/Live/Spark have their own feature areas.',
        options: [
          { label: 'Standalone /apps route', note: 'Dedicated app launcher in the SPA', rec: true },
          { label: 'Embedded in Groups (Nexus)', note: 'App tab inside a group' },
          { label: 'Embedded in Live rooms', note: 'App panel in a room' },
          { label: 'Embedded in Spark', note: 'App inside a conversation' },
          { label: 'Admin-only (no user UI yet)', note: 'Defer user surface' },
        ],
      },
      {
        id: 'spa.rendering',
        q: 'How are user forms/grids rendered?',
        ground: 'LcForm.layout ({sections:[{title,fields}]}) already models forms; nothing renders them for users.',
        options: [
          { label: 'Auto-generate from entity + form defs', note: 'Metadata-driven runtime; no per-app React', rec: true },
          { label: 'Hand-built React per app', note: 'Maximum control, most work' },
          { label: 'Generated default + override hook', note: 'Auto by default, custom where needed' },
        ],
      },
      {
        id: 'spa.grid',
        q: 'Data-grid capability for users?',
        ground: 'Entity fields carry role (dimension/measure) + aggregation for BI-style views.',
        options: [
          { label: 'Filter/sort/aggregate', note: 'Use dimension/measure/aggregation metadata', rec: true },
          { label: 'Basic list/create/edit', note: 'CRUD only' },
          { label: 'Full pivots/charts (BI)', note: 'Heaviest; charting stack' },
        ],
      },
      {
        id: 'spa.permissions',
        q: 'Who can see/use an app in the SPA?',
        ground: 'LcApp has status draft/published; no per-app access control yet.',
        options: [
          { label: 'Per-app role/scope gating', note: 'App declares who can run it; ties to ent.ownership', rec: true },
          { label: 'Any authenticated user', note: 'Published apps open to all' },
          { label: 'Platform-admin only', note: 'Keep locked down' },
        ],
      },
    ],
  },
  {
    key: 'rt', title: 'Socket.IO micro-apps', icon: '⚡',
    blurb: 'Realtime lowcode apps embedded in Nexus/Live/Spark (new track). Gateway has one Socket.IO server; modules attach namespaces via registry socketNs (lowcode is null today).',
    items: [
      {
        id: 'rt.model',
        q: 'How do lowcode apps get a realtime channel?',
        ground: 'Single io server (path /socket.io); nexus/live/spark own namespaces; lowcode socketNs=null.',
        options: [
          { label: 'One /lowcode namespace, per-app rooms', note: 'Add socketNs; room = app+scope; simplest to secure', rec: true },
          { label: 'Dynamic namespace per app (/lowcode/:app)', note: 'Isolation per app; more moving parts' },
          { label: 'Embed events in host namespaces', note: 'Nexus/Live/Spark socket carries app events' },
          { label: 'No socket — SSE/poll', note: 'Avoid sockets entirely' },
        ],
      },
      {
        id: 'rt.hosts', multi: true,
        q: 'Which host surfaces run socket micro-apps?',
        options: [
          { label: 'Nexus (groups)', note: 'group-scoped realtime app', rec: true },
          { label: 'Live (rooms)', note: 'room-scoped realtime app', rec: true },
          { label: 'Spark (conversations)', note: 'conversation-scoped app' },
          { label: 'Standalone (/apps)', note: 'no host module' },
        ],
      },
      {
        id: 'rt.features', multi: true,
        q: 'Which realtime features do micro-apps get?',
        ground: 'record.* already emit on the bus — a socket bridge can fan them out.',
        options: [
          { label: 'Live record subscriptions', note: 'push record.created/updated to viewers', rec: true },
          { label: 'Presence (who’s viewing)', note: 'join/leave roster per app room' },
          { label: 'Custom app events', note: 'flow action → socket broadcast' },
          { label: 'Live aggregations/dashboards', note: 'push recomputed measures' },
          { label: 'Typing/cursors', note: 'ephemeral collaboration signals' },
          { label: 'Collaborative editing (CRDT)', note: 'heaviest; shared doc state' },
        ],
      },
      {
        id: 'rt.auth',
        q: 'How are socket connections authorized?',
        ground: 'Platform per-namespace socket auth uses CA token (spark/timeline precedent).',
        options: [
          { label: 'CA token + per-room membership gate', note: 'Authed session, then group/room/scope check on join', rec: true },
          { label: 'CA token only (any authed user)', note: 'Namespace auth, no per-app gate' },
          { label: 'Host membership only', note: 'Delegate to Nexus/Live room membership' },
        ],
      },
      {
        id: 'rt.direction',
        q: 'Can clients push events (bidirectional) or read-only?',
        ground: 'flowEngine could gain an emit:socket action; inbound client events could trigger flows.',
        options: [
          { label: 'Read-only mirror + flow-driven emits', note: 'Server pushes; clients don’t write directly', rec: true },
          { label: 'Bidirectional (client events → flows)', note: 'Clients emit; validated events trigger flows' },
        ],
      },
      {
        id: 'rt.scaling',
        q: 'Scaling model for socket rooms?',
        ground: 'MVP is single-gateway (spark redis-adapter ownership deferred, STATUS #3).',
        options: [
          { label: 'Single-instance in-memory rooms', note: 'Matches MVP; no redis-adapter', rec: true },
          { label: 'Redis-adapter multi-instance', note: 'Horizontal scale; deferred infra work' },
        ],
      },
    ],
  },
  {
    key: 'plug', title: 'Plugin lifecycle finish', icon: '⚙',
    blurb: 'Remaining plugin work (Phase 2/3): webhook worker, identity, grants, moderator refactor, surfaces.',
    items: [
      {
        id: 'plug.worker',
        q: 'Webhook delivery — worker or inline?',
        ground: 'webhookDispatcher does signed delivery + retry + breaker inline; plan calls for Bull worker:plugins.',
        options: [
          { label: 'Build worker:plugins (Bull)', note: 'Off-request durable delivery like worker:timeline', rec: true },
          { label: 'Keep inline dispatch (current)', note: 'Simpler; delivery on the request path' },
          { label: 'Defer webhooks entirely', note: 'Declarative/script only for now' },
        ],
      },
      {
        id: 'plug.identity',
        q: 'Plugin identity / tokens?',
        ground: 'MVP uses derived HMAC plugin:<key>; CA cert deferred (Token needs certificateId).',
        options: [
          { label: 'Stay on HMAC plugin:<key>', note: 'MVP posture; no CA cert needed', rec: true },
          { label: 'Synthetic plugin CA cert', note: 'Real-ish identity without full CA issuance' },
          { label: 'CA-issued tokens + revocation', note: 'Strongest; most work' },
        ],
      },
      {
        id: 'plug.grants',
        q: 'Capability grant enforcement?',
        ground: 'PluginGrant rows exist; callback routes check capabilities.',
        options: [
          { label: 'Enforce grants on actions/callbacks now', note: '403 beyond granted caps', rec: true },
          { label: 'Advisory only for MVP', note: 'Log but don’t block' },
        ],
      },
      {
        id: 'plug.moderator',
        q: 'Refactor moderator onto the plugin framework (Phase 1.5)?',
        ground: 'As-built decision left moderator untouched; plan suggests refactoring one rule to validate the model.',
        options: [
          { label: 'Skip — keep moderator separate', note: 'Matches as-built; least risk', rec: true },
          { label: 'Refactor one rule as validation', note: 'Proves the model; touches moderation pipeline' },
        ],
      },
    ],
  },
];

// ─────────────────────────────── state I/O ─────────────────────────────────
const STATE_FILE = path.resolve(process.cwd(), process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'lowcode-clarify.state.json');
const BRIEF_DOC = path.resolve(process.cwd(), 'docs', 'plans', 'lowcode-clarifications.md');

let state = blankState();
function blankState() { return { version: 1, updatedAt: null, answers: {} }; }
function load() {
  try {
    if (fs.existsSync(STATE_FILE)) state = Object.assign(blankState(), JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')));
  } catch (e) { /* start fresh on parse error */ }
}
function save() { state.updatedAt = new Date().toISOString(); fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8'); }

const ALL_ITEMS = CATEGORIES.flatMap((cat) => cat.items.map((it) => ({ cat, it })));
function ans(id) { return state.answers[id]; }
function isAnswered(it) {
  const a = ans(it.id);
  if (!a) return false;
  return it.multi ? Array.isArray(a.choice) && a.choice.length > 0 : typeof a.choice === 'number' && a.choice >= 0;
}
function answerLabel(it) {
  const a = ans(it.id);
  if (!isAnswered(it)) return c.yellow + 'unanswered' + c.reset;
  if (it.multi) return c.green + a.choice.map((i) => it.options[i] && it.options[i].label).filter(Boolean).join(', ') + c.reset;
  return c.green + (it.options[a.choice] ? it.options[a.choice].label : '?') + c.reset;
}
function catOpen(cat) { return cat.items.filter((it) => !isAnswered(it)).length; }

// ─────────────────────────────── screens ───────────────────────────────────
async function itemScreen(cat, it) {
  while (true) {
    const a = ans(it.id) || {};
    const chosen = it.multi ? new Set(Array.isArray(a.choice) ? a.choice : []) : a.choice;
    // Build the info block shown above the options.
    const info = [];
    wrap(it.q, W - 4).forEach((l) => info.push(c.bold + c.white + l + c.reset));
    if (it.ground) { info.push(''); wrap('Now: ' + it.ground, W - 4).forEach((l) => info.push(c.dim + l + c.reset)); }

    if (it.multi) {
      const options = it.options.map((o) => ({
        label: o.label + (o.rec ? c.green + '  ★' + c.reset : ''),
        hint: o.note,
      }));
      clear(); header(cat.title + '  ›  multi-select'); info.forEach((l) => out('  ' + l + '\n')); out('\n');
      // brief pause of layout: render checkbox menu (it clears + re-headers itself)
      const set = new Set(chosen);
      const committed = await checkboxMenu(cat.title + '  ›  ' + trunc(it.q, 40), options, set,
        'Recommended ★ · your picks are saved on commit');
      if (committed) {
        state.answers[it.id] = { choice: Array.from(set).sort((x, y) => x - y), note: (a.note || ''), at: new Date().toISOString() };
      }
      // after commit/cancel, offer note edit / back
      const post = await selectMenu(cat.title + '  ›  ' + trunc(it.q, 40),
        [answerRow(it), { separator: true }, '✎ Edit note' + (a.note ? c.dim + '  (' + trunc(a.note, 30) + ')' + c.reset : ''), 'Clear answer', 'Back']);
      if (post === 2) { const n = await textInput('Note for: ' + it.q, (ans(it.id) || {}).note || ''); if (n !== null && ans(it.id)) { state.answers[it.id].note = n; } }
      else if (post === 3) { delete state.answers[it.id]; }
      else return; // Back or Esc
      continue;
    }

    // single-select
    const rows = it.options.map((o, i) => ({
      label: (i === chosen ? c.green + '● ' + c.reset : '  ') + o.label + (o.rec ? c.green + '  ★' + c.reset : ''),
      hint: o.note,
    }));
    rows.push({ separator: true });
    rows.push({ label: '✎ Edit note' + (a.note ? c.dim + '  (' + trunc(a.note, 30) + ')' + c.reset : '') });
    rows.push({ label: 'Clear answer' });
    rows.push({ label: 'Back' });

    clear();
    // We render info manually then a plain menu below would double-clear; instead
    // fold the info into the menu title area via a detail header line.
    const sub = it.ground ? 'Now: ' + trunc(it.ground, W - 8) : undefined;
    const pick = await selectMenuWithInfo(cat.title + '  ›  choose one', info, rows, sub);
    if (pick === -1) return;
    if (pick < it.options.length) {
      state.answers[it.id] = { choice: pick, note: (a.note || ''), at: new Date().toISOString() };
    } else if (pick === it.options.length + 1) { // Edit note
      const n = await textInput('Note for: ' + it.q, a.note || '');
      if (n !== null) state.answers[it.id] = { choice: (a.choice != null ? a.choice : -1), note: n, at: new Date().toISOString() };
    } else if (pick === it.options.length + 2) { // Clear
      delete state.answers[it.id];
    } else { return; } // Back
  }
}

function answerRow(it) { return 'Current: ' + strip(answerLabel(it)); }

/** selectMenu variant that prints an info block above the choices. */
function selectMenuWithInfo(title, infoLines, items, footer) {
  const norm = items.map((x) => (typeof x === 'string' ? { label: x } : x));
  return new Promise((resolve) => {
    let idx = 0;
    while (norm[idx] && norm[idx].separator) idx = (idx + 1) % norm.length;
    const render = () => {
      clear(); header(title);
      infoLines.forEach((l) => out('  ' + l + '\n'));
      out('\n');
      norm.forEach((it, i) => {
        if (it.separator) { out('  ' + c.gray + '─'.repeat(28) + c.reset + '\n'); return; }
        const active = i === idx;
        out('  ' + (active ? c.cyan + '❯ ' : '  ') + (active ? c.bold + c.white + it.label + c.reset : it.label) + c.reset);
        if (it.hint) out('  ' + c.dim + trunc(it.hint, W - strip(it.label).length - 8) + c.reset);
        out('\n');
      });
      out('\n' + c.dim + '  ↑/↓ move · Enter select · Esc back' + c.reset);
      if (footer) out('\n' + c.dim + '  ' + footer + c.reset);
    };
    const step = (d) => { do { idx = (idx + d + norm.length) % norm.length; } while (norm[idx] && norm[idx].separator); render(); };
    const onKey = (str, key) => {
      onCtrlC(key);
      if (key.name === 'up') step(-1);
      else if (key.name === 'down') step(1);
      else if (key.name === 'return') { if (!norm[idx].separator) { cleanup(); resolve(idx); } }
      else if (key.name === 'escape') { cleanup(); resolve(-1); }
    };
    const cleanup = () => process.stdin.removeListener('keypress', onKey);
    process.stdin.on('keypress', onKey);
    render();
  });
}

async function categoryScreen(cat) {
  while (true) {
    const rows = cat.items.map((it) => ({
      label: (isAnswered(it) ? c.green + '✓ ' : c.yellow + '● ' + c.reset) + trunc(it.q, 44),
      hint: strip(answerLabel(it)),
    }));
    rows.push({ separator: true });
    rows.push({ label: 'Back to categories' });
    const openN = catOpen(cat);
    const pick = await selectMenu(cat.icon + '  ' + cat.title,
      rows, cat.blurb + (openN ? '  ·  ' + openN + ' unanswered' : '  ·  all set'));
    if (pick === -1 || pick === rows.length - 1) return;
    if (pick < cat.items.length) await itemScreen(cat, cat.items[pick]);
  }
}

async function reviewScreen() {
  while (true) {
    const answered = ALL_ITEMS.filter(({ it }) => isAnswered(it)).length;
    const i = await selectMenu('Review & Export',
      [
        c.green + '⇪ Export → docs/plans/lowcode-clarifications.md' + c.reset,
        'Preview brief',
        c.green + '💾 Save state' + c.reset,
        'Back',
      ],
      answered + '/' + ALL_ITEMS.length + ' items answered');
    if (i === 0) { save(); fs.writeFileSync(BRIEF_DOC, buildBrief(), 'utf8'); await toast(c.green + 'Wrote ' + path.basename(BRIEF_DOC) + c.reset); }
    else if (i === 1) {
      clear(); header('docs/plans/lowcode-clarifications.md (preview)');
      out(buildBrief().split('\n').slice(0, 48).join('\n') + '\n\n' + c.dim + '… (truncated; export to see all)' + c.reset + '\n\n');
      await selectMenu('', [c.green + 'OK' + c.reset]);
    } else if (i === 2) { save(); await toast(c.green + 'Saved ' + path.basename(STATE_FILE) + c.reset); }
    else return;
  }
}

function buildBrief() {
  const answered = ALL_ITEMS.filter(({ it }) => isAnswered(it)).length;
  const lines = [];
  lines.push('# Lowcode & Plugins — Clarifications');
  lines.push('');
  lines.push('> Generated by `scripts/lowcode-clarify.js` from `' + path.basename(STATE_FILE) + '`.');
  lines.push('> ' + answered + '/' + ALL_ITEMS.length + ' items answered · updated ' + (state.updatedAt || new Date().toISOString()) + '.');
  lines.push('');
  lines.push('These answers drive work on the built-but-inert `services/lowcode` + `services/plugins` modules.');
  lines.push('');
  for (const cat of CATEGORIES) {
    lines.push('## ' + cat.title);
    lines.push('');
    lines.push('_' + cat.blurb + '_');
    lines.push('');
    for (const it of cat.items) {
      lines.push('### ' + it.q);
      if (it.ground) lines.push('- _Now:_ ' + it.ground);
      const a = ans(it.id);
      if (!isAnswered(it)) { lines.push('- **Answer:** _(unanswered)_'); }
      else if (it.multi) {
        lines.push('- **Answer:**');
        a.choice.forEach((idx) => { const o = it.options[idx]; if (o) lines.push('  - ' + o.label + (o.note ? ' — ' + o.note : '')); });
      } else {
        const o = it.options[a.choice];
        lines.push('- **Answer:** ' + (o ? o.label + (o.note ? ' — ' + o.note : '') : '?'));
      }
      if (a && a.note) lines.push('- **Note:** ' + a.note);
      lines.push('');
    }
  }
  return lines.join('\n') + '\n';
}

async function mainMenu() {
  while (true) {
    const rows = CATEGORIES.map((cat) => {
      const openN = catOpen(cat);
      const tag = openN ? c.yellow + '[' + openN + ' open]' + c.reset : c.green + '[all set]' + c.reset;
      return { label: cat.icon + '  ' + pad(cat.title, 26), hint: tag };
    });
    rows.push({ separator: true });
    rows.push({ label: '✓  Review & Export', hint: 'summary + write docs/plans/lowcode-clarifications.md' });
    rows.push({ separator: true });
    rows.push({ label: c.green + '   Save & Quit' + c.reset });
    rows.push({ label: c.red + '   Quit without saving' + c.reset });

    const totalOpen = ALL_ITEMS.filter(({ it }) => !isAnswered(it)).length;
    const sub = totalOpen
      ? totalOpen + ' clarification' + (totalOpen === 1 ? '' : 's') + ' still open · answers persist to ' + path.basename(STATE_FILE)
      : 'all clarifications answered — export the brief';
    const ch = await selectMenu('Answer the clarifications', rows, sub);

    const n = CATEGORIES.length;
    if (ch === -1) { if (await confirm('Quit without saving changes?')) { await done('No changes saved.'); return; } continue; }
    if (ch < n) { await categoryScreen(CATEGORIES[ch]); continue; }
    if (ch === n + 1) { await reviewScreen(); continue; }               // Review & Export
    if (ch === n + 3) { save(); await done('Saved → ' + path.basename(STATE_FILE)); return; }  // Save & Quit
    if (ch === n + 4) { if (await confirm('Quit without saving changes?')) { await done('No changes saved.'); return; } }
  }
}

async function done(msg) {
  clear();
  header('Goodbye');
  out('  ' + c.green + msg + c.reset + '\n');
  out('  ' + c.dim + 'Re-run any time: ' + c.reset + c.cyan + 'npm run lowcode:clarify' + c.reset + '\n');
  out('  ' + c.dim + 'Export headlessly: ' + c.reset + c.cyan + 'node scripts/lowcode-clarify.js --export' + c.reset + '\n\n');
}

// ─────────────────────────────── bootstrap ─────────────────────────────────
function exitApp(code) {
  try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch (e) { /* noop */ }
  out(c.reset + '\n');
  process.exit(code || 0);
}

async function main() {
  load();

  if (process.argv.includes('--export')) {
    save();
    fs.writeFileSync(BRIEF_DOC, buildBrief(), 'utf8');
    console.log('Wrote ' + BRIEF_DOC + ' from ' + STATE_FILE);
    process.exit(0);
  }

  if (!process.stdin.isTTY) {
    console.error('This TUI needs an interactive terminal (TTY). Run it directly in your shell,');
    console.error('or use `node scripts/lowcode-clarify.js --export` to regenerate the brief headlessly.');
    process.exit(1);
  }
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.on('SIGINT', () => exitApp(0));

  await mainMenu();
  exitApp(0);
}

main().catch((err) => {
  try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch (e) { /* noop */ }
  console.error('\n' + c.red + 'Error: ' + (err && err.stack || err) + c.reset);
  process.exit(1);
});
