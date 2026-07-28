#!/usr/bin/env node
/*
 * cortex-features-tui.js — 6-stage feature-selection TUI for building out the
 * cortex module toward parity with the standalone Exprsn-Cortex agentic
 * platform (/Volumes/Storage/exprsn-cortex): containerized functions, agents,
 * models, skills, and token-gated access per the Exprsn-CA token spec v1.1
 * (time / use / persistent tokens + service HMAC tokens).
 *
 * House style matches scripts/setup-tui.js — pure Node, no deps, raw ANSI.
 *
 * Stages:
 *   1. Models & Backends            (Ollama first-class, lifecycle, catalog)
 *   2. Agents & Orchestration       (agent entities, chaining, scheduling)
 *   3. Skills & Containerized Functions
 *   4. Token Gating & CA Integration
 *   5. API Compatibility & Streaming (Ollama/OpenAI façades, Exprsn-Cortex UI)
 *   6. Memory, RAG & Operations
 *
 * Output: a JSON selection manifest + a markdown build plan under
 * sprints/proposals/ — proposal input for PM grooming into sprints/BACKLOG.md
 * (per sprints/README.md, work still needs tickets before it starts).
 *
 * Run: node scripts/cortex-features-tui.js   (or: npm run cortex:features)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

/* ---------------------------------------------------------------- ANSI -- */

const E = '\x1b[';
const c = {
  reset: `${E}0m`, bold: `${E}1m`, dim: `${E}2m`, inverse: `${E}7m`,
  red: `${E}31m`, green: `${E}32m`, yellow: `${E}33m`, blue: `${E}34m`,
  magenta: `${E}35m`, cyan: `${E}36m`, white: `${E}37m`, gray: `${E}90m`,
};
const W = 72;
const clear = () => out(`${E}2J${E}H`);
const out = (s) => process.stdout.write(s);

const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - strip(s).length));
const trunc = (s, n) => {
  if (strip(s).length <= n) return s;
  let visible = 0, i = 0;
  while (i < s.length && visible < n - 1) {
    if (s[i] === '\x1b') { i = s.indexOf('m', i) + 1; continue; }
    visible++; i++;
  }
  return s.slice(0, i) + '…' + c.reset;
};
const center = (s, n) => {
  const len = strip(s).length;
  const left = Math.max(0, Math.floor((n - len) / 2));
  return ' '.repeat(left) + s;
};

function header(sub) {
  out(c.cyan + c.bold);
  out('╔' + '═'.repeat(W) + '╗\n');
  out('║' + center('◆  CORTEX FEATURE SELECTION  ◆', W) + '║\n');
  out('╚' + '═'.repeat(W) + '╝\n');
  out(c.reset);
  if (sub) out(c.dim + ' ' + trunc(sub, W) + c.reset + '\n');
  out('\n');
}

/* ---------------------------------------------------------- key prompts -- */

const onCtrlC = (key) => { if (key && key.ctrl && key.name === 'c') exitApp(0); };

function selectMenu(title, items, footer) {
  const norm = items.map((it) => (typeof it === 'string' ? { label: it } : it));
  return new Promise((resolve) => {
    let idx = 0, top = 0;
    const pageSize = Math.max(6, (process.stdout.rows || 30) - 12);
    const render = () => {
      clear(); header(title);
      if (top > 0) out(c.dim + '   ⋮\n' + c.reset);
      norm.slice(top, top + pageSize).forEach((it, i) => {
        const real = top + i;
        const active = real === idx;
        const cursor = active ? c.cyan + ' ❯ ' + c.reset : '   ';
        const label = active ? c.bold + c.white + it.label + c.reset : it.label;
        let line = cursor + label;
        if (it.hint) line += c.gray + '  ' + trunc(it.hint, W - strip(it.label).length - 6) + c.reset;
        out(trunc(line, W + 8) + '\n');
      });
      if (top + pageSize < norm.length) out(c.dim + '   ⋮\n' + c.reset);
      out('\n' + c.dim + ' ↑/↓ move · Enter select · 1-9 jump · Esc back · Ctrl-C quit' + c.reset + '\n');
      if (footer) out(c.dim + ' ' + footer + c.reset + '\n');
    };
    const onKey = (str, key) => {
      onCtrlC(key);
      if (!key) return;
      if (key.name === 'up') idx = (idx - 1 + norm.length) % norm.length;
      else if (key.name === 'down') idx = (idx + 1) % norm.length;
      else if (key.name === 'return') { cleanup(); resolve(idx); return; }
      else if (key.name === 'escape') { cleanup(); resolve(-1); return; }
      else if (str >= '1' && str <= '9' && Number(str) <= norm.length) idx = Number(str) - 1;
      if (idx < top) top = idx;
      if (idx >= top + pageSize) top = idx - pageSize + 1;
      render();
    };
    const cleanup = () => process.stdin.removeListener('keypress', onKey);
    process.stdin.on('keypress', onKey);
    render();
  });
}

/*
 * checkList — the multi-select checkbox screen the wizard stages use.
 * items: [{ id, label, hint, effort, on }] — mutates `on` in place.
 * Resolves 'next' (Enter), 'back' (Esc / b).
 */
function checkList(title, items, footer) {
  return new Promise((resolve) => {
    let idx = 0, top = 0;
    const pageSize = Math.max(6, (process.stdout.rows || 30) - 13);
    const render = () => {
      clear(); header(title);
      if (top > 0) out(c.dim + '   ⋮\n' + c.reset);
      items.slice(top, top + pageSize).forEach((it, i) => {
        const real = top + i;
        const active = real === idx;
        const cursor = active ? c.cyan + ' ❯ ' + c.reset : '   ';
        const box = it.on ? c.green + '[x]' + c.reset : c.gray + '[ ]' + c.reset;
        const eff = c.magenta + `(${it.effort})` + c.reset;
        const label = active ? c.bold + c.white + it.label + c.reset : it.label;
        let line = `${cursor}${box} ${eff} ${label}`;
        if (it.hint) line += c.gray + ' — ' + trunc(it.hint, W - strip(it.label).length - 12) + c.reset;
        out(trunc(line, W + 20) + '\n');
      });
      if (top + pageSize < items.length) out(c.dim + '   ⋮\n' + c.reset);
      const n = items.filter((i) => i.on).length;
      out('\n' + c.dim + ` ${n}/${items.length} selected · effort S=1 M=3 L=8` + c.reset + '\n');
      out(c.dim + ' ↑/↓ move · Space toggle · a all · n none · Enter next stage · Esc back' + c.reset + '\n');
      if (footer) out(c.dim + ' ' + footer + c.reset + '\n');
    };
    const onKey = (str, key) => {
      onCtrlC(key);
      if (!key) return;
      if (key.name === 'up') idx = (idx - 1 + items.length) % items.length;
      else if (key.name === 'down') idx = (idx + 1) % items.length;
      else if (key.name === 'space') items[idx].on = !items[idx].on;
      else if (str === 'a') items.forEach((it) => { it.on = true; });
      else if (str === 'n') items.forEach((it) => { it.on = false; });
      else if (key.name === 'return') { cleanup(); resolve('next'); return; }
      else if (key.name === 'escape' || str === 'b') { cleanup(); resolve('back'); return; }
      if (idx < top) top = idx;
      if (idx >= top + pageSize) top = idx - pageSize + 1;
      render();
    };
    const cleanup = () => process.stdin.removeListener('keypress', onKey);
    process.stdin.on('keypress', onKey);
    render();
  });
}

async function confirm(question) { return (await selectMenu(question, ['Yes', 'No'])) === 0; }
async function toast(msg) { await selectMenu(msg, ['OK']); }

/* ---------------------------------------------------- feature catalogue -- */
/*
 * Gap analysis: services/cortex (platform module) vs /Volumes/Storage/exprsn-cortex
 * (standalone agentic platform) + the stated targets: containerized functions,
 * agents, models, skills, Exprsn-CA token gating, Ollama/Exprsn-Cortex-frontend
 * compatibility. Each feature: effort S|M|L, deps (feature ids), env flags the
 * feature introduces, and `gap` = where the capability exists today (if anywhere).
 */

const STAGES = [
  {
    key: 'models', title: 'Stage 1/6 — Models & Backends',
    blurb: 'Model lifecycle + making Ollama a first-class gateway backend',
    features: [
      { id: 'ollama-primary', label: 'Ollama as first-class backend', effort: 'M', on: true,
        hint: 'drop the worker-only gate; role routing brain/judge/vision in the gateway',
        flags: ['CORTEX_OLLAMA_ROLES=brain,judge,vision'],
        gap: 'today Ollama registers only when CORTEX_ASYNC_ROLE=worker (backends/index.js:57)' },
      { id: 'model-lifecycle', label: 'Model lifecycle admin API', effort: 'M', on: true,
        hint: 'load/unload/reload/pull/delete with per-model locking + audit trail',
        gap: 'llama.js has load/unload but nothing is exposed as admin HTTP routes' },
      { id: 'model-catalog', label: 'Curated model catalog', effort: 'M', on: true,
        hint: 'browse/search/filter registry of vetted Ollama models, pull from catalog',
        deps: ['model-lifecycle'],
        gap: 'standalone has ~25-model registry + catalog UI; module has none' },
      { id: 'model-preflight', label: 'Model preflight on /ready', effort: 'S', on: true,
        hint: 'verify required models are resident at startup; surface on health',
        gap: 'standalone verifies on /ready; module only pings the router' },
      { id: 'model-config', label: 'Per-model config', effort: 'S', on: true,
        hint: 'PUT /models/:name/config — ctx size, sampling defaults, KB binding slot',
        gap: 'standalone PUT /:name/config; module has no per-model settings' },
    ],
  },
  {
    key: 'agents', title: 'Stage 2/6 — Agents & Orchestration',
    blurb: 'From 3 hard-coded personas to user-defined, schedulable agents',
    features: [
      { id: 'agent-entities', label: 'DB-backed agent definitions', effort: 'M', on: true,
        hint: 'CRUD cortex.agents; draft → tests pass → enabled lifecycle',
        gap: 'module agents are 3 hard-coded personas in engine/agent.js:323' },
      { id: 'agent-chaining', label: 'Multi-step chaining engine', effort: 'L', on: true,
        deps: ['agent-entities'],
        hint: 'prompt·skill·retrieve·guardrail·moderate·transform·condition·parallel·tool_loop steps with {{var}} context',
        gap: 'standalone agent builder has all 9 step types; module has only the flat tool loop' },
      { id: 'agent-runs', label: 'Persisted agent runs', effort: 'S', on: true,
        deps: ['agent-entities'],
        hint: 'run history + transcripts, GET /agents/:id/runs',
        gap: 'AgentTask stores one transcript; no per-agent run ledger' },
      { id: 'agent-builder-nl', label: 'NL agent builder', effort: 'S', on: true,
        deps: ['agent-entities'],
        hint: 'describe an agent in English → drafted spec saved disabled',
        gap: 'tool/guardrail NL builders exist (registryFactory /build); agents have none' },
      { id: 'agent-scheduling', label: 'Scheduled agent runs', effort: 'M', on: true,
        deps: ['agent-entities'],
        hint: 'cron / Bull repeatable jobs; recurring + one-shot delayed runs',
        gap: 'no scheduling anywhere in the module (on-demand enqueue only)' },
      { id: 'agent-triggers', label: 'Event triggers from modules', effort: 'M', on: true,
        deps: ['agent-entities'],
        hint: 'run agents on platform events via the in-process client façade / webhooks',
        gap: 'client.js is call-in only; no event subscription' },
    ],
  },
  {
    key: 'functions', title: 'Stage 3/6 — Skills & Containerized Functions',
    blurb: 'Sandboxed skill runtime + Docker/OCI function execution',
    features: [
      { id: 'js-skills', label: 'Sandboxed JavaScript skills', effort: 'M', on: true,
        hint: 'worker_threads + vm isolate, capability gating, hard timeout',
        gap: 'module skills are prompt packs only; standalone runs JS + Python code skills' },
      { id: 'container-functions', label: 'Containerized function runtime', effort: 'L', on: true,
        hint: 'Docker/OCI per-function images, CPU/mem/net limits — Linux-safe (seatbelt is darwin-only, fail-closed elsewhere)',
        flags: ['CORTEX_FUNCTIONS_ENABLED=false', 'CORTEX_FUNCTIONS_RUNTIME=docker',
          'CORTEX_FUNCTIONS_CPU_LIMIT=1', 'CORTEX_FUNCTIONS_MEMORY_MB=512',
          'CORTEX_FUNCTIONS_TIMEOUT_S=120', 'CORTEX_FUNCTIONS_NETWORK=none'],
        gap: 'python tools use macOS sandbox-exec + ulimits (tools.js:198); no containers in either codebase' },
      { id: 'function-registry', label: 'Function registry + invoke API', effort: 'M', on: true,
        deps: ['container-functions'],
        hint: "cortex.functions CRUD, POST /functions/:name/invoke, 'function' tool kind in the agent loop",
        gap: 'tools support only http|python kinds (engine/tools.js)' },
      { id: 'repo-publish', label: 'Versioned skill/function repository', effort: 'M', on: true,
        hint: 'publish/install bundles with sha256 verification',
        gap: 'standalone repository/ subsystem; module has seed-data JSON only' },
      { id: 'warm-pools', label: 'Warm container pools', effort: 'M', on: true,
        deps: ['container-functions'],
        hint: 'pre-warmed containers + per-function concurrency to cut cold starts',
        gap: 'n/a — new with the container runtime' },
      { id: 'python-in-container', label: 'Python tools → containers', effort: 'S', on: false,
        deps: ['container-functions'],
        hint: 'migrate the python tool kind onto the container runtime (Linux parity, stays fail-closed)',
        gap: 'CORTEX_PYTHON_TOOLS_ENABLED refuses to run off-darwin today' },
    ],
  },
  {
    key: 'tokens', title: 'Stage 4/6 — Token Gating & CA Integration',
    blurb: 'Use/time-based + service tokens per Exprsn-CA token spec v1.1',
    features: [
      { id: 'use-metering', label: 'Use-based token metering', effort: 'M', on: true,
        hint: 'one use decremented per inference call (CA atomic usesRemaining decrement; TOKEN_NO_USES_REMAINING → 402/403)',
        gap: 'CA fully supports use tokens (services/ca/services/token.js:547); cortex only checks read/write perms' },
      { id: 'time-sessions', label: 'Time-based session tokens', effort: 'S', on: false,
        hint: 'time-expiry tokens for chat/agent sessions with /:id/refresh renewal',
        gap: 'CA refreshToken exists; cortex issues nothing' },
      { id: 'resource-tokens', label: 'Per-model/agent resource tokens', effort: 'M', on: true,
        hint: 'resource-scoped tokens (resourceValue /cortex/api/v1/models/<name>/*) gate which models/agents a bearer may use',
        gap: 'CA matchesResource does wildcard/prefix; cortex passes only req.path' },
      { id: 'inbound-service-hmac', label: 'Inbound service-token auth', effort: 'S', on: true,
        hint: 'accept X-Service-ID/X-Service-Token HMAC so modules can call cortex over HTTP',
        gap: 'cortex uses service tokens outbound only (jobs.js:67); shared authenticateService() is ready' },
      { id: 'scope-groups', label: 'Group/org-scoped access', effort: 'M', on: true,
        hint: 'v1.1 groupId/organizationId token scoping; SCOPE_INACTIVE + bulk revoke honored',
        gap: 'CA v1.1 implements scoping end-to-end; cortex ignores scope fields' },
      { id: 'quotas', label: 'Quota & budget accounting', effort: 'M', on: true,
        deps: ['use-metering'],
        hint: 'per-user/group/model budgets from PromptLog usage; enforce before dispatch',
        gap: 'PromptLog records usage but nothing enforces limits' },
      { id: 'token-admin-ui', label: 'Cortex token admin UI', effort: 'S', on: true,
        deps: ['resource-tokens'],
        hint: 'issue/revoke cortex-scoped tokens in the SPA (bulk revoke by scope)',
        gap: 'CA SPA modals exist for generic tokens; no cortex-specific issuance flow' },
    ],
  },
  {
    key: 'compat', title: 'Stage 5/6 — API Compatibility & Streaming',
    blurb: 'Ollama/OpenAI façades + Exprsn-Cortex frontend parity',
    features: [
      { id: 'sse-streaming', label: 'Token streaming (SSE + socket)', effort: 'M', on: true,
        hint: 'stream:true through llama.cpp/Ollama; SSE on chat, Socket.IO /cortex namespace on the shared io',
        gap: 'zero streaming today — socketNs:null, all responses buffered' },
      { id: 'openai-facade', label: 'OpenAI-compatible endpoint', effort: 'M', on: false,
        deps: ['sse-streaming'],
        hint: '/cortex/v1/chat/completions (+ /v1/models), token-gated — what most clients speak',
        gap: 'cortex consumes this shape but exposes nothing OpenAI/Ollama-shaped' },
      { id: 'ollama-facade', label: 'Ollama-compatible façade', effort: 'M', on: false,
        hint: 'token-gated /cortex/api/tags, /api/chat, /api/show, /api/pull passthrough',
        gap: 'lets Ollama-native clients (incl. Exprsn-Cortex UI model screens) point at the gateway' },
      { id: 'frontend-parity', label: 'Exprsn-Cortex frontend parity', effort: 'L', on: true,
        deps: ['agent-entities'],
        hint: 'match the standalone API shapes (/api/models·catalog, /api/agents, /api/skills, /api/kb, /api/chat) so its frontend runs against the module',
        gap: 'standalone console expects routes the module does not have' },
      { id: 'mcp-per-model', label: 'MCP server per model', effort: 'M', on: true,
        hint: 'Streamable-HTTP MCP at /cortex/mcp/models/:name — chat/embed/retrieve tools',
        gap: 'standalone mounts one MCP surface per loaded model; module has none' },
      { id: 'keyset-pagination', label: 'Conversation keyset pagination', effort: 'S', on: true,
        hint: 'cursor-based paging on sessions/messages instead of limit-only lists',
        gap: 'module lists cap at limit 100/200 with no cursor' },
    ],
  },
  {
    key: 'rag', title: 'Stage 6/6 — Memory, RAG & Operations',
    blurb: 'pgvector knowledge bases, retention, observability',
    features: [
      { id: 'pgvector', label: 'pgvector embedding store', effort: 'M', on: true,
        hint: 'embeddings in the cortex schema (nomic-embed-text), pgvector extension + index',
        gap: 'no vectors anywhere in the module; KB is flat markdown inlined into prompts' },
      { id: 'kb-ingest', label: 'KB ingestion pipeline', effort: 'L', on: true,
        deps: ['pgvector'],
        hint: 'GitHub / HuggingFace / data.gov / JSON / HTTP → chunk → embed; ingestion workers',
        gap: 'standalone rag/ subsystem; module has none' },
      { id: 'kb-bind', label: 'KB↔model binding + retrieve', effort: 'M', on: true,
        deps: ['pgvector', 'kb-ingest'],
        hint: 'bind KBs to models/agents; retrieve step + tool in the agent loop; /kb/:id/search',
        gap: 'standalone bind-kb + retrieve agent step' },
      { id: 'cache-admin', label: 'Cache stats & flush', effort: 'S', on: true,
        hint: '/cache/stats + /cache/flush, hit-rate on the admin dashboard',
        gap: 'lib/cache.js caches but exposes no stats or flush' },
      { id: 'retention', label: 'Data-retention sweeper', effort: 'S', on: true,
        flags: ['CORTEX_MESSAGE_RETENTION_DAYS=90', 'CORTEX_AUDIT_RETENTION_DAYS=365',
          'CORTEX_JOB_RETENTION_DAYS=30'],
        hint: 'configurable TTLs for messages/prompt-logs/tasks with scheduled + on-demand sweep',
        gap: 'only Bull removeOnComplete ages out; DB rows live forever' },
      { id: 'metrics', label: 'Metrics & audit surfacing', effort: 'M', on: false,
        hint: 'queue depth, breaker states, per-model latency/usage on admin overview',
        gap: 'health shows queue counts; breaker/usage internals are log-only' },
    ],
  },
];

const EFFORT_POINTS = { S: 1, M: 3, L: 8 };
const allFeatures = () => STAGES.flatMap((s) => s.features.map((f) => ({ ...f, stage: s })));
const featureById = (id) => {
  for (const s of STAGES) for (const f of s.features) if (f.id === id) return f;
  return null;
};

/* ------------------------------------------------------------ selection -- */

function resolveDeps() {
  // Auto-select unmet dependencies; report what was pulled in.
  const pulled = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of STAGES) for (const f of s.features) {
      if (!f.on || !f.deps) continue;
      for (const depId of f.deps) {
        const dep = featureById(depId);
        if (dep && !dep.on) { dep.on = true; pulled.push(`${dep.label} (needed by ${f.label})`); changed = true; }
      }
    }
  }
  return pulled;
}

function summaryLines() {
  const lines = [];
  let total = 0, count = 0;
  for (const s of STAGES) {
    const on = s.features.filter((f) => f.on);
    const pts = on.reduce((a, f) => a + EFFORT_POINTS[f.effort], 0);
    total += pts; count += on.length;
    const title = s.title.replace(/^Stage \d\/6 — /, '');
    const status = on.length
      ? c.green + `${on.length}/${s.features.length} · ${pts} pts` + c.reset
      : c.gray + 'none' + c.reset;
    lines.push(' ' + pad(trunc(title, 40), 41) + status);
    for (const f of on) lines.push(c.gray + '   └ ' + trunc(`${f.label} (${f.effort})`, W - 6) + c.reset);
  }
  lines.push('');
  lines.push(` ${c.bold}Selected: ${count} features · ${total} effort points${c.reset}` +
    c.gray + '  (S=1 M=3 L=8)' + c.reset);
  return lines;
}

/* ---------------------------------------------------------------- write -- */

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'sprints', 'proposals');
const OUT_MD = path.join(OUT_DIR, 'cortex-feature-plan.md');
const OUT_JSON = path.join(OUT_DIR, 'cortex-feature-selection.json');

function renderManifest() {
  return JSON.stringify({
    generatedBy: 'scripts/cortex-features-tui.js',
    comparedAgainst: '/Volumes/Storage/exprsn-cortex (standalone Exprsn-Cortex)',
    stages: STAGES.map((s) => ({
      key: s.key,
      title: s.title,
      selected: s.features.filter((f) => f.on).map((f) => ({
        id: f.id, label: f.label, effort: f.effort,
        deps: f.deps || [], flags: f.flags || [], gap: f.gap,
      })),
      skipped: s.features.filter((f) => !f.on).map((f) => f.id),
    })),
  }, null, 2) + '\n';
}

function renderPlan() {
  const L = [];
  L.push('# Cortex build-out — feature selection');
  L.push('');
  L.push('> Generated by `scripts/cortex-features-tui.js`. Proposal input for PM grooming —');
  L.push('> each selected feature still needs a FEAT/TASK ticket in `sprints/BACKLOG.md`');
  L.push('> (and cost-benefit sign-off for FEATs) before work starts, per `sprints/README.md`.');
  L.push('');
  L.push('Comparison target: the standalone **Exprsn-Cortex** agentic platform');
  L.push('(`/Volumes/Storage/exprsn-cortex`) plus the stated goals: containerized functions,');
  L.push('agents, models, skills, and token-gated access per the Exprsn-CA token spec v1.1');
  L.push('(time / use / persistent expiry, group/org scoping, service HMAC tokens).');
  L.push('');
  let total = 0;
  for (const s of STAGES) {
    const on = s.features.filter((f) => f.on);
    const pts = on.reduce((a, f) => a + EFFORT_POINTS[f.effort], 0);
    total += pts;
    L.push(`## ${s.title}`);
    L.push('');
    L.push(`_${s.blurb}._ Selected: ${on.length}/${s.features.length} · ${pts} pts`);
    L.push('');
    if (!on.length) { L.push('_Nothing selected in this stage._'); L.push(''); continue; }
    for (const f of on) {
      L.push(`### ${f.label} \`${f.id}\` (${f.effort})`);
      L.push('');
      L.push(`- **What:** ${f.hint}`);
      L.push(`- **Gap today:** ${f.gap}`);
      if (f.deps && f.deps.length) L.push(`- **Depends on:** ${f.deps.map((d) => `\`${d}\``).join(', ')}`);
      if (f.flags && f.flags.length) {
        L.push('- **New env flags:**');
        for (const fl of f.flags) L.push(`  - \`${fl}\``);
      }
      L.push('- **Ticket:** FEAT-TBD — file in `sprints/BACKLOG.md`');
      L.push('');
    }
    const off = s.features.filter((f) => !f.on);
    if (off.length) {
      L.push(`_Deferred: ${off.map((f) => `\`${f.id}\``).join(', ')}_`);
      L.push('');
    }
  }
  L.push('---');
  L.push('');
  L.push(`**Total: ${allFeatures().filter((f) => f.on).length} features · ${total} effort points** (S=1 M=3 L=8)`);
  L.push('');
  return L.join('\n');
}

function backupIfExists(file) {
  if (!fs.existsSync(file)) return null;
  const bak = `${file}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(file, bak);
  return bak;
}

async function reviewAndWrite() {
  const pulled = resolveDeps();
  if (pulled.length) {
    await toast('Auto-selected dependencies: ' + pulled.join(' · '));
  }
  while (true) {
    clear(); header('Review selection');
    summaryLines().forEach((l) => out(l + '\n'));
    out('\n');
    const choice = await selectMenu('Write plan?', [
      { label: '✓ Write plan + manifest', hint: path.relative(ROOT, OUT_MD) },
      { label: 'Preview markdown', hint: 'first screenful' },
      { label: '← Back to stages' },
    ]);
    if (choice === 1) {
      clear(); header('Preview — ' + path.relative(ROOT, OUT_MD));
      const lines = renderPlan().split('\n');
      lines.slice(0, Math.max(10, (process.stdout.rows || 30) - 10)).forEach((l) => out(' ' + trunc(l, W + 4) + '\n'));
      if (lines.length > (process.stdout.rows || 30) - 10) out(c.dim + ' … (truncated)\n' + c.reset);
      await toast('End of preview');
      continue;
    }
    if (choice !== 0) return false;
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const baks = [backupIfExists(OUT_MD), backupIfExists(OUT_JSON)].filter(Boolean);
    fs.writeFileSync(OUT_MD, renderPlan());
    fs.writeFileSync(OUT_JSON, renderManifest());
    await toast(`Wrote ${path.relative(ROOT, OUT_MD)} + ${path.relative(ROOT, OUT_JSON)}` +
      (baks.length ? ` (backed up ${baks.map((b) => path.basename(b)).join(', ')})` : ''));
    return true;
  }
}

/* ----------------------------------------------------------------- flow -- */

async function runStage(i) {
  const s = STAGES[i];
  return checkList(`${s.title} — ${s.blurb}`, s.features,
    `Stage ${i + 1} of ${STAGES.length} · Enter continues to ${i + 1 < STAGES.length ? 'stage ' + (i + 2) : 'review'}`);
}

async function wizard() {
  let i = 0;
  while (i < STAGES.length) {
    const r = await runStage(i);
    if (r === 'back') {
      if (i === 0) return;   // back out to the main menu
      i--;
    } else i++;
  }
  await reviewAndWrite();
}

async function mainMenu() {
  while (true) {
    const stageRows = STAGES.map((s, i) => {
      const on = s.features.filter((f) => f.on).length;
      return {
        label: pad(trunc(s.title.replace(/^Stage \d\/6 — /, `${i + 1}. `), 44), 45) +
          (on ? c.green + `${on}/${s.features.length}` + c.reset : c.gray + `0/${s.features.length}` + c.reset),
        hint: s.blurb,
      };
    });
    const items = [
      { label: c.magenta + '▶ Run 6-stage wizard' + c.reset, hint: 'walk stages 1→6 then review' },
      ...stageRows,
      { label: c.green + '✓ Review & write plan' + c.reset, hint: 'summary → sprints/proposals/' },
      { label: c.red + '✗ Quit' + c.reset },
    ];
    const idx = await selectMenu('Gap analysis: services/cortex vs standalone Exprsn-Cortex', items,
      'Selections seed a build plan for PM grooming — not tickets themselves');
    if (idx === 0) await wizard();
    else if (idx >= 1 && idx <= STAGES.length) await runStage(idx - 1);
    else if (idx === STAGES.length + 1) await reviewAndWrite();
    else if (idx === STAGES.length + 2 || idx === -1) {
      if (await confirm('Quit without writing?')) exitApp(0); else continue;
    }
  }
}

function exitApp(code) {
  out('\n');
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.exit(code);
}

function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('cortex-features-tui needs an interactive terminal.');
    process.exit(1);
  }
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  mainMenu().catch((e) => { console.error(e); exitApp(1); });
}

main();
