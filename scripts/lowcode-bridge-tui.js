#!/usr/bin/env node
'use strict';

/**
 * Exprsn Low-Code Bridge — a terminal UI for designing how a low-code app
 * *interacts with the Exprsn platform*: which module events trigger it, which
 * capability-gated actions it runs back into Exprsn, at what ownership scope,
 * and over which auth boundary.
 *
 * Where `npm run lowcode` (scripts/lowcode-tui.js) designs the abstract
 * platform spec (entities/forms/flows) and `npm run plan:plugins`
 * (scripts/plugin-planner.js) records the architecture decisions, THIS console
 * is the wiring layer between the two — it is grounded in the live module
 * registry (src/modules/registry.js) and the plugin model from docs/plans/plugins-plan.md
 * (hook/emit points, the closed capability vocabulary, scopes, derived-token /
 * HMAC auth). It emits a wiring spec you can hand to the plugins module.
 *
 * Pure Node (readline + ANSI), no external deps. Same keybindings as the
 * siblings: ↑/↓ move, Enter select, 1-9 jump, Esc back, Ctrl-C quit.
 *
 *   node scripts/lowcode-bridge-tui.js          # opens/creates ./lowcode-exprsn.wiring.json
 *   node scripts/lowcode-bridge-tui.js my.json  # use a specific wiring file
 *   node scripts/lowcode-bridge-tui.js --export  # headless: (re)write LOWCODE_EXPRSN.md and exit
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// The bridge is only meaningful if it reflects the REAL modules. Pull them from
// the canonical registry so this console can never drift from the gateway.
let MODULES = [];
try {
  ({ MODULES } = require('../src/modules/registry.js'));
} catch (e) {
  // Fall back to a static list so the TUI still runs outside the repo root.
  MODULES = ['ca', 'auth', 'spark', 'nexus', 'filevault', 'vault', 'timeline', 'prefetch', 'moderator', 'live', 'atproto']
    .map((name) => ({ name, prefix: '/' + name, schema: name, socketNs: null }));
}
const MODULE_NAMES = MODULES.map((m) => m.name);

// ─────────────────────────────── ANSI ──────────────────────────────────────
const E = '\x1b[';
const c = {
  reset: E + '0m', bold: E + '1m', dim: E + '2m', inverse: E + '7m',
  red: E + '31m', green: E + '32m', yellow: E + '33m', blue: E + '34m',
  magenta: E + '35m', cyan: E + '36m', white: E + '37m', gray: E + '90m',
};
const W = 68;
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
function header(sub) {
  const line = '═'.repeat(W);
  out(c.cyan + c.bold + '╔' + line + '╗\n');
  out('║' + center('◆  EXPRSN LOW-CODE  ⇄  PLATFORM BRIDGE  ◆', W) + '║\n');
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
    while (norm[idx] && norm[idx].separator) idx++;
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
      });
      out('\n' + c.dim + '  ↑/↓ move · Enter select · 1-9 jump · Esc back · Ctrl-C quit' + c.reset);
      if (footer) out('\n' + c.dim + '  ' + footer + c.reset);
    };
    const step = (dir) => { do { idx = (idx + dir + norm.length) % norm.length; } while (norm[idx] && norm[idx].separator); render(); };
    const onKey = (str, key) => {
      onCtrlC(key);
      if (key.name === 'up') step(-1);
      else if (key.name === 'down') step(1);
      else if (key.name === 'return') { if (!norm[idx].separator) { cleanup(); resolve(idx); } }
      else if (key.name === 'escape') { cleanup(); resolve(-1); }
      else if (str && /^[1-9]$/.test(str)) {
        const n = parseInt(str, 10) - 1;
        if (n < norm.length && !norm[n].separator) { idx = n; render(); }
      }
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
      header('Edit field');
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

/** Multi-select (checkbox) list. Resolves to array of chosen values, or null on Esc. */
function multiSelect(title, options, selected = [], footer) {
  return new Promise((resolve) => {
    let idx = 0;
    const sel = new Set(selected);
    const render = () => {
      clear();
      header(title);
      options.forEach((opt, i) => {
        const value = typeof opt === 'string' ? opt : opt.value;
        const text = typeof opt === 'string' ? opt : opt.label;
        const active = i === idx;
        const box = sel.has(value) ? c.green + '[x]' : c.gray + '[ ]';
        const cursor = active ? c.cyan + '❯ ' : '  ';
        const label = active ? c.bold + c.white + text + c.reset : text;
        out('  ' + cursor + box + c.reset + ' ' + label + c.reset);
        if (typeof opt !== 'string' && opt.hint) out('  ' + c.dim + trunc(opt.hint, W - strip(text).length - 10) + c.reset);
        out('\n');
      });
      out('\n' + c.dim + '  ↑/↓ move · Space toggle · Enter confirm · Esc cancel' + c.reset);
      if (footer) out('\n' + c.dim + '  ' + footer + c.reset);
    };
    const val = (i) => (typeof options[i] === 'string' ? options[i] : options[i].value);
    const onKey = (str, key) => {
      onCtrlC(key);
      if (key.name === 'up') { idx = (idx - 1 + options.length) % options.length; render(); }
      else if (key.name === 'down') { idx = (idx + 1) % options.length; render(); }
      else if (key.name === 'space') { const o = val(idx); sel.has(o) ? sel.delete(o) : sel.add(o); render(); }
      else if (key.name === 'return') { cleanup(); resolve(options.map(val).filter((o) => sel.has(o))); }
      else if (key.name === 'escape') { cleanup(); resolve(null); }
    };
    const cleanup = () => process.stdin.removeListener('keypress', onKey);
    process.stdin.on('keypress', onKey);
    render();
  });
}

async function confirm(question) { return (await selectMenu(question, ['Yes', 'No'])) === 0; }
async function toast(msg) { await selectMenu(msg, [c.green + 'OK' + c.reset]); }

/** Print pre-formatted lines and wait for a key. */
async function detailScreen(title, lines) {
  clear();
  header(title);
  lines.forEach((l) => out('  ' + l + '\n'));
  out('\n');
  await selectMenu('', [c.green + 'Back' + c.reset]);
}

// ─────────────────────── the Exprsn interaction surface ─────────────────────
// Grounded in docs/plans/plugins-plan.md: the platform emits `<module>.<resource>.<verb>`
// events through the hook bus, and a plugin/low-code app touches the platform
// through a CLOSED capability vocabulary (read:/emit:/write:/call:webhook).
// These curated lists describe what each module realistically exposes today.

// Hook/emit points a low-code app can subscribe a trigger to.
const MODULE_EVENTS = {
  timeline: ['post.created', 'post.updated', 'post.deleted', 'post.liked', 'comment.created', 'bookmark.added'],
  spark: ['message.sent', 'conversation.created', 'call.started', 'attachment.shared'],
  nexus: ['group.created', 'member.joined', 'member.left', 'event.created', 'event.reminder'],
  moderator: ['case.opened', 'verdict.issued', 'rule.matched', 'notification.created'],
  live: ['stream.started', 'stream.ended', 'room.joined', 'recording.ready', 'chat.message'],
  filevault: ['file.uploaded', 'file.shared', 'file.deleted', 'folder.created', 'quota.exceeded'],
  vault: ['secret.created', 'secret.accessed', 'secret.rotated'],
  auth: ['user.login', 'user.logout', 'session.created', 'mfa.enrolled'],
  ca: ['token.issued', 'token.revoked', 'cert.issued', 'cert.revoked'],
  prefetch: ['job.queued', 'job.completed', 'job.failed'],
  atproto: ['firehose.post', 'label.applied', 'did.provisioned'],
};
const GENERIC_EVENTS = ['created', 'updated', 'deleted'];

// Resources each module exposes to the capability vocabulary.
const MODULE_RESOURCES = {
  timeline: ['posts', 'comments', 'bookmarks'],
  spark: ['messages', 'conversations', 'calls'],
  nexus: ['groups', 'members', 'events'],
  moderator: ['cases', 'verdicts', 'rules', 'notifications'],
  live: ['streams', 'rooms', 'recordings', 'chat'],
  filevault: ['files', 'folders', 'shares'],
  vault: ['secrets'],
  auth: ['users', 'sessions'],
  ca: ['tokens', 'certs'],
  prefetch: ['jobs'],
  atproto: ['labels', 'dids', 'firehose'],
};

// Verbs from PLUGINS_PLAN: read (pull data), emit (fire a platform event such
// as a notification), write (produce content — routed through moderator first).
const CAP_VERBS = [
  { verb: 'read', hint: 'pull data out of the module', moderated: false },
  { verb: 'emit', hint: 'fire a platform event (e.g. a notification)', moderated: false },
  { verb: 'write', hint: 'produce content — routed through moderator first', moderated: true },
];

function eventsFor(mod) {
  return (MODULE_EVENTS[mod] || GENERIC_EVENTS).map((e) => mod + '.' + e);
}
function resourcesFor(mod) { return MODULE_RESOURCES[mod] || ['records']; }

/** Full closed capability vocabulary for a module, e.g. read:timeline.posts. */
function capabilitiesFor(mod) {
  const caps = [];
  for (const r of resourcesFor(mod)) {
    for (const v of CAP_VERBS) caps.push({ value: v.verb + ':' + mod + '.' + r, moderated: v.moderated });
  }
  return caps;
}
function isModerated(cap) { return /^write:/.test(cap); }

const SCOPES = [
  { value: 'platform', hint: 'platform admins install for everyone — fully enforced' },
  { value: 'user', hint: 'a user installs for themselves — fully enforced' },
  { value: 'organization', hint: 'org-admin install — interim: reuses platform-admin' },
  { value: 'group', hint: 'group-scoped — declarable, enforced only where group ctx exists (nexus)' },
];
const KINDS = [
  { value: 'declarative', hint: 'trusted spec evaluated in-process by our engines (ruleEngine/workflow)' },
  { value: 'webhook', hint: 'platform emits a signed HTTPS call to your endpoint, out-of-process' },
];
const ACTION_KINDS = [
  { value: 'capability', hint: 'act on a module through a granted capability (read/emit/write)' },
  { value: 'call:webhook', hint: 'hand off to your external endpoint (webhook kind only)' },
];

// ──────────────────────────────── state ────────────────────────────────────
const SPEC_FILE = path.resolve(
  (process.argv[2] && !process.argv[2].startsWith('--')) ? process.argv[2] : 'lowcode-exprsn.wiring.json'
);
const DOC_FILE = path.resolve('LOWCODE_EXPRSN.md');

const blank = () => ({
  app: {
    name: 'My Low-Code App',
    key: 'my-app',
    kind: 'declarative',
    scope: 'user',
    description: '',
    endpoint: '',            // webhook kind only
  },
  capabilities: [],          // granted closed-vocabulary capabilities
  flows: [],                 // [{ name, trigger:{module,event,condition}, steps:[...] }]
  auth: {
    inbound: 'derived-service-token',   // X-Service-ID: plugin:<key> + HMAC
    outboundSign: 'hmac',               // X-Plugin-Signature = HMAC-SHA256(body, plugin:<key>)
    webhookPolicy: 'https-private-blocklist',
  },
});

let state = blank();

function load() {
  try {
    if (fs.existsSync(SPEC_FILE)) state = Object.assign(blank(), JSON.parse(fs.readFileSync(SPEC_FILE, 'utf8')));
  } catch (e) { /* start fresh on a corrupt file */ }
  if (!Array.isArray(state.capabilities)) state.capabilities = [];
  if (!Array.isArray(state.flows)) state.flows = [];
  if (!state.auth) state.auth = blank().auth;
}
function save() { fs.writeFileSync(SPEC_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8'); }

// ─────────────────────────────── screens ───────────────────────────────────
async function screenApp() {
  while (true) {
    const a = state.app;
    const rows = [
      { label: pad('Name', 14) + c.yellow + (a.name || '(unset)') + c.reset, k: 'name', type: 'text' },
      { label: pad('Key', 14) + c.yellow + (a.key || '(unset)') + c.reset, k: 'key', type: 'text', hint: 'kebab-case id — becomes plugin:<key>' },
      { label: pad('Kind', 14) + c.yellow + a.kind + c.reset, k: 'kind', type: 'kind' },
      { label: pad('Scope', 14) + c.yellow + a.scope + c.reset, k: 'scope', type: 'scope' },
      { label: pad('Description', 14) + c.yellow + (a.description || '(none)') + c.reset, k: 'description', type: 'text' },
    ];
    if (a.kind === 'webhook') {
      rows.push({ label: pad('Endpoint', 14) + c.yellow + (a.endpoint || c.red + '(required)' + c.reset) + c.reset, k: 'endpoint', type: 'text', hint: 'https URL — SSRF policy applies' });
    }
    const menu = rows.map((r) => ({ label: r.label, hint: r.hint }));
    menu.push({ separator: true });
    menu.push({ label: c.dim + 'Back' + c.reset });
    const ch = await selectMenu('App / Manifest — who this app is to the platform', menu,
      'plugin identity: ' + c.cyan + 'plugin:' + (a.key || 'my-app') + c.reset);
    if (ch === -1 || ch >= rows.length) return;
    const r = rows[ch];
    if (r.type === 'text') {
      const v = await textInput(r.k, a[r.k] || '', r.hint);
      if (v !== null) a[r.k] = v;
    } else if (r.type === 'kind') {
      const i = await selectMenu('Execution kind', KINDS.map((k) => ({ label: k.value, hint: k.hint })));
      if (i >= 0) a.kind = KINDS[i].value;
    } else if (r.type === 'scope') {
      const i = await selectMenu('Ownership scope', SCOPES.map((s) => ({ label: s.value, hint: s.hint })));
      if (i >= 0) a.scope = SCOPES[i].value;
    }
  }
}

async function screenModules() {
  while (true) {
    const items = MODULES.map((m) => ({
      label: pad(m.name, 12) + c.dim + m.prefix + c.reset,
      hint: `${eventsFor(m.name).length} events · ${capabilitiesFor(m.name).length} capabilities`,
    }));
    items.push({ separator: true });
    items.push({ label: c.dim + 'Back' + c.reset });
    const ch = await selectMenu('Exprsn modules — the interaction surface (reference)', items,
      'Each module emits events (triggers) and exposes capabilities (actions).');
    if (ch === -1 || ch >= MODULES.length) return;
    const m = MODULES[ch];
    const lines = [];
    lines.push(c.bold + m.name + c.reset + c.dim + '  ' + m.prefix + '  schema=' + m.schema + (m.socketNs ? '  ns=' + [].concat(m.socketNs).join(',') : '') + c.reset);
    lines.push('');
    lines.push(c.cyan + 'Hook/emit points (subscribe a trigger):' + c.reset);
    eventsFor(m.name).forEach((e) => lines.push('  ' + c.yellow + e + c.reset));
    lines.push('');
    lines.push(c.cyan + 'Capabilities (gate an action):' + c.reset);
    capabilitiesFor(m.name).forEach((cap) => {
      const grantedMark = state.capabilities.includes(cap.value) ? c.green + ' ✓ granted' + c.reset : '';
      const modMark = cap.moderated ? c.magenta + ' ⟳ via moderator' + c.reset : '';
      lines.push('  ' + cap.value + grantedMark + modMark);
    });
    await detailScreen('Module · ' + m.name, lines);
  }
}

async function screenCapabilities() {
  while (true) {
    const items = MODULE_NAMES.map((m) => {
      const granted = capabilitiesFor(m).filter((cap) => state.capabilities.includes(cap.value)).length;
      return { label: pad(m, 12), hint: granted ? c.green + granted + ' granted' + c.reset : c.gray + 'none' + c.reset };
    });
    items.push({ separator: true });
    items.push({ label: c.dim + 'Back' + c.reset });
    const total = state.capabilities.length;
    const ch = await selectMenu('Capabilities & grants — what this app may touch  ' + c.dim + '(' + total + ')' + c.reset, items,
      'Closed vocabulary — write:* routes produced content through moderator.');
    if (ch === -1 || ch >= MODULE_NAMES.length) return;
    const m = MODULE_NAMES[ch];
    const opts = capabilitiesFor(m).map((cap) => ({
      value: cap.value, label: cap.value,
      hint: cap.moderated ? c.magenta + 'produced content → moderator pipeline' + c.reset : '',
    }));
    const picked = await multiSelect('Grant capabilities — ' + m, opts, state.capabilities, '★ write:* is moderated');
    if (picked !== null) {
      // replace just this module's caps, keep the rest
      const others = state.capabilities.filter((cap) => !capabilitiesFor(m).some((x) => x.value === cap));
      state.capabilities = others.concat(picked);
      save();
    }
  }
}

const flowSummary = (f) => {
  const t = f.trigger || {};
  return `${c.white}${f.name}${c.reset} ${c.dim}⟵ ${t.event || (t.module ? t.module + '.*' : 'no trigger')} · ${(f.steps || []).length} step(s)${c.reset}`;
};

async function editFlow(initial) {
  const draft = JSON.parse(JSON.stringify(initial || { name: '', trigger: {}, steps: [] }));
  while (true) {
    const t = draft.trigger || (draft.trigger = {});
    const menu = [
      { label: pad('Name', 14) + c.yellow + (draft.name || c.gray + 'new' + c.reset) + c.reset },
      { label: pad('Trigger module', 14) + c.yellow + (t.module || '(pick)') + c.reset, hint: 'Exprsn module that emits the event' },
      { label: pad('Trigger event', 14) + c.yellow + (t.event || '(pick)') + c.reset, hint: 'the hook/emit point' },
      { label: pad('Guard', 14) + c.yellow + (t.condition || c.gray + '(always)' + c.reset) + c.reset, hint: 'e.g. status == "open"' },
      { label: pad('Steps', 14) + c.yellow + (draft.steps || []).length + ' action(s)' + c.reset, hint: 'what the app does into Exprsn' },
      { separator: true },
      { label: c.green + '✓ Save flow' + c.reset },
      { label: c.red + '✗ Cancel' + c.reset },
    ];
    const ch = await selectMenu('Flow · ' + (draft.name || 'new'), menu);
    if (ch === -1 || ch === 7) return null;
    if (ch === 6) {
      if (!draft.name) { await toast(c.red + 'A flow name is required.' + c.reset); continue; }
      if (!t.module || !t.event) { await toast(c.red + 'Pick a trigger module + event.' + c.reset); continue; }
      return draft;
    }
    if (ch === 0) {
      const v = await textInput('Flow name', draft.name, 'e.g. notifyOnNewPost');
      if (v !== null) draft.name = v;
    } else if (ch === 1) {
      const i = await selectMenu('Trigger module', MODULE_NAMES.map((m) => ({ label: m, hint: eventsFor(m).length + ' events' })));
      if (i >= 0) { t.module = MODULE_NAMES[i]; t.event = ''; }
    } else if (ch === 2) {
      if (!t.module) { await toast(c.yellow + 'Pick a module first.' + c.reset); continue; }
      const evs = eventsFor(t.module);
      const i = await selectMenu('Event on ' + t.module, evs);
      if (i >= 0) t.event = evs[i];
    } else if (ch === 3) {
      const v = await textInput('Guard condition', t.condition || '', 'optional — leave empty to always fire');
      if (v !== null) t.condition = v;
    } else if (ch === 4) {
      draft.steps = await manageSteps(draft.steps || []);
    }
  }
}

async function manageSteps(steps) {
  const items = Array.isArray(steps) ? steps : [];
  while (true) {
    const menu = items.map((s, i) => ({ label: `${c.cyan}${i + 1}.${c.reset} ${stepSummary(s)}` }));
    menu.push({ separator: true });
    menu.push({ label: c.green + '＋ Add action' + c.reset });
    const ch = await selectMenu('Flow actions  ' + c.dim + '(' + items.length + ')' + c.reset, menu,
      'Each action either uses a granted capability or calls your webhook. Esc when done.');
    if (ch === -1) return items;
    if (ch === items.length + 1) { const s = await editStep({}); if (s) items.push(s); continue; }
    if (ch >= items.length) continue;
    const sub = await selectMenu(stepSummary(items[ch]), ['Edit', c.red + 'Delete' + c.reset, 'Back']);
    if (sub === 0) { const s = await editStep(items[ch]); if (s) items[ch] = s; }
    else if (sub === 1) { if (await confirm('Delete this action?')) items.splice(ch, 1); }
  }
}

function stepSummary(s) {
  if (s.kind === 'call:webhook') return `${c.magenta}call:webhook${c.reset} ${c.dim}→ endpoint${c.reset}`;
  const mod = isModerated(s.capability || '') ? c.magenta + ' ⟳moderator' + c.reset : '';
  return `${c.white}${s.capability || '(pick capability)'}${c.reset}${mod} ${c.dim}${s.note ? '— ' + s.note : ''}${c.reset}`;
}

async function editStep(initial) {
  const draft = JSON.parse(JSON.stringify(initial || {}));
  if (!draft.kind) draft.kind = 'capability';
  while (true) {
    const menu = [
      { label: pad('Kind', 12) + c.yellow + draft.kind + c.reset },
    ];
    if (draft.kind === 'capability') {
      menu.push({ label: pad('Capability', 12) + c.yellow + (draft.capability || '(pick)') + c.reset, hint: 'from granted capabilities' });
    }
    menu.push({ label: pad('Note', 12) + c.yellow + (draft.note || c.gray + '(none)' + c.reset) + c.reset });
    menu.push({ separator: true });
    menu.push({ label: c.green + '✓ Save action' + c.reset });
    menu.push({ label: c.red + '✗ Cancel' + c.reset });

    const saveIdx = menu.length - 2;
    const ch = await selectMenu('Action', menu);
    if (ch === -1 || ch === saveIdx + 1) return null;
    if (ch === saveIdx) {
      if (draft.kind === 'capability' && !draft.capability) { await toast(c.red + 'Pick a capability (grant one first if the list is empty).' + c.reset); continue; }
      if (draft.kind === 'call:webhook' && state.app.kind !== 'webhook') {
        if (!(await confirm('App kind is "' + state.app.kind + '" — call:webhook needs a webhook app. Save anyway?'))) continue;
      }
      return draft;
    }
    if (ch === 0) {
      const i = await selectMenu('Action kind', ACTION_KINDS.map((k) => ({ label: k.value, hint: k.hint })));
      if (i >= 0) { draft.kind = ACTION_KINDS[i].value; if (draft.kind !== 'capability') delete draft.capability; }
    } else if (draft.kind === 'capability' && menu[ch].label.includes('Capability')) {
      if (!state.capabilities.length) { await toast(c.yellow + 'No capabilities granted yet — visit Capabilities & grants first.' + c.reset); continue; }
      const opts = state.capabilities.map((cap) => ({ label: cap + (isModerated(cap) ? c.magenta + '  ⟳moderator' + c.reset : '') }));
      const i = await selectMenu('Use which capability', opts);
      if (i >= 0) draft.capability = state.capabilities[i];
    } else {
      const v = await textInput('Note', draft.note || '', 'optional');
      if (v !== null) draft.note = v;
    }
  }
}

async function screenFlows() {
  while (true) {
    const items = state.flows.map((f, i) => ({ label: `${c.cyan}${i + 1}.${c.reset} ${flowSummary(f)}` }));
    items.push({ separator: true });
    items.push({ label: c.green + '＋ Add flow' + c.reset });
    const ch = await selectMenu('Flows — Exprsn event ⟶ app ⟶ action  ' + c.dim + '(' + state.flows.length + ')' + c.reset, items,
      'A flow binds a module event to capability-gated actions. Esc when done.');
    if (ch === -1) return;
    if (ch === state.flows.length + 1) { const f = await editFlow(); if (f) { state.flows.push(f); save(); } continue; }
    if (ch >= state.flows.length) continue;
    const sub = await selectMenu(flowSummary(state.flows[ch]), ['Edit', c.red + 'Delete' + c.reset, 'Back']);
    if (sub === 0) { const f = await editFlow(state.flows[ch]); if (f) { state.flows[ch] = f; save(); } }
    else if (sub === 1) { if (await confirm('Delete this flow?')) { state.flows.splice(ch, 1); save(); } }
  }
}

async function screenAuth() {
  const INBOUND = [
    { value: 'derived-service-token', hint: 'X-Service-ID: plugin:<key> + HMAC (MVP default)' },
    { value: 'ca-scoped-token', hint: 'CA-issued token w/ narrowed permissions (Phase 2, needs cert)' },
  ];
  const OUTBOUND = [
    { value: 'hmac', hint: 'X-Plugin-Signature = HMAC-SHA256(body, plugin:<key>)' },
    { value: 'mtls', hint: 'mutual TLS — heavier ops, marketplace-tier' },
  ];
  const POLICY = [
    { value: 'https-private-blocklist', hint: 'https in prod + block loopback/private ranges (SSRF)' },
    { value: 'allowlist-only', hint: 'only pre-approved hosts' },
  ];
  while (true) {
    const au = state.auth;
    const menu = [
      { label: pad('Inbound auth', 18) + c.yellow + au.inbound + c.reset, hint: 'how your callbacks authenticate to the platform' },
      { label: pad('Outbound signing', 18) + c.yellow + au.outboundSign + c.reset, hint: 'how platform→you webhooks are signed' },
      { label: pad('Webhook policy', 18) + c.yellow + au.webhookPolicy + c.reset, hint: 'SSRF guard on your endpoint' },
      { separator: true },
      { label: c.dim + 'Back' + c.reset },
    ];
    const ch = await selectMenu('Auth & identity — the trust boundary', menu,
      'Identity on the wire: ' + c.cyan + 'plugin:' + (state.app.key || 'my-app') + c.reset);
    if (ch === -1 || ch === 4) return;
    if (ch === 0) { const i = await selectMenu('Inbound auth', INBOUND.map((x) => ({ label: x.value, hint: x.hint }))); if (i >= 0) au.inbound = INBOUND[i].value; }
    else if (ch === 1) { const i = await selectMenu('Outbound signing', OUTBOUND.map((x) => ({ label: x.value, hint: x.hint }))); if (i >= 0) au.outboundSign = OUTBOUND[i].value; }
    else if (ch === 2) { const i = await selectMenu('Webhook URL policy', POLICY.map((x) => ({ label: x.value, hint: x.hint }))); if (i >= 0) au.webhookPolicy = POLICY[i].value; }
  }
}

// ─────────────────────── data-flow diagram (the "how") ──────────────────────
function diagramLines() {
  const a = state.app;
  const L = [];
  L.push(c.dim + 'How ' + c.reset + c.bold + (a.name || a.key) + c.reset + c.dim + ' (plugin:' + (a.key || 'my-app') + ', ' + a.kind + ', ' + a.scope + '-scope) interacts with Exprsn:' + c.reset);
  L.push('');
  if (!state.flows.length) {
    L.push(c.gray + '  (no flows yet — add one under "Flows")' + c.reset);
    return L;
  }
  state.flows.forEach((f, i) => {
    const t = f.trigger || {};
    L.push(c.cyan + (i + 1) + '. ' + (f.name || 'flow') + c.reset);
    L.push('   ' + c.yellow + '[' + (t.event || (t.module || '?') + '.*') + ']' + c.reset + c.dim + '   ◀── Exprsn module emits on the hook bus' + c.reset);
    L.push('        │' + (t.condition ? c.dim + '  guard: ' + t.condition + c.reset : ''));
    L.push('        ▼');
    L.push('   ' + c.green + 'pluginHost.emit' + c.reset + c.dim + ' → scope resolver (' + a.scope + ') → ' + a.key + c.reset);
    const steps = f.steps || [];
    if (!steps.length) {
      L.push('        ' + c.gray + '(no actions)' + c.reset);
    } else {
      steps.forEach((s, j) => {
        const last = j === steps.length - 1;
        const branch = last ? '        └▶ ' : '        ├▶ ';
        if (s.kind === 'call:webhook') {
          L.push(branch + c.magenta + 'signed webhook' + c.reset + c.dim + ' → POST ' + (a.endpoint || '<endpoint>') + '  (X-Plugin-Signature)' + c.reset);
        } else if (isModerated(s.capability || '')) {
          L.push(branch + c.white + (s.capability || '?') + c.reset + c.dim + ' → ' + c.magenta + 'moderator pipeline' + c.dim + ' → lands' + c.reset);
        } else {
          L.push(branch + c.white + (s.capability || '?') + c.reset + c.dim + (s.note ? '  (' + s.note + ')' : '') + c.reset);
        }
      });
    }
    L.push('');
  });
  L.push(c.dim + 'Legend: ' + c.magenta + '⟳ moderator' + c.dim + ' = produced content is moderated before it lands.' + c.reset);
  return L;
}

async function screenDiagram() { await detailScreen('Data-flow — app ⇄ Exprsn', diagramLines()); }

// ─────────────────────────────── export ────────────────────────────────────
function modulesTouched() {
  const set = new Set();
  state.flows.forEach((f) => { if (f.trigger && f.trigger.module) set.add(f.trigger.module); });
  state.capabilities.forEach((cap) => { const m = cap.split(':')[1]; if (m) set.add(m.split('.')[0]); });
  return [...set].sort();
}

function buildDoc() {
  const a = state.app;
  const ts = new Date().toISOString();
  const L = [];
  L.push('# Low-Code ⇄ Exprsn — Wiring');
  L.push('');
  L.push('> Generated by `npm run lowcode:bridge` (scripts/lowcode-bridge-tui.js) from');
  L.push('> `' + path.basename(SPEC_FILE) + '`. Companion to the low-code spec');
  L.push('> (`scripts/lowcode-tui.js`) and the plugin decisions (`docs/plans/plugins-decisions.md`).');
  L.push('> Edit in the TUI and re-export — do not hand-edit.');
  L.push('');
  L.push('_Last exported: ' + ts + '_');
  L.push('');
  L.push('## App');
  L.push('');
  L.push('| Field | Value |');
  L.push('| --- | --- |');
  L.push('| Name | ' + a.name + ' |');
  L.push('| Identity | `plugin:' + a.key + '` |');
  L.push('| Kind | ' + a.kind + ' |');
  L.push('| Scope | ' + a.scope + ' |');
  if (a.kind === 'webhook') L.push('| Endpoint | ' + (a.endpoint || '_(unset)_') + ' |');
  if (a.description) L.push('| Description | ' + a.description + ' |');
  L.push('');
  L.push('## Auth & identity');
  L.push('');
  L.push('- **Inbound:** ' + state.auth.inbound + ' — callbacks authenticate as `plugin:' + a.key + '`.');
  L.push('- **Outbound signing:** ' + state.auth.outboundSign + '.');
  L.push('- **Webhook URL policy:** ' + state.auth.webhookPolicy + '.');
  L.push('');
  L.push('## Modules touched');
  L.push('');
  const touched = modulesTouched();
  L.push(touched.length ? touched.map((m) => '`' + m + '`').join(', ') : '_none yet_');
  L.push('');
  L.push('## Capabilities granted (closed vocabulary)');
  L.push('');
  if (!state.capabilities.length) L.push('_none_');
  state.capabilities.slice().sort().forEach((cap) => {
    L.push('- `' + cap + '`' + (isModerated(cap) ? ' — ⟳ produced content routes through **moderator**' : ''));
  });
  L.push('');
  L.push('## Flows (Exprsn event → app → action)');
  L.push('');
  if (!state.flows.length) L.push('_none_');
  state.flows.forEach((f, i) => {
    const t = f.trigger || {};
    L.push('### ' + (i + 1) + '. ' + f.name);
    L.push('');
    L.push('- **Trigger:** `' + (t.event || (t.module || '?') + '.*') + '`' + (t.condition ? ' when `' + t.condition + '`' : ''));
    L.push('- **Actions:**');
    (f.steps || []).forEach((s) => {
      if (s.kind === 'call:webhook') L.push('  - signed webhook → endpoint' + (s.note ? ' (' + s.note + ')' : ''));
      else L.push('  - `' + (s.capability || '?') + '`' + (isModerated(s.capability || '') ? ' ⟳ via moderator' : '') + (s.note ? ' — ' + s.note : ''));
    });
    L.push('');
  });
  L.push('## Data flow');
  L.push('');
  L.push('```');
  diagramLines().forEach((l) => L.push(strip(l)));
  L.push('```');
  L.push('');
  return L.join('\n');
}

async function screenReview() {
  while (true) {
    clear();
    header('Review & Export');
    const a = state.app;
    out('  App          ' + c.yellow + a.name + c.reset + c.dim + '  plugin:' + a.key + ' · ' + a.kind + ' · ' + a.scope + c.reset + '\n');
    out('  Modules      ' + c.yellow + (modulesTouched().join(', ') || '(none)') + c.reset + '\n');
    out('  Capabilities ' + c.yellow + state.capabilities.length + c.reset + c.dim + ' granted' + c.reset + '\n');
    out('  Flows        ' + c.yellow + state.flows.length + c.reset + '\n');
    out('  Auth         ' + c.dim + state.auth.inbound + ' / ' + state.auth.outboundSign + c.reset + '\n');
    out('\n  ' + c.dim + 'Spec : ' + SPEC_FILE + c.reset + '\n');
    out('  ' + c.dim + 'Doc  : ' + DOC_FILE + c.reset + '\n');
    const i = await selectMenu('', [
      c.green + '💾 Save wiring spec (JSON)' + c.reset,
      c.green + '⇪ Export → LOWCODE_EXPRSN.md' + c.reset,
      'Print wiring JSON',
      'View data-flow diagram',
      'Back',
    ]);
    if (i === 0) { save(); await toast(c.green + 'Saved → ' + path.basename(SPEC_FILE) + c.reset); }
    else if (i === 1) { save(); fs.writeFileSync(DOC_FILE, buildDoc(), 'utf8'); await toast(c.green + 'Wrote ' + path.basename(DOC_FILE) + c.reset); }
    else if (i === 2) { clear(); header('Wiring JSON'); out(JSON.stringify(state, null, 2) + '\n\n'); await selectMenu('', [c.green + 'OK' + c.reset]); }
    else if (i === 3) { await screenDiagram(); }
    else return;
  }
}

async function mainMenu() {
  while (true) {
    const a = state.app;
    const items = [
      { label: '1 · App / Manifest', hint: a.name + ' · ' + a.kind + ' · ' + a.scope },
      { label: '2 · Exprsn modules', hint: MODULES.length + ' modules — events & capabilities (reference)' },
      { label: '3 · Capabilities & grants', hint: state.capabilities.length + ' granted' },
      { label: '4 · Flows (event → app → action)', hint: state.flows.length + ' defined' },
      { label: '5 · Auth & identity', hint: state.auth.inbound },
      { label: '6 · Data-flow diagram', hint: 'how it interacts with Exprsn' },
      { label: '7 · Review & Export', hint: 'save spec + write doc' },
      { separator: true },
      { label: c.green + '   Save & Quit' + c.reset },
      { label: c.red + '   Quit without saving' + c.reset },
    ];
    const ch = await selectMenu('Design how your low-code app wires into Exprsn', items,
      'Auto-saves on "Save & Quit" and on the Review screen.');
    switch (ch) {
      case 0: await screenApp(); break;
      case 1: await screenModules(); break;
      case 2: await screenCapabilities(); break;
      case 3: await screenFlows(); break;
      case 4: await screenAuth(); break;
      case 5: await screenDiagram(); break;
      case 6: await screenReview(); break;
      case 8: save(); await done('Saved → ' + path.basename(SPEC_FILE)); return;
      case 9: case -1:
        if (await confirm('Quit without saving changes?')) { await done('No changes saved.'); return; }
        break;
    }
  }
}

async function done(msg) {
  clear();
  header('Goodbye');
  out('  ' + c.green + msg + c.reset + '\n');
  out('  ' + c.dim + 'Re-run any time: ' + c.reset + c.cyan + 'npm run lowcode:bridge' + c.reset + '\n\n');
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
    fs.writeFileSync(DOC_FILE, buildDoc(), 'utf8');
    console.log('Wrote ' + DOC_FILE + ' from ' + SPEC_FILE);
    process.exit(0);
  }

  if (!process.stdin.isTTY) {
    console.error('This TUI needs an interactive terminal (TTY). Run it directly in your shell,');
    console.error('or use `node scripts/lowcode-bridge-tui.js --export` to regenerate the doc headlessly.');
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
