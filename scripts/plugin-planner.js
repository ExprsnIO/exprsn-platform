#!/usr/bin/env node
'use strict';

/**
 * Exprsn Plugin & Lowcode Planner — a terminal UI for refining the architecture
 * decisions behind the plugin system (and its relationship to the low-code
 * platform designed in scripts/lowcode-tui.js).
 *
 * This is a *decision console*, not a scaffolder: it walks the open design
 * questions from PLUGINS_PLAN.md, records your choice + rationale + status for
 * each, lets you sequence the implementation phases, and exports the result
 * back to PLUGINS_DECISIONS.md so the plan stays a living document.
 *
 * Sibling to `npm run lowcode` (scripts/lowcode-tui.js, the low-code spec
 * builder). Same keybindings: ↑/↓ move, Enter select, Esc back, Ctrl-C quit.
 * Pure Node (readline + ANSI), no external deps.
 *
 *   node scripts/plugin-planner.js              # opens/creates ./plugin-planner.state.json
 *   node scripts/plugin-planner.js my.json      # use a specific state file
 *   node scripts/plugin-planner.js --export     # headless: (re)write PLUGINS_DECISIONS.md and exit
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
  out('║' + center('◆  EXPRSN PLUGIN & LOWCODE PLANNER  ◆', W) + '║\n');
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
        if (it.separator) { out('  ' + c.gray + (it.label || '─'.repeat(20)) + c.reset + '\n'); return; }
        const active = i === idx;
        const cursor = active ? c.cyan + '❯ ' : '  ';
        const label = active ? c.bold + c.white + it.label + c.reset : it.label;
        out('  ' + cursor + label + c.reset);
        if (it.hint) out('  ' + c.dim + trunc(it.hint, W - strip(it.label).length - 8) + c.reset);
        out('\n');
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

/** Free-text line editor. Resolves to string, or null on Esc. */
function textInput(label, initial = '', hint) {
  return new Promise((resolve) => {
    let buf = String(initial || '');
    const render = () => {
      clear();
      header('Edit');
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

async function toast(msg) {
  await selectMenu(msg, [c.green + 'OK' + c.reset]);
}

/** Print arbitrary pre-formatted lines and wait for a key. */
async function detailScreen(title, lines) {
  clear();
  header(title);
  lines.forEach((l) => out('  ' + l + '\n'));
  out('\n');
  await selectMenu('', [c.green + 'Back' + c.reset]);
}

// ──────────────────────────────── model ────────────────────────────────────
// The seed encodes the live decisions from PLUGINS_PLAN.md. State (choices,
// status, rationale, phase order) is overlaid from disk so the file is the
// source of truth and the plan doc is regenerated from it.

const STATUS = {
  open:     { icon: '●', color: c.yellow, label: 'open' },
  decided:  { icon: '✓', color: c.green, label: 'decided' },
  deferred: { icon: '◌', color: c.gray, label: 'deferred' },
};
const STATUS_ORDER = ['open', 'decided', 'deferred'];

const TOPICS = [
  {
    id: 'model', title: 'Plugin model & lifecycle',
    decisions: [
      {
        id: 'kinds-mvp', title: 'Execution kinds in MVP',
        question: 'Which plugin execution kinds ship in the MVP?',
        options: [
          { id: 'decl-webhook', label: 'declarative + webhook', recommended: true,
            desc: 'Trusted data evaluated by our engines, plus signed webhooks to out-of-process plugins. No foreign code in the gateway.' },
          { id: 'decl-only', label: 'declarative only',
            desc: 'Smallest surface: condition trees / workflow specs only. No external plugins yet.' },
          { id: 'all-three', label: 'declarative + webhook + internal',
            desc: 'Also allow in-process first-party code at MVP. Higher blast-radius risk on a single-instance gateway.' },
        ],
        seed: { status: 'decided', choiceId: 'decl-webhook',
          rationale: 'Untrusted code stays out-of-process; internal is deferred to a post-MVP first-party-only tier.' },
      },
      {
        id: 'loading', title: 'Plugin loading model',
        question: 'How are plugins discovered, loaded and isolated?',
        options: [
          { id: 'manifest-bus', label: 'manifest-registry + hook-bus', recommended: true,
            desc: 'Plugins are data (a manifest row); a plugins module + in-process hook bus dispatches events. Scoped, disable-without-restart.' },
          { id: 'dynamic-require', label: 'dynamic require (npm-style)',
            desc: 'Discover exprsn-plugin-* packages and require() them into MODULES. Max power, no trust boundary, breaks fail-fast boot.' },
          { id: 'hybrid', label: 'hybrid (registry now, require later)',
            desc: 'Manifest-registry for MVP; reuse dynamic-require mechanics only for signed in-repo code post-MVP.' },
        ],
        seed: { status: 'decided', choiceId: 'manifest-bus',
          rationale: 'Single-instance gateway has no in-process sandbox (vm2 dead); foreign require() risks all ten modules.' },
      },
      {
        id: 'first-plugins', title: 'What are the first plugins?',
        question: 'Should the first plugins refactor moderator, or be net-new?',
        options: [
          { id: 'refactor-mod', label: 'refactor moderator rules/agents', recommended: true,
            desc: 'Re-express existing moderator rules/agents on the framework first — proves the model, removes duplication.' },
          { id: 'net-new', label: 'net-new plugins alongside moderator',
            desc: 'Leave moderator as-is; build fresh example plugins. Faster to a demo, but two parallel extensibility systems.' },
          { id: 'both', label: 'both, refactor first',
            desc: 'Refactor one moderator rule as the proof (Phase 1.5), then add net-new plugins.' },
        ],
        seed: { status: 'open', choiceId: null, rationale: '' },
      },
      {
        id: 'frontend-surfaces', title: 'Frontend surfaces in MVP',
        question: 'Do plugins contribute SPA surfaces in the MVP?',
        options: [
          { id: 'declarative-feed', label: 'declarative surfaces feed', recommended: true,
            desc: 'Manifest declares surfaces; SPA fetches GET /plugins/api/surfaces and renders known types. No plugin JS shipped.' },
          { id: 'defer', label: 'defer to post-MVP',
            desc: 'Backend-only for MVP; SPA contributions land in Phase 3+.' },
          { id: 'none', label: 'never (backend-only plugins)',
            desc: 'Plugins are purely server-side; frontend is always first-party.' },
        ],
        seed: { status: 'open', choiceId: null, rationale: '' },
      },
    ],
  },
  {
    id: 'validation', title: 'Validation & capabilities',
    decisions: [
      {
        id: 'validator-lib', title: 'Manifest validator',
        question: 'How are manifests structurally validated?',
        options: [
          { id: 'ajv', label: 'ajv (JSON Schema)', recommended: true,
            desc: 'Add ajv as a plugins-module dep; validate manifest + configSchema. Do not pull into gateway core.' },
          { id: 'joi', label: 'joi',
            desc: 'Already a platform dependency; less natural for validating user-supplied JSON Schema config.' },
          { id: 'handrolled', label: 'hand-rolled checks',
            desc: 'No new dep; more code, weaker guarantees.' },
        ],
        seed: { status: 'decided', choiceId: 'ajv', rationale: 'configSchema is itself JSON Schema; ajv validates both layers.' },
      },
      {
        id: 'capability-vocab', title: 'Capability vocabulary',
        question: 'How is what a plugin may touch constrained?',
        options: [
          { id: 'closed-registry', label: 'closed capability registry', recommended: true,
            desc: 'capabilities drawn from services/plugins/src/capabilities.js; unknown capability ⇒ reject. The core trust control.' },
          { id: 'open-strings', label: 'free-form capability strings',
            desc: 'Flexible but unbounded; no way to reason about what a manifest can do.' },
        ],
        seed: { status: 'decided', choiceId: 'closed-registry', rationale: 'Grants must be a subset of a known, auditable vocabulary.' },
      },
      {
        id: 'webhook-ssrf', title: 'Webhook URL policy',
        question: 'How are webhook endpoints constrained (SSRF)?',
        options: [
          { id: 'https-blocklist', label: 'https + private-range blocklist', recommended: true,
            desc: 'Enforce https in prod (mirror assertSecureCaUrl); block loopback/private targets unless allowlisted. Ties to SPRINT SP-11.' },
          { id: 'allowlist-only', label: 'explicit allowlist only',
            desc: 'Only pre-approved hosts. Safest, least flexible.' },
          { id: 'none', label: 'no restriction',
            desc: 'Unsafe — rejected; left here to record the trade-off.' },
        ],
        seed: { status: 'decided', choiceId: 'https-blocklist', rationale: 'Security review already flagged atproto SSRF; same control applies.' },
      },
    ],
  },
  {
    id: 'ownership', title: 'Org / group / user ownership',
    decisions: [
      {
        id: 'mvp-scopes', title: 'Scopes enforced in MVP',
        question: 'Which ownership scopes are fully enforceable in MVP?',
        options: [
          { id: 'platform-user', label: 'platform + user (full)', recommended: true,
            desc: 'platform (admin) and user (self) fully enforced; org partial; group declarable-not-enforceable.' },
          { id: 'plus-org', label: '+ organization',
            desc: 'Also enforce org scope — blocked by the missing org-admin RBAC concept.' },
          { id: 'all', label: 'all four including group',
            desc: 'Blocked: no domain module carries group_id, so group scope cannot be enforced on content.' },
        ],
        seed: { status: 'decided', choiceId: 'platform-user',
          rationale: 'Org needs an admin authority concept; group needs per-module group-aware data first.' },
      },
      {
        id: 'org-rbac', title: 'Org-admin authority',
        question: 'Where does org-admin install authority come from?',
        options: [
          { id: 'interim-platform', label: 'reuse platform-admin (interim)', recommended: true,
            desc: 'Platform admin acts on a given org until a real org-RBAC concept exists. Records the gap, unblocks MVP.' },
          { id: 'build-rbac', label: 'build org RBAC now',
            desc: 'Add an organization + org-role model to auth. Correct long-term, large scope, off the MVP path.' },
          { id: 'defer', label: 'defer org scope entirely',
            desc: 'Ship platform + user only; add org scope later.' },
        ],
        seed: { status: 'open', choiceId: null, rationale: '' },
      },
      {
        id: 'group-enforcement', title: 'Group-scope enforcement',
        question: 'How is group scope handled given no module is group-aware?',
        options: [
          { id: 'declarable', label: 'declarable, not enforceable (now)', recommended: true,
            desc: 'Allow group-scoped installs but only enforce where group context exists (nexus routes). Tie to GROUPS_ADMIN_PLAN.md.' },
          { id: 'group-id-first', label: 'add group_id to modules first',
            desc: 'Do the per-module group-ownership backend work as a precondition. Largest, most correct.' },
          { id: 'drop', label: 'drop group scope from MVP',
            desc: 'Only platform/org/user; revisit group when modules become group-aware.' },
        ],
        seed: { status: 'open', choiceId: null, rationale: '' },
      },
    ],
  },
  {
    id: 'auth', title: 'Token / CA / Auth',
    decisions: [
      {
        id: 'inbound-auth', title: 'Inbound plugin auth (MVP)',
        question: 'How do plugin callbacks authenticate to the platform?',
        options: [
          { id: 'derived-token', label: 'derived service token', recommended: true,
            desc: 'X-Service-ID: plugin:<key> + HMAC via serviceToken.js; authenticatePlugin() loads the install. Simplest for MVP.' },
          { id: 'ca-token', label: 'CA-issued scoped token',
            desc: 'CA /api/tokens/generate with narrowed permissions. Real expiry/revocation, but needs a certificate.' },
          { id: 'both', label: 'derived now, CA in Phase 2',
            desc: 'Ship derived tokens for MVP; migrate to CA tokens once cert issuance is decided.' },
        ],
        seed: { status: 'decided', choiceId: 'derived-token', rationale: 'Reuses existing service-token machinery; CA path needs a cert decision.' },
      },
      {
        id: 'outbound-sign', title: 'Outbound webhook signing',
        question: 'How are outbound webhook deliveries signed?',
        options: [
          { id: 'hmac', label: 'HMAC (plugin:<key>)', recommended: true,
            desc: 'X-Plugin-Signature = HMAC-SHA256(body, deriveServiceToken("plugin:"+key)). Symmetric, simple, matches platform.' },
          { id: 'mtls', label: 'mutual TLS',
            desc: 'Stronger, heavier ops; revisit if plugins become a public marketplace.' },
        ],
        seed: { status: 'decided', choiceId: 'hmac', rationale: 'Consistent with existing service-to-service HMAC identity.' },
      },
      {
        id: 'ca-cert', title: 'Plugin CA certificate (Phase 2)',
        question: 'When CA tokens arrive, what certificate backs a plugin?',
        options: [
          { id: 'synthetic', label: 'synthetic "plugin" cert', recommended: true,
            desc: 'One platform-owned cert namespaces all plugin tokens. Simple, central revocation.' },
          { id: 'per-plugin', label: 'real per-plugin cert',
            desc: 'Each plugin gets its own cert/identity. Strongest isolation, most lifecycle overhead.' },
          { id: 'derived-forever', label: 'stay on derived tokens',
            desc: 'Never issue CA tokens to plugins; keep HMAC service tokens only.' },
        ],
        seed: { status: 'open', choiceId: null, rationale: '' },
      },
    ],
  },
  {
    id: 'lowcode', title: 'Lowcode ↔ Plugin relationship',
    decisions: [
      {
        id: 'relationship', title: 'How lowcode relates to plugins', kind: 'compare',
        question: 'Is the low-code platform the authoring layer for plugins, or a parallel platform sharing infra?',
        options: [
          { id: 'authoring', label: 'A · Lowcode authors plugins',
            desc: 'The low-code studio IS the visual front door that emits declarative-kind plugin manifests.',
            pros: [
              'One runtime: lowcode flows execute on the same hook bus + moderator engines',
              'No second execution/permission/token model to build or secure',
              'A low-code app inherits plugin scoping (platform/org/user) for free',
              'Smaller surface area — fits release-engineering-first posture',
            ],
            cons: [
              'Lowcode is constrained to what the plugin manifest can express',
              'Rich app-builder features (custom entities/forms) may not map to a "plugin"',
              'Couples two roadmaps — plugin manifest changes ripple into the studio',
            ] },
          { id: 'parallel', label: 'B · Separate, shares infra',
            desc: 'Lowcode is its own platform (entities/forms/flows) reusing the plugins module\'s scope model, capabilities and CA/auth.',
            pros: [
              'Lowcode can grow its own data model (entities/forms) beyond plugin manifests',
              'lowcode-platform.spec.json already models entities/actions/triggers/roles/forms',
              'Each roadmap evolves independently',
              'Plugins stay a thin extension mechanism; lowcode a full app builder',
            ],
            cons: [
              'Two runtimes/execution engines to build, secure and operate',
              'Risk of divergent permission/token models — more to audit',
              'Duplicated scope-resolution and dispatch logic unless carefully shared',
            ] },
        ],
        seed: { status: 'open', choiceId: null,
          rationale: 'Open by design (you chose "explore both"). lowcode-platform.spec.json + scripts/lowcode-tui.js are the parallel-track artifacts.' },
      },
    ],
  },
];

const PHASES_SEED = [
  { id: 'p0', title: 'Phase 0 · Registry + lifecycle skeleton', status: 'planned',
    summary: 'plugins module + schema + models + manifest validator + CRUD/lifecycle API (no execution). Flag-gated, inert.' },
  { id: 'p1', title: 'Phase 1 · Hook bus + declarative execution', status: 'planned',
    summary: 'PluginHostService + scope resolver; instrument 2–3 emit points; declarative plugins via ruleEngineService.' },
  { id: 'p15', title: 'Phase 1.5 · Refactor moderator onto framework', status: 'planned',
    summary: 'Re-express one moderator rule/agent as a plugin to validate the model before net-new plugins.' },
  { id: 'p2', title: 'Phase 2 · Webhook plugins + identity/tokens', status: 'planned',
    summary: 'worker:plugins (Bull) signed delivery + circuit breaker; authenticatePlugin + requirePluginCapability; grants.' },
  { id: 'p3', title: 'Phase 3 · Org scope + SPA surfaces', status: 'planned',
    summary: 'Full org scope; group scope documented as enforcement-blocked; GET /plugins/api/surfaces feed in the SPA.' },
  { id: 'p4', title: 'Phase 4 · Post-MVP', status: 'planned',
    summary: 'internal in-process tier; CA tokens w/ revocation; external runner; signing/marketplace; group-aware data.' },
];
const PHASE_STATUS = ['planned', 'active', 'done', 'deferred'];
const PHASE_ICON = { planned: c.gray + '○', active: c.yellow + '◑', done: c.green + '●', deferred: c.dim + '◌' };

// ──────────────────────────────── state ────────────────────────────────────
const arg0 = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const STATE_FILE = path.resolve(arg0 || 'plugin-planner.state.json');
const DECISIONS_DOC = path.resolve('PLUGINS_DECISIONS.md');

const blankState = () => ({ decisions: {}, phases: { order: PHASES_SEED.map((p) => p.id), status: {} } });
let state = blankState();

function load() {
  try {
    if (fs.existsSync(STATE_FILE)) state = Object.assign(blankState(), JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')));
  } catch (e) { /* start fresh on a corrupt file */ }
  if (!state.decisions) state.decisions = {};
  if (!state.phases) state.phases = { order: PHASES_SEED.map((p) => p.id), status: {} };
  // heal phase order against the seed (new phases appended, removed ones dropped)
  const seedIds = PHASES_SEED.map((p) => p.id);
  state.phases.order = (state.phases.order || []).filter((id) => seedIds.includes(id));
  seedIds.forEach((id) => { if (!state.phases.order.includes(id)) state.phases.order.push(id); });
}

function save() { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8'); }

// effective view: seed defaults overlaid with saved choices
function eff(decision) {
  const saved = state.decisions[decision.id] || {};
  return {
    status: saved.status || decision.seed.status,
    choiceId: saved.choiceId !== undefined ? saved.choiceId : decision.seed.choiceId,
    rationale: saved.rationale !== undefined ? saved.rationale : decision.seed.rationale,
  };
}
function setDecision(id, patch) { state.decisions[id] = Object.assign({}, state.decisions[id], patch); }
function phaseStatus(id) { return state.phases.status[id] || PHASES_SEED.find((p) => p.id === id).status; }
function orderedPhases() { return state.phases.order.map((id) => PHASES_SEED.find((p) => p.id === id)).filter(Boolean); }

function allDecisions() { return TOPICS.flatMap((t) => t.decisions.map((d) => ({ topic: t, d }))); }
function optLabel(d, id) { const o = d.options.find((x) => x.id === id); return o ? o.label : null; }
function statusChip(s) { const m = STATUS[s] || STATUS.open; return m.color + m.icon + ' ' + m.label + c.reset; }

// ─────────────────────────────── screens ───────────────────────────────────
async function decisionScreen(topic, d) {
  while (true) {
    const e = eff(d);
    const chosen = e.choiceId ? optLabel(d, e.choiceId) : c.gray + '(none)' + c.reset;
    clear();
    header(topic.title);
    out('  ' + c.bold + d.title + c.reset + '   ' + statusChip(e.status) + '\n');
    wrap(d.question, W - 4).forEach((l) => out('  ' + c.dim + l + c.reset + '\n'));
    out('\n  Choice:    ' + c.yellow + chosen + c.reset + '\n');
    out('  Rationale: ' + (e.rationale ? c.white + e.rationale : c.gray + '(none)') + c.reset + '\n\n');

    const menu = [
      { label: 'Choose option', hint: d.kind === 'compare' ? 'side-by-side compare' : 'pick from ' + d.options.length },
      { label: 'Set status', hint: 'open / decided / deferred' },
      { label: 'Edit rationale', hint: 'why this choice' },
      { label: 'View option details', hint: 'full descriptions' + (d.kind === 'compare' ? ' + pros/cons' : '') },
      { label: c.dim + 'Back' + c.reset },
    ];
    const ch = await selectMenu('', menu);
    if (ch === -1 || ch === 4) return;

    if (ch === 0) {
      const picked = d.kind === 'compare' ? await compareChoose(d) : await plainChoose(d);
      if (picked) {
        const cur = eff(d);
        setDecision(d.id, { choiceId: picked, status: cur.status === 'open' ? 'decided' : cur.status });
        save();
      }
    } else if (ch === 1) {
      const i = await selectMenu('Set status — ' + d.title, STATUS_ORDER.map((s) => statusChip(s)));
      if (i >= 0) { setDecision(d.id, { status: STATUS_ORDER[i] }); save(); }
    } else if (ch === 2) {
      const v = await textInput('Rationale — ' + d.title, eff(d).rationale, 'a sentence on why');
      if (v !== null) { setDecision(d.id, { rationale: v }); save(); }
    } else if (ch === 3) {
      if (d.kind === 'compare') await compareDetails(d);
      else await detailScreen(d.title, d.options.flatMap((o) => [
        (o.recommended ? c.green + '★ ' : '  ') + c.bold + o.label + c.reset,
        ...wrap(o.desc, W - 6).map((l) => '    ' + c.dim + l + c.reset), '',
      ]));
    }
  }
}

async function plainChoose(d) {
  const items = d.options.map((o) => ({
    label: (o.recommended ? c.green + '★ ' + c.reset : '') + o.label,
    hint: o.desc,
  }));
  const i = await selectMenu('Choose — ' + d.title, items, '★ = recommended');
  return i >= 0 ? d.options[i].id : null;
}

function compareLines(d) {
  const [a, b] = d.options;
  const lines = [];
  lines.push(c.bold + c.cyan + a.label + c.reset);
  wrap(a.desc, W - 4).forEach((l) => lines.push('  ' + c.dim + l + c.reset));
  lines.push('  ' + c.green + 'Pros:' + c.reset);
  a.pros.forEach((p) => wrap(p, W - 8).forEach((l, i) => lines.push('    ' + (i ? '  ' : c.green + '+ ' + c.reset) + l)));
  lines.push('  ' + c.red + 'Cons:' + c.reset);
  a.cons.forEach((p) => wrap(p, W - 8).forEach((l, i) => lines.push('    ' + (i ? '  ' : c.red + '- ' + c.reset) + l)));
  lines.push('');
  lines.push(c.bold + c.magenta + b.label + c.reset);
  wrap(b.desc, W - 4).forEach((l) => lines.push('  ' + c.dim + l + c.reset));
  lines.push('  ' + c.green + 'Pros:' + c.reset);
  b.pros.forEach((p) => wrap(p, W - 8).forEach((l, i) => lines.push('    ' + (i ? '  ' : c.green + '+ ' + c.reset) + l)));
  lines.push('  ' + c.red + 'Cons:' + c.reset);
  b.cons.forEach((p) => wrap(p, W - 8).forEach((l, i) => lines.push('    ' + (i ? '  ' : c.red + '- ' + c.reset) + l)));
  return lines;
}
async function compareDetails(d) { await detailScreen(d.title + ' — compare', compareLines(d)); }

async function compareChoose(d) {
  await compareDetails(d);
  const items = d.options.map((o) => ({ label: o.label, hint: o.desc }));
  items.push({ label: c.gray + 'Leave open / defer' + c.reset });
  const i = await selectMenu('Pick a direction — ' + d.title, items);
  if (i === -1) return null;
  if (i === d.options.length) { setDecision(d.id, { status: 'open' }); save(); return null; }
  return d.options[i].id;
}

async function topicScreen(topic) {
  while (true) {
    const items = topic.decisions.map((d) => {
      const e = eff(d);
      const m = STATUS[e.status] || STATUS.open;
      return { label: m.color + m.icon + c.reset + ' ' + pad(d.title, 30),
        hint: e.choiceId ? optLabel(d, e.choiceId) : c.gray + 'undecided' + c.reset };
    });
    items.push({ label: c.dim + 'Back' + c.reset });
    const openN = topic.decisions.filter((d) => eff(d).status === 'open').length;
    const ch = await selectMenu(topic.title + (openN ? '  ' + c.yellow + '(' + openN + ' open)' + c.reset : '  ' + c.green + '(all set)' + c.reset), items);
    if (ch === -1 || ch === topic.decisions.length) return;
    await decisionScreen(topic, topic.decisions[ch]);
  }
}

async function phasesScreen() {
  let idx = 0;
  while (true) {
    const phases = orderedPhases();
    const items = phases.map((p) => {
      const st = phaseStatus(p.id);
      return { label: (PHASE_ICON[st] || '○') + c.reset + ' ' + p.title, hint: st };
    });
    items.push({ separator: true, label: '─'.repeat(40) });
    items.push({ label: c.dim + 'Back' + c.reset });
    clear();
    // render with a custom footer via selectMenu (it re-clears), so just call it:
    const ch = await selectMenuAt('Implementation phases — sequence & status', items, idx,
      'Enter: cycle status · m: move up · n: move down');
    if (ch.key === 'escape') return;
    if (ch.index === items.length - 1) return;
    if (ch.index >= phases.length) { idx = ch.index; continue; }
    idx = ch.index;
    const p = phases[idx];
    if (ch.action === 'up' && idx > 0) {
      const o = state.phases.order; const i = o.indexOf(p.id); [o[i - 1], o[i]] = [o[i], o[i - 1]]; idx--; save();
    } else if (ch.action === 'down' && idx < phases.length - 1) {
      const o = state.phases.order; const i = o.indexOf(p.id); [o[i + 1], o[i]] = [o[i], o[i + 1]]; idx++; save();
    } else if (ch.action === 'select') {
      const cur = phaseStatus(p.id); const next = PHASE_STATUS[(PHASE_STATUS.indexOf(cur) + 1) % PHASE_STATUS.length];
      state.phases.status[p.id] = next; save();
    } else if (ch.action === 'detail') {
      await detailScreen(p.title, wrap(p.summary, W - 4).map((l) => c.dim + l + c.reset));
    }
  }
}

/** Like selectMenu but keeps a caller-supplied cursor and exposes move keys. */
function selectMenuAt(title, items, startIdx, footer) {
  const norm = items.map((it) => (typeof it === 'string' ? { label: it } : it));
  return new Promise((resolve) => {
    let idx = Math.min(startIdx || 0, norm.length - 1);
    while (norm[idx] && norm[idx].separator) idx = (idx + 1) % norm.length;
    const render = () => {
      clear();
      header(title);
      norm.forEach((it, i) => {
        if (it.separator) { out('  ' + c.gray + it.label + c.reset + '\n'); return; }
        const active = i === idx;
        out('  ' + (active ? c.cyan + '❯ ' : '  ') + (active ? c.bold + c.white + it.label + c.reset : it.label) + c.reset);
        if (it.hint) out('  ' + c.dim + trunc(it.hint, 18) + c.reset);
        out('\n');
      });
      out('\n' + c.dim + '  ↑/↓ move · Enter cycle · m/n reorder · d detail · Esc back' + c.reset);
      if (footer) out('\n' + c.dim + '  ' + footer + c.reset);
    };
    const step = (dir) => { do { idx = (idx + dir + norm.length) % norm.length; } while (norm[idx] && norm[idx].separator); render(); };
    const onKey = (str, key) => {
      onCtrlC(key);
      if (key.name === 'up') step(-1);
      else if (key.name === 'down') step(1);
      else if (key.name === 'return') { cleanup(); resolve({ index: idx, action: 'select' }); }
      else if (key.name === 'escape') { cleanup(); resolve({ index: idx, key: 'escape' }); }
      else if (str === 'm') { cleanup(); resolve({ index: idx, action: 'up' }); }
      else if (str === 'n') { cleanup(); resolve({ index: idx, action: 'down' }); }
      else if (str === 'd') { cleanup(); resolve({ index: idx, action: 'detail' }); }
    };
    const cleanup = () => process.stdin.removeListener('keypress', onKey);
    process.stdin.on('keypress', onKey);
    render();
  });
}

// ─────────────────────────────── export ────────────────────────────────────
function buildDoc() {
  const ts = new Date().toISOString();
  const L = [];
  L.push('# Plugin System — Decisions');
  L.push('');
  L.push('> Generated by `npm run plan:plugins` (scripts/plugin-planner.js) from');
  L.push('> `' + path.basename(STATE_FILE) + '`. Edit decisions in the TUI and re-export — do not hand-edit.');
  L.push('> Companion to `PLUGINS_PLAN.md` (design) and the low-code track');
  L.push('> (`scripts/lowcode-tui.js` → `lowcode-platform.spec.json`).');
  L.push('');
  L.push('_Last exported: ' + ts + '_');
  L.push('');

  // open items first
  const open = allDecisions().filter(({ d }) => eff(d).status === 'open');
  L.push('## Open decisions (' + open.length + ')');
  L.push('');
  if (!open.length) L.push('_None — every decision is resolved or deferred._');
  open.forEach(({ topic, d }) => {
    L.push('- **' + topic.title + ' · ' + d.title + '** — ' + d.question);
  });
  L.push('');

  // summary table
  L.push('## Decision summary');
  L.push('');
  L.push('| Topic | Decision | Status | Choice |');
  L.push('| --- | --- | --- | --- |');
  allDecisions().forEach(({ topic, d }) => {
    const e = eff(d);
    const choice = e.choiceId ? optLabel(d, e.choiceId) : '—';
    L.push('| ' + topic.title + ' | ' + d.title + ' | ' + (STATUS[e.status] || STATUS.open).label + ' | ' + choice + ' |');
  });
  L.push('');

  // per-topic detail
  TOPICS.forEach((topic) => {
    L.push('## ' + topic.title);
    L.push('');
    topic.decisions.forEach((d) => {
      const e = eff(d);
      L.push('### ' + d.title + '  —  _' + (STATUS[e.status] || STATUS.open).label + '_');
      L.push('');
      L.push('**Question:** ' + d.question);
      L.push('');
      L.push('**Choice:** ' + (e.choiceId ? optLabel(d, e.choiceId) : '_undecided_'));
      if (e.rationale) { L.push(''); L.push('**Rationale:** ' + e.rationale); }
      L.push('');
      L.push('Options considered:');
      d.options.forEach((o) => {
        const mark = e.choiceId === o.id ? ' ✅' : (o.recommended ? ' ⭐' : '');
        L.push('- **' + o.label + '**' + mark + ' — ' + o.desc);
        if (o.pros) o.pros.forEach((p) => L.push('  - 👍 ' + p));
        if (o.cons) o.cons.forEach((p) => L.push('  - 👎 ' + p));
      });
      L.push('');
    });
  });

  // phases
  L.push('## Implementation phases (current sequence)');
  L.push('');
  orderedPhases().forEach((p, i) => {
    L.push((i + 1) + '. **' + p.title + '** — _' + phaseStatus(p.id) + '_  \n   ' + p.summary);
  });
  L.push('');
  return L.join('\n');
}

async function reviewScreen() {
  while (true) {
    const all = allDecisions();
    const counts = { open: 0, decided: 0, deferred: 0 };
    all.forEach(({ d }) => { counts[eff(d).status] = (counts[eff(d).status] || 0) + 1; });
    clear();
    header('Review & Export');
    out('  Decisions   ' + c.green + counts.decided + ' decided' + c.reset + ' · ' +
        c.yellow + counts.open + ' open' + c.reset + ' · ' + c.gray + counts.deferred + ' deferred' + c.reset + '\n');
    out('  Phases      ' + orderedPhases().map((p) => (PHASE_ICON[phaseStatus(p.id)] || '○') + c.reset).join(' ') + '\n');
    out('  State file  ' + c.dim + STATE_FILE + c.reset + '\n');
    out('  Doc target  ' + c.dim + DECISIONS_DOC + c.reset + '\n\n');
    const i = await selectMenu('', [
      c.green + '⇪ Export → PLUGINS_DECISIONS.md' + c.reset,
      'Preview decisions doc',
      c.green + '💾 Save state' + c.reset,
      'Back',
    ]);
    if (i === 0) { save(); fs.writeFileSync(DECISIONS_DOC, buildDoc(), 'utf8'); await toast(c.green + 'Wrote ' + path.basename(DECISIONS_DOC) + c.reset); }
    else if (i === 1) {
      clear(); header('PLUGINS_DECISIONS.md (preview)');
      out(strip(buildDoc()).split('\n').slice(0, 60).join('\n') + '\n\n' + c.dim + '… (truncated; export to see all)' + c.reset + '\n\n');
      await selectMenu('', [c.green + 'OK' + c.reset]);
    } else if (i === 2) { save(); await toast(c.green + 'Saved ' + path.basename(STATE_FILE) + c.reset); }
    else return;
  }
}

async function mainMenu() {
  while (true) {
    const items = TOPICS.map((t, i) => {
      const openN = t.decisions.filter((d) => eff(d).status === 'open').length;
      const tag = openN ? c.yellow + '[' + openN + ' open]' + c.reset : c.green + '[set]' + c.reset;
      return { label: (i + 1) + ' · ' + pad(t.title, 32), hint: tag };
    });
    const phasesActive = orderedPhases().filter((p) => phaseStatus(p.id) !== 'planned').length;
    items.push({ separator: true, label: '─'.repeat(44) });
    items.push({ label: '⟐ · Implementation phases', hint: phasesActive ? phasesActive + ' in motion' : 'sequence + status' });
    items.push({ label: '✓ · Review & Export', hint: 'summary + write doc' });
    items.push({ separator: true, label: '─'.repeat(44) });
    items.push({ label: c.green + '   Save & Quit' + c.reset });
    items.push({ label: c.red + '   Quit without saving' + c.reset });

    const totalOpen = allDecisions().filter(({ d }) => eff(d).status === 'open').length;
    const sub = totalOpen
      ? totalOpen + ' open decision' + (totalOpen === 1 ? '' : 's') + ' to refine · lowcode relationship is the headline open item'
      : 'all decisions resolved — export the doc';
    const ch = await selectMenu('Refine the plugin system' , items, sub);

    const topicCount = TOPICS.length;
    if (ch === -1) { if (await confirm('Quit without saving changes?')) { await done('No changes saved.'); return; } continue; }
    if (ch < topicCount) { await topicScreen(TOPICS[ch]); continue; }
    // offsets: [sep][phases][review][sep][save][quit]
    if (ch === topicCount + 1) { await phasesScreen(); continue; }
    if (ch === topicCount + 2) { await reviewScreen(); continue; }
    if (ch === topicCount + 4) { save(); await done('Saved → ' + path.basename(STATE_FILE)); return; }
    if (ch === topicCount + 5) { if (await confirm('Quit without saving changes?')) { await done('No changes saved.'); return; } }
  }
}

async function done(msg) {
  clear();
  header('Goodbye');
  out('  ' + c.green + msg + c.reset + '\n');
  out('  ' + c.dim + 'Re-run any time: ' + c.reset + c.cyan + 'npm run plan:plugins' + c.reset + '\n\n');
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
    fs.writeFileSync(DECISIONS_DOC, buildDoc(), 'utf8');
    console.log('Wrote ' + DECISIONS_DOC + ' from ' + STATE_FILE);
    process.exit(0);
  }

  if (!process.stdin.isTTY) {
    console.error('This TUI needs an interactive terminal (TTY). Run it directly in your shell,');
    console.error('or use `node scripts/plugin-planner.js --export` to regenerate the doc headlessly.');
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
