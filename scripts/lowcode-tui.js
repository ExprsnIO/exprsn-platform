#!/usr/bin/env node
'use strict';

/**
 * Exprsn Low-Code Studio — a terminal UI for designing a low-code platform
 * (entities, actions, workflows, triggers, integrations, roles, forms).
 *
 * Pure Node (readline + ANSI), no external deps. Arrow keys to move, Enter to
 * select, Esc to go back, Ctrl-C to quit. Answers are persisted to a spec JSON
 * you can later feed into a generator/scaffolder.
 *
 *   node scripts/lowcode-tui.js            # opens/creates ./lowcode-platform.spec.json
 *   node scripts/lowcode-tui.js my.json    # use a specific spec file
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
const W = 60;
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
  out('║' + center('◆  EXPRSN LOW-CODE STUDIO  ◆', W) + '║\n');
  out('╚' + line + '╝' + c.reset + '\n');
  if (sub) out('  ' + c.dim + sub + c.reset + '\n');
  out('\n');
}

// ─────────────────────────── input primitives ──────────────────────────────
function onCtrlC(key) { if (key && key.ctrl && key.name === 'c') { exitApp(0); } }

/** A scrollable single-choice menu. Resolves to selected index, or -1 on Esc. */
function selectMenu(title, items, footer) {
  const norm = items.map((it) => (typeof it === 'string' ? { label: it } : it));
  return new Promise((resolve) => {
    let idx = 0;
    const render = () => {
      clear();
      header(title);
      norm.forEach((it, i) => {
        const active = i === idx;
        const cursor = active ? c.cyan + '❯ ' : '  ';
        const label = active ? c.bold + c.white + it.label + c.reset : it.label;
        out('  ' + cursor + label + c.reset);
        if (it.hint) out('  ' + c.dim + trunc(it.hint, W - strip(it.label).length - 6) + c.reset);
        out('\n');
      });
      out('\n' + c.dim + '  ↑/↓ move · Enter select · 1-9 jump · Esc back · Ctrl-C quit' + c.reset);
      if (footer) out('\n' + c.dim + '  ' + footer + c.reset);
    };
    const onKey = (str, key) => {
      onCtrlC(key);
      if (key.name === 'up') { idx = (idx - 1 + norm.length) % norm.length; render(); }
      else if (key.name === 'down') { idx = (idx + 1) % norm.length; render(); }
      else if (key.name === 'return') { cleanup(); resolve(idx); }
      else if (key.name === 'escape') { cleanup(); resolve(-1); }
      else if (str && /^[1-9]$/.test(str)) {
        const n = parseInt(str, 10) - 1;
        if (n < norm.length) { idx = n; render(); }
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
function multiSelect(title, options, selected = []) {
  return new Promise((resolve) => {
    let idx = 0;
    const sel = new Set(selected);
    const render = () => {
      clear();
      header(title);
      options.forEach((opt, i) => {
        const active = i === idx;
        const box = sel.has(opt) ? c.green + '[x]' : c.gray + '[ ]';
        const cursor = active ? c.cyan + '❯ ' : '  ';
        const label = active ? c.bold + c.white + opt + c.reset : opt;
        out('  ' + cursor + box + c.reset + ' ' + label + c.reset + '\n');
      });
      out('\n' + c.dim + '  ↑/↓ move · Space toggle · Enter confirm · Esc cancel' + c.reset);
    };
    const onKey = (str, key) => {
      onCtrlC(key);
      if (key.name === 'up') { idx = (idx - 1 + options.length) % options.length; render(); }
      else if (key.name === 'down') { idx = (idx + 1) % options.length; render(); }
      else if (key.name === 'space') { const o = options[idx]; sel.has(o) ? sel.delete(o) : sel.add(o); render(); }
      else if (key.name === 'return') { cleanup(); resolve(options.filter((o) => sel.has(o))); }
      else if (key.name === 'escape') { cleanup(); resolve(null); }
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

// ──────────────────────────────── state ────────────────────────────────────
const SPEC_FILE = path.resolve(process.argv[2] || 'lowcode-platform.spec.json');

const blank = () => ({
  project: { name: 'My Platform', slug: 'my-platform', description: '', version: '0.1.0', runtime: 'node' },
  entities: [],
  actions: [],
  triggers: [],
  workflows: [],
  integrations: [],
  roles: [],
  forms: [],
});

let state = blank();

function load() {
  try {
    if (fs.existsSync(SPEC_FILE)) {
      const loaded = JSON.parse(fs.readFileSync(SPEC_FILE, 'utf8'));
      state = Object.assign(blank(), loaded);
    }
  } catch (e) {
    // start fresh on a corrupt file rather than crashing
  }
}

function save() {
  fs.writeFileSync(SPEC_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

// ─────────────────────────── generic record editor ─────────────────────────
function resolveOpts(field) {
  return typeof field.options === 'function' ? field.options() : field.options || [];
}

function displayVal(val, field) {
  if (val === undefined || val === null || val === '') return c.gray + '(empty)' + c.reset;
  if (Array.isArray(val)) return val.length ? c.yellow + val.join(', ') + c.reset : c.gray + '(none)' + c.reset;
  return c.yellow + String(val) + c.reset;
}

/**
 * Edit a record against a field schema. fields: [{ key, label, type, options, hint }]
 * type ∈ text | select | list | multiselect | nested
 * Returns the edited record, or null if cancelled.
 */
async function editRecord(initial, fields, titlePrefix) {
  const draft = JSON.parse(JSON.stringify(initial || {}));
  const nameKey = fields[0].key;
  while (true) {
    const menu = fields.map((f) => ({
      label: pad(f.label, 16) + ' ' + displayVal(draft[f.key], f),
      hint: f.hint,
    }));
    menu.push({ label: c.green + '✓ Save' + c.reset });
    menu.push({ label: c.red + '✗ Cancel' + c.reset });
    const title = `${titlePrefix} · ${draft[nameKey] || c.gray + 'new' + c.reset}`;
    const choice = await selectMenu(title, menu);

    if (choice === -1 || choice === fields.length + 1) return null;
    if (choice === fields.length) {
      if (!draft[nameKey]) { await toast(c.red + 'A name is required.' + c.reset); continue; }
      return draft;
    }

    const f = fields[choice];
    if (f.type === 'text') {
      const v = await textInput(f.label, draft[f.key] || '', f.hint);
      if (v !== null) draft[f.key] = v;
    } else if (f.type === 'select') {
      const opts = resolveOpts(f);
      if (!opts.length) { await toast(c.yellow + 'Define some ' + f.label + ' first.' + c.reset); continue; }
      const i = await selectMenu('Choose ' + f.label, opts);
      if (i >= 0) draft[f.key] = opts[i];
    } else if (f.type === 'list') {
      const cur = Array.isArray(draft[f.key]) ? draft[f.key].join(', ') : '';
      const v = await textInput(f.label, cur, 'comma-separated values');
      if (v !== null) draft[f.key] = v.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (f.type === 'multiselect') {
      const opts = resolveOpts(f);
      if (!opts.length) { await toast(c.yellow + 'Nothing to choose from yet.' + c.reset); continue; }
      const v = await multiSelect(f.label, opts, draft[f.key] || []);
      if (v !== null) draft[f.key] = v;
    } else if (f.type === 'nested') {
      draft[f.key] = await manageCollection(f.label, draft[f.key] || [], f.fields, f.summary);
    }
  }
}

/**
 * Add/edit/delete a collection of records in place. Returns the (possibly new)
 * array so it also works for nested collections.
 */
async function manageCollection(title, list, fields, summary) {
  const items = Array.isArray(list) ? list : [];
  while (true) {
    const menu = items.map((it, i) => ({ label: `${c.cyan}${i + 1}.${c.reset} ${summary(it)}` }));
    menu.push({ label: c.green + '＋ Add new' + c.reset });
    const choice = await selectMenu(`${title}  ${c.dim}(${items.length})${c.reset}`, menu,
      'Select an item to edit/delete · Esc when done');

    if (choice === -1) return items;
    if (choice === items.length) {
      const rec = await editRecord({}, fields, title);
      if (rec) items.push(rec);
      continue;
    }
    // edit/delete an existing item
    const sub = await selectMenu(summary(items[choice]), ['Edit', c.red + 'Delete' + c.reset, 'Back']);
    if (sub === 0) {
      const rec = await editRecord(items[choice], fields, title);
      if (rec) items[choice] = rec;
    } else if (sub === 1) {
      if (await confirm('Delete this item?')) items.splice(choice, 1);
    }
  }
}

// ───────────────────────── field schemas (the "low-code" model) ────────────
const FIELD_TYPES = ['string', 'text', 'integer', 'decimal', 'boolean', 'date', 'datetime', 'json', 'uuid', 'enum', 'relation'];
const ACTION_TYPES = ['http.request', 'db.create', 'db.update', 'db.delete', 'email.send', 'notify.push', 'queue.publish', 'script.run', 'webhook'];
const EVENT_TYPES = ['entity.created', 'entity.updated', 'entity.deleted', 'schedule.cron', 'webhook.received', 'user.login', 'manual'];
const INTEGRATION_KINDS = ['rest-api', 'graphql', 'postgres', 'redis', 'rabbitmq', 'smtp', 's3', 'webhook'];
const AUTH_MODES = ['none', 'api-key', 'bearer', 'basic', 'oauth2', 'hmac'];
const PERMISSIONS = ['read', 'create', 'update', 'delete', 'publish', 'approve', 'admin'];
const FORM_LAYOUTS = ['single-column', 'two-column', 'wizard', 'inline', 'modal'];

const entityFieldSchema = [
  { key: 'name', label: 'Field name', type: 'text', hint: 'e.g. title, ownerId' },
  { key: 'type', label: 'Type', type: 'select', options: FIELD_TYPES },
  { key: 'required', label: 'Required', type: 'select', options: ['yes', 'no'] },
  { key: 'default', label: 'Default', type: 'text' },
];

const entitySchema = [
  { key: 'name', label: 'Entity name', type: 'text', hint: 'e.g. Invoice, Ticket' },
  { key: 'description', label: 'Description', type: 'text' },
  {
    key: 'fields', label: 'Fields', type: 'nested', fields: entityFieldSchema,
    summary: (f) => `${c.white}${f.name || '?'}${c.reset} ${c.dim}:${c.reset} ${c.yellow}${f.type || 'string'}${c.reset}${f.required === 'yes' ? c.red + ' *' + c.reset : ''}`,
  },
];

const actionSchema = [
  { key: 'name', label: 'Action name', type: 'text', hint: 'e.g. notifyOwner' },
  { key: 'type', label: 'Type', type: 'select', options: ACTION_TYPES },
  { key: 'target', label: 'Target', type: 'text', hint: 'url / entity / queue / channel' },
  { key: 'description', label: 'Description', type: 'text' },
];

const triggerSchema = [
  { key: 'name', label: 'Trigger name', type: 'text', hint: 'e.g. onNewTicket' },
  { key: 'event', label: 'Event', type: 'select', options: EVENT_TYPES },
  { key: 'entity', label: 'Entity', type: 'select', options: () => state.entities.map((e) => e.name) },
  { key: 'condition', label: 'Condition', type: 'text', hint: 'e.g. status == "open"' },
];

const workflowStepSchema = [
  { key: 'action', label: 'Run action', type: 'select', options: () => state.actions.map((a) => a.name) },
  { key: 'onError', label: 'On error', type: 'select', options: ['stop', 'continue', 'retry'] },
  { key: 'note', label: 'Note', type: 'text' },
];

const workflowSchema = [
  { key: 'name', label: 'Workflow name', type: 'text', hint: 'e.g. triageTicket' },
  { key: 'trigger', label: 'Trigger', type: 'select', options: () => state.triggers.map((t) => t.name) },
  { key: 'description', label: 'Description', type: 'text' },
  {
    key: 'steps', label: 'Steps', type: 'nested', fields: workflowStepSchema,
    summary: (s) => `${c.white}${s.action || '(pick action)'}${c.reset} ${c.dim}→ ${s.onError || 'stop'}${c.reset}`,
  },
];

const integrationSchema = [
  { key: 'name', label: 'Integration', type: 'text', hint: 'e.g. StripeAPI' },
  { key: 'kind', label: 'Kind', type: 'select', options: INTEGRATION_KINDS },
  { key: 'baseUrl', label: 'Base URL / DSN', type: 'text' },
  { key: 'auth', label: 'Auth', type: 'select', options: AUTH_MODES },
];

const roleSchema = [
  { key: 'name', label: 'Role name', type: 'text', hint: 'e.g. editor, agent' },
  { key: 'permissions', label: 'Permissions', type: 'multiselect', options: PERMISSIONS },
  { key: 'entities', label: 'Scoped to', type: 'multiselect', options: () => state.entities.map((e) => e.name) },
];

const formSchema = [
  { key: 'name', label: 'Form name', type: 'text', hint: 'e.g. NewTicketForm' },
  { key: 'entity', label: 'Entity', type: 'select', options: () => state.entities.map((e) => e.name) },
  { key: 'layout', label: 'Layout', type: 'select', options: FORM_LAYOUTS },
  { key: 'fields', label: 'Fields shown', type: 'list', hint: 'field names to display' },
];

// ─────────────────────────────── screens ───────────────────────────────────
async function screenProject() {
  const fields = [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'slug', label: 'Slug', type: 'text', hint: 'kebab-case id' },
    { key: 'description', label: 'Description', type: 'text' },
    { key: 'version', label: 'Version', type: 'text' },
    { key: 'runtime', label: 'Runtime', type: 'select', options: ['node', 'python', 'edge'] },
  ];
  const rec = await editRecord(state.project, fields, 'Project Settings');
  if (rec) state.project = rec;
}

const entSummary = (e) => `${c.white}${e.name}${c.reset} ${c.dim}— ${(e.fields || []).length} field(s)${c.reset}`;
const actSummary = (a) => `${c.white}${a.name}${c.reset} ${c.dim}[${a.type || '?'}]${c.reset}`;
const trgSummary = (t) => `${c.white}${t.name}${c.reset} ${c.dim}on ${t.event || '?'}${c.reset}`;
const wfSummary = (w) => `${c.white}${w.name}${c.reset} ${c.dim}— ${(w.steps || []).length} step(s)${c.reset}`;
const intSummary = (i) => `${c.white}${i.name}${c.reset} ${c.dim}[${i.kind || '?'}]${c.reset}`;
const roleSummary = (r) => `${c.white}${r.name}${c.reset} ${c.dim}— ${(r.permissions || []).join('/') || 'no perms'}${c.reset}`;
const formSummary = (f) => `${c.white}${f.name}${c.reset} ${c.dim}→ ${f.entity || '?'}${c.reset}`;

async function screenReview() {
  while (true) {
    const s = state;
    const rows = [
      `Project      ${c.yellow}${s.project.name}${c.reset} ${c.dim}v${s.project.version} (${s.project.runtime})${c.reset}`,
      `Entities     ${c.yellow}${s.entities.length}${c.reset}`,
      `Actions      ${c.yellow}${s.actions.length}${c.reset}`,
      `Triggers     ${c.yellow}${s.triggers.length}${c.reset}`,
      `Workflows    ${c.yellow}${s.workflows.length}${c.reset}`,
      `Integrations ${c.yellow}${s.integrations.length}${c.reset}`,
      `Roles        ${c.yellow}${s.roles.length}${c.reset}`,
      `Forms        ${c.yellow}${s.forms.length}${c.reset}`,
    ];
    clear();
    header('Review & Export');
    rows.forEach((r) => out('  ' + r + '\n'));
    out('\n  ' + c.dim + 'Spec file: ' + SPEC_FILE + c.reset + '\n');
    const i = await selectMenu('', [
      c.green + '💾 Save spec to disk' + c.reset,
      'Print JSON to screen',
      'Back',
    ]);
    if (i === 0) { save(); await toast(c.green + 'Saved → ' + SPEC_FILE + c.reset); }
    else if (i === 1) {
      clear(); header('Spec JSON');
      out(JSON.stringify(state, null, 2) + '\n\n');
      await selectMenu('', [c.green + 'OK' + c.reset]);
    } else return;
  }
}

async function mainMenu() {
  while (true) {
    const choice = await selectMenu('Main Menu — design your low-code platform', [
      { label: '1 · Project Settings', hint: 'name, slug, runtime' },
      { label: '2 · Entities / Data Models', hint: `${state.entities.length} defined` },
      { label: '3 · Actions', hint: `${state.actions.length} defined` },
      { label: '4 · Triggers & Events', hint: `${state.triggers.length} defined` },
      { label: '5 · Workflows', hint: `${state.workflows.length} defined` },
      { label: '6 · Integrations / Connectors', hint: `${state.integrations.length} defined` },
      { label: '7 · Roles & Permissions', hint: `${state.roles.length} defined` },
      { label: '8 · Forms & Views', hint: `${state.forms.length} defined` },
      { label: '9 · Review & Export', hint: 'summary + save JSON' },
      { label: c.green + '   Save & Quit' + c.reset },
      { label: c.red + '   Quit without saving' + c.reset },
    ], 'Your work auto-saves on "Save & Quit" and on the Review screen.');

    switch (choice) {
      case 0: await screenProject(); break;
      case 1: state.entities = await manageCollection('Entities', state.entities, entitySchema, entSummary); break;
      case 2: state.actions = await manageCollection('Actions', state.actions, actionSchema, actSummary); break;
      case 3: state.triggers = await manageCollection('Triggers & Events', state.triggers, triggerSchema, trgSummary); break;
      case 4: state.workflows = await manageCollection('Workflows', state.workflows, workflowSchema, wfSummary); break;
      case 5: state.integrations = await manageCollection('Integrations', state.integrations, integrationSchema, intSummary); break;
      case 6: state.roles = await manageCollection('Roles & Permissions', state.roles, roleSchema, roleSummary); break;
      case 7: state.forms = await manageCollection('Forms & Views', state.forms, formSchema, formSummary); break;
      case 8: await screenReview(); break;
      case 9: save(); await done('Saved → ' + SPEC_FILE); return;
      case 10: case -1:
        if (await confirm('Quit without saving changes?')) { await done('No changes saved.'); return; }
        break;
    }
  }
}

async function done(msg) {
  clear();
  header('Goodbye');
  out('  ' + c.green + msg + c.reset + '\n\n');
}

// ─────────────────────────────── bootstrap ─────────────────────────────────
function exitApp(code) {
  try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch (e) { /* noop */ }
  out(c.reset + '\n');
  process.exit(code || 0);
}

async function main() {
  if (!process.stdin.isTTY) {
    console.error('This TUI needs an interactive terminal (TTY). Run it directly in your shell.');
    process.exit(1);
  }
  load();
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
