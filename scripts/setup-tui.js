#!/usr/bin/env node
'use strict';

/**
 * Exprsn Platform Setup — a terminal UI for configuring every tunable surface
 * of the unified platform, section by section, into a grouped, commented .env.
 *
 * Pure Node (readline + ANSI), no external deps — same house style as
 * scripts/lowcode-tui.js. Arrow keys to move, Enter to select, Esc to go back,
 * Ctrl-C to quit.
 *
 *   npm run setup                    # edits ./.env (seeded from .env.example)
 *   node scripts/setup-tui.js x.env  # use a specific env file
 *
 * The field schema below must stay in step with src/config/index.js and
 * .env.example — those two are the source of truth for keys and defaults.
 * Unknown keys found in an existing .env are preserved verbatim.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

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

function header(sub) {
  const line = '═'.repeat(W);
  out(c.cyan + c.bold + '╔' + line + '╗\n');
  out('║' + center('◆  EXPRSN PLATFORM SETUP  ◆', W) + '║\n');
  out('╚' + line + '╝' + c.reset + '\n');
  if (sub) out('  ' + c.dim + trunc(sub, W) + c.reset + '\n');
  out('\n');
}

// ─────────────────────────── input primitives ──────────────────────────────
function onCtrlC(key) { if (key && key.ctrl && key.name === 'c') { exitApp(0); } }

/** A scrollable single-choice menu. Resolves to selected index, or -1 on Esc. */
function selectMenu(title, items, footer) {
  const norm = items.map((it) => (typeof it === 'string' ? { label: it } : it));
  return new Promise((resolve) => {
    let idx = 0;
    let top = 0;
    const page = Math.max(6, (process.stdout.rows || 30) - 12);
    const render = () => {
      clear();
      header(title);
      if (idx < top) top = idx;
      if (idx >= top + page) top = idx - page + 1;
      if (top > 0) out(c.dim + '  ⋮\n' + c.reset);
      norm.slice(top, top + page).forEach((it, vi) => {
        const i = top + vi;
        const active = i === idx;
        const cursor = active ? c.cyan + '❯ ' : '  ';
        const label = active ? c.bold + c.white + it.label + c.reset : it.label;
        out('  ' + cursor + label + c.reset);
        if (it.hint) out('  ' + c.dim + trunc(it.hint, W - strip(it.label).length - 6) + c.reset);
        out('\n');
      });
      if (top + page < norm.length) out(c.dim + '  ⋮\n' + c.reset);
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
      header('Edit value');
      out('  ' + c.cyan + label + c.reset + '\n');
      if (hint) out('  ' + c.dim + trunc(hint, W) + c.reset + '\n');
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

// ─────────────────────────────── helpers ───────────────────────────────────
const genHex = (bytes) => crypto.randomBytes(bytes).toString('hex');
const isPort = (v) => /^\d+$/.test(v) && +v >= 0 && +v <= 65535;
const isNum = (v) => /^\d+$/.test(v);
const isFrac = (v) => /^(0|1|0?\.\d+)$/.test(v);
const PLACEHOLDERS = new Set(['change_me', 'changeme', 'secret', 'password', '']);

// ─────────────────────────── field schema ───────────────────────────────────
// type: text | secret | bool | enum | port | num
// def: default written when the user leaves the field untouched ('' = omit/blank)
// gen: byte-length for one-key hex secret generation
// check(v): return an error string, or null when valid
const SECTIONS = [
  {
    key: 'edge', title: 'HTTPS edge & CORS', comment: 'HTTPS edge (the ONLY exposed port)',
    fields: [
      { env: 'NODE_ENV', label: 'Environment', type: 'enum', options: ['development', 'production', 'test'], def: 'development' },
      { env: 'HOST', label: 'Bind host', type: 'text', def: '0.0.0.0' },
      { env: 'HTTPS_PORT', label: 'HTTPS port', type: 'port', def: '8443' },
      { env: 'HTTP_REDIRECT_PORT', label: 'HTTP→HTTPS redirect port', type: 'port', def: '8080', hint: '0 disables the plain-HTTP 301 redirector' },
      { env: 'PUBLIC_HOST', label: 'Public host', type: 'text', def: 'localhost:8443', hint: 'host:port the platform is reachable at (builds baseUrl)' },
      { env: 'CORS_ORIGIN', label: 'CORS origins', type: 'text', def: '', hint: 'comma-separated browser origins; unset/* = same-origin only (wildcards never honored with credentials)' },
      { env: 'TRUST_PROXY', label: 'Trust proxy', type: 'bool', def: 'false', hint: 'true only behind a trusted reverse proxy (nginx edge)' },
      { env: 'PUBLIC_BASE_URL', label: 'Public base URL', type: 'text', def: '', hint: 'sandbox-broker callback base; default https://localhost:<HTTPS_PORT>' },
      { env: 'PLATFORM_ORG_SLUG', label: 'Platform org slug', type: 'text', def: '', hint: 'org whose settings govern anonymous signup (FEAT-033); default platform' },
    ],
  },
  {
    key: 'tls', title: 'TLS', comment: 'TLS',
    fields: [
      { env: 'TLS_ENABLED', label: 'TLS enabled', type: 'bool', def: 'true' },
      { env: 'TLS_CERT_PATH', label: 'Certificate path', type: 'text', def: './certs/platform.crt', hint: 'dev: npm run gen:certs creates a self-signed pair' },
      { env: 'TLS_KEY_PATH', label: 'Key path', type: 'text', def: './certs/platform.key' },
      { env: 'TLS_CA_PATH', label: 'CA bundle path', type: 'text', def: '', hint: 'optional' },
    ],
  },
  {
    key: 'db', title: 'PostgreSQL', comment: 'Single Postgres database (per-module schemas)',
    fields: [
      { env: 'DB_HOST', label: 'Host', type: 'text', def: 'localhost' },
      { env: 'DB_PORT', label: 'Port', type: 'port', def: '5432' },
      { env: 'DB_NAME', label: 'Database', type: 'text', def: 'exprsn' },
      { env: 'DB_USER', label: 'User', type: 'text', def: 'exprsn' },
      { env: 'DB_PASSWORD', label: 'Password', type: 'secret', def: 'change_me' },
      { env: 'DB_SSL', label: 'SSL', type: 'bool', def: 'false' },
      { env: 'DB_SSL_REJECT_UNAUTHORIZED', label: 'SSL verify server cert', type: 'bool', def: '', hint: 'default true when DB_SSL=true; false is an explicit unsafe opt-out' },
      { env: 'DB_SSL_CA', label: 'SSL CA bundle', type: 'text', def: '' },
      { env: 'DB_POOL_MIN', label: 'Pool min', type: 'num', def: '2' },
      { env: 'DB_POOL_MAX', label: 'Pool max', type: 'num', def: '20' },
      { env: 'DB_LOGGING', label: 'Query logging', type: 'bool', def: 'false' },
    ],
  },
  {
    key: 'redis', title: 'Redis', comment: 'Shared Redis',
    fields: [
      { env: 'REDIS_HOST', label: 'Host', type: 'text', def: 'localhost' },
      { env: 'REDIS_PORT', label: 'Port', type: 'port', def: '6379' },
      { env: 'REDIS_PASSWORD', label: 'Password', type: 'secret', def: '' },
      { env: 'REDIS_DB', label: 'DB number', type: 'num', def: '0' },
    ],
  },
  {
    key: 'secrets', title: 'Auth & service secrets', comment: 'Auth / identity / service-to-service secrets',
    fields: [
      { env: 'SERVICE_TOKEN_SECRET', label: 'Service token secret', type: 'secret', def: '', gen: 48, hint: 'REQUIRED, >= 32 chars — per-service HMAC tokens derive from it', check: (v) => (v && v.length < 32 ? 'must be >= 32 chars' : null) },
      { env: 'SERVICE_ID', label: 'Service identity', type: 'text', def: 'platform', hint: 'X-Service-ID this process presents on outbound CA calls' },
      { env: 'SERVICE_TOKEN_LEGACY_ALLOW', label: 'Allow legacy static token', type: 'bool', def: '', hint: 'migration-only; remove once all services use SERVICE_TOKEN_SECRET' },
      { env: 'SERVICE_TOKEN', label: 'Legacy static token', type: 'secret', def: '', hint: 'only honored while legacy-allow is true' },
      { env: 'JWT_SECRET', label: 'JWT secret', type: 'secret', def: 'change_me', gen: 32, check: (v) => (v && v.length < 32 ? 'must be >= 32 chars' : null) },
      { env: 'SESSION_SECRET', label: 'Session secret', type: 'secret', def: 'change_me', gen: 32, check: (v) => (v && v.length < 32 ? 'must be >= 32 chars' : null) },
      { env: 'OIDC_ISSUER', label: 'OIDC issuer', type: 'text', def: 'https://localhost:8443/auth' },
      { env: 'TIMELINE_APPROVAL_WEBHOOK_SECRET', label: 'Timeline approval webhook secret', type: 'secret', def: '', gen: 32, hint: 'fallback when the persisted admin setting is empty' },
      { env: 'MODERATOR_WEBHOOK_SECRET', label: 'Moderator webhook secret', type: 'secret', def: '', gen: 32, hint: 'fails closed: endpoint 503s when unset' },
      { env: 'HERALD_ENABLED', label: 'Timeline→moderator notifications', type: 'bool', def: '', hint: 'false disables the herald bridge (default on)' },
    ],
  },
  {
    key: 'devbypass', title: 'Dev auth bypass (fail-closed)', comment: 'Development auth bypass (FAIL-CLOSED; never enable in production)',
    fields: [
      { env: 'DEV_BYPASS', label: 'Dev bypass', type: 'bool', def: '', hint: 'only works with NODE_ENV=development + secret header + loopback' },
      { env: 'DEV_BYPASS_SECRET', label: 'Dev bypass secret', type: 'secret', def: '', gen: 32, hint: 'sent as x-dev-bypass-secret; >= 32 chars', check: (v) => (v && v.length < 32 ? 'must be >= 32 chars' : null) },
    ],
  },
  {
    key: 'obs', title: 'Observability', comment: 'Observability (SP-5 / R3)',
    fields: [
      { env: 'METRICS_ENABLED', label: 'Prometheus /metrics', type: 'bool', def: 'true' },
      { env: 'METRICS_TOKEN', label: 'Metrics bearer token', type: 'secret', def: '', gen: 32, hint: 'unset = open; network-restrict the endpoint instead' },
      { env: 'SENTRY_DSN', label: 'Sentry DSN', type: 'text', def: '', hint: 'also requires: npm install @sentry/node' },
      { env: 'SENTRY_TRACES_SAMPLE_RATE', label: 'Sentry traces sample rate', type: 'text', def: '', check: (v) => (v && !isFrac(v) ? 'must be a fraction 0..1' : null) },
    ],
  },
  {
    key: 'email', title: 'Email (auth / moderator)', comment: 'Email (auth / moderator)',
    fields: [
      { env: 'SMTP_HOST', label: 'SMTP host', type: 'text', def: '' },
      { env: 'SMTP_PORT', label: 'SMTP port', type: 'port', def: '587' },
      { env: 'SMTP_USER', label: 'SMTP user', type: 'text', def: '' },
      { env: 'SMTP_PASSWORD', label: 'SMTP password', type: 'secret', def: '' },
      { env: 'SENDGRID_API_KEY', label: 'SendGrid API key', type: 'secret', def: '' },
      { env: 'MAILGUN_API_KEY', label: 'Mailgun API key', type: 'secret', def: '' },
    ],
  },
  {
    key: 'oauth', title: 'OAuth providers', comment: 'OAuth providers (optional)',
    fields: [
      { env: 'GOOGLE_CLIENT_ID', label: 'Google client id', type: 'text', def: '' },
      { env: 'GOOGLE_CLIENT_SECRET', label: 'Google client secret', type: 'secret', def: '' },
      { env: 'GITHUB_CLIENT_ID', label: 'GitHub client id', type: 'text', def: '' },
      { env: 'GITHUB_CLIENT_SECRET', label: 'GitHub client secret', type: 'secret', def: '' },
    ],
  },
  {
    key: 'ai', title: 'AI providers (moderator)', comment: 'Moderator AI providers',
    fields: [
      { env: 'DEFAULT_AI_PROVIDER', label: 'Default provider', type: 'enum', options: ['claude', 'openai', 'cortex'], def: '', hint: 'cortex also needs CORTEX_ENABLED + CORTEX_MODERATION_MODE=enforce' },
      { env: 'CLAUDE_ENABLED', label: 'Claude enabled', type: 'bool', def: '' },
      { env: 'CLAUDE_API_KEY', label: 'Claude API key', type: 'secret', def: '' },
      { env: 'CLAUDE_MODEL', label: 'Claude model', type: 'text', def: '', hint: 'moderator default: claude-3-5-sonnet-20241022' },
      { env: 'ANTHROPIC_API_KEY', label: 'Anthropic API key', type: 'secret', def: '', hint: 'generic key some modules read directly' },
      { env: 'OPENAI_ENABLED', label: 'OpenAI enabled', type: 'bool', def: '' },
      { env: 'OPENAI_API_KEY', label: 'OpenAI API key', type: 'secret', def: '' },
      { env: 'OPENAI_MODEL', label: 'OpenAI model', type: 'text', def: '' },
      { env: 'OPENAI_MODERATION_MODEL', label: 'OpenAI moderation model', type: 'text', def: '' },
    ],
  },
  {
    key: 'storage', title: 'FileVault storage', comment: 'FileVault storage',
    fields: [
      { env: 'S3_ENDPOINT', label: 'S3 endpoint', type: 'text', def: '' },
      { env: 'S3_BUCKET', label: 'S3 bucket', type: 'text', def: '' },
      { env: 'AWS_ACCESS_KEY_ID', label: 'AWS access key id', type: 'text', def: '' },
      { env: 'AWS_SECRET_ACCESS_KEY', label: 'AWS secret access key', type: 'secret', def: '' },
      { env: 'AWS_REGION', label: 'AWS region', type: 'text', def: 'us-east-1' },
      { env: 'IPFS_API_URL', label: 'IPFS API URL', type: 'text', def: '' },
    ],
  },
  {
    key: 'search', title: 'Elasticsearch', comment: 'Elasticsearch (spark / timeline / filevault)',
    fields: [
      { env: 'ELASTICSEARCH_NODE', label: 'Node URL', type: 'text', def: 'http://localhost:9200' },
      { env: 'ELASTICSEARCH_USERNAME', label: 'Username', type: 'text', def: '' },
      { env: 'ELASTICSEARCH_PASSWORD', label: 'Password', type: 'secret', def: '' },
    ],
  },
  {
    key: 'rabbit', title: 'RabbitMQ', comment: 'RabbitMQ (extras broker)',
    fields: [
      { env: 'RABBITMQ_ENABLED', label: 'Enabled', type: 'bool', def: 'true' },
      { env: 'RABBITMQ_HOST', label: 'Host', type: 'text', def: 'localhost' },
      { env: 'RABBITMQ_PORT', label: 'AMQP port', type: 'port', def: '5672' },
      { env: 'RABBITMQ_MGMT_PORT', label: 'Management port', type: 'port', def: '15672' },
      { env: 'RABBITMQ_USER', label: 'User', type: 'text', def: 'exprsn' },
      { env: 'RABBITMQ_PASSWORD', label: 'Password', type: 'secret', def: 'change_me' },
    ],
  },
  {
    key: 'live', title: 'Live streaming', comment: 'Live streaming (Cloudflare)',
    fields: [
      { env: 'CLOUDFLARE_ACCOUNT_ID', label: 'Cloudflare account id', type: 'text', def: '' },
      { env: 'CLOUDFLARE_STREAM_TOKEN', label: 'Cloudflare stream token', type: 'secret', def: '' },
    ],
  },
  {
    key: 'atproto', title: 'AT-Proto / Bluesky bridge', comment: 'AT-Protocol / Bluesky bridge (atproto module + worker:atproto)',
    fields: [
      { env: 'ATPROTO_ENABLED', label: 'Bridge enabled', type: 'bool', def: 'false', hint: 'master switch; ops endpoints load regardless. Needs worker:atproto' },
      { env: 'ATPROTO_FIREHOSE_TRANSPORT', label: 'Firehose transport', type: 'enum', options: ['jetstream', 'subscribeRepos'], def: 'jetstream' },
      { env: 'ATPROTO_JETSTREAM_URL', label: 'Jetstream URL', type: 'text', def: 'wss://jetstream2.us-east.bsky.network/subscribe' },
      { env: 'ATPROTO_RELAY_URL', label: 'Relay URL', type: 'text', def: 'wss://bsky.network/xrpc/com.atproto.sync.subscribeRepos' },
      { env: 'ATPROTO_WANTED_COLLECTIONS', label: 'Wanted collections', type: 'text', def: 'app.bsky.feed.post', hint: 'comma-separated lexicon collections to ingest' },
      { env: 'ATPROTO_SAMPLE_RATE', label: 'Sample rate (0..1)', type: 'text', def: '1', hint: 'the full firehose is millions/day', check: (v) => (v && !isFrac(v) ? 'must be a fraction 0..1' : null) },
      { env: 'ATPROTO_AUTHOR_ALLOWLIST', label: 'Author DID allowlist', type: 'text', def: '' },
      { env: 'ATPROTO_BACKPRESSURE_HIGH', label: 'Backpressure high-water', type: 'num', def: '5000' },
      { env: 'ATPROTO_BACKPRESSURE_LOW', label: 'Backpressure low-water', type: 'num', def: '1000' },
      { env: 'ATPROTO_CURSOR_PERSIST_EVERY', label: 'Cursor persist every N', type: 'num', def: '200' },
      { env: 'ATPROTO_BRIDGE_CONCURRENCY', label: 'Bridge concurrency', type: 'num', def: '4' },
      { env: 'ATPROTO_SUBSCRIBE_LABELERS', label: 'Subscribe labelers', type: 'text', def: '', hint: 'comma-separated labeler DIDs or wss:// subscribeLabels URLs' },
      { env: 'ATPROTO_CONSUME_REQUIRE_VERIFIED', label: 'Require verified labels', type: 'bool', def: 'false' },
      { env: 'ATPROTO_TRUSTED_LABELERS', label: 'Trusted labelers', type: 'text', def: '', hint: 'subset whose verified labels drive auto-action' },
      { env: 'ATPROTO_AUTOACTION_VALUES', label: 'Auto-action label values', type: 'text', def: '!hide,porn,sexual,nudity,csam,child-sexual-abuse-material' },
      { env: 'ATPROTO_APPVIEW_URL', label: 'AppView URL', type: 'text', def: 'https://public.api.bsky.app' },
      { env: 'ATPROTO_DID_METHOD', label: 'Labeler DID method', type: 'enum', options: ['exprsn', 'web', 'plc'], def: 'exprsn', hint: 'run npm run atproto:provision to mint an identity' },
      { env: 'ATPROTO_DID', label: 'Pre-created DID', type: 'text', def: '', hint: 'only for did:plc; leave unset for exprsn/web' },
      { env: 'ATPROTO_LABELER_HOST', label: 'Labeler public host', type: 'text', def: 'localhost:8443' },
      { env: 'ATPROTO_LABEL_VALUES', label: 'Declared label values', type: 'text', def: 'spam,nsfw,toxic,hate,violence,!warn,!hide' },
      { env: 'ATPROTO_SIGNING_KEY', label: 'Labeler signing key', type: 'secret', def: '', hint: 'printed by atproto:provision; NEVER commit; prefer vault/KMS in prod' },
      { env: 'ATPROTO_USER_DID_SECRET', label: 'User-DID derivation secret', type: 'secret', def: '', gen: 32, hint: 'falls back to SERVICE_TOKEN_SECRET; changing it re-keys every did:exprsn' },
      { env: 'ATPROTO_PDS_URL', label: 'PDS URL (plc only)', type: 'text', def: '' },
      { env: 'ATPROTO_PDS_HANDLE', label: 'PDS handle (plc only)', type: 'text', def: '' },
      { env: 'ATPROTO_PDS_PASSWORD', label: 'PDS password (plc only)', type: 'secret', def: '' },
      { env: 'ATPROTO_PLC_TOKEN', label: 'PLC email token (plc only)', type: 'secret', def: '' },
      { env: 'ATPROTO_PLC_DIRECTORY_URL', label: 'PLC directory URL', type: 'text', def: 'https://plc.directory' },
      { env: 'ATPROTO_SIGNING_KEY_REF', label: 'Signing key env-var name', type: 'text', def: 'ATPROTO_SIGNING_KEY', hint: 'name of the env var holding the hex private key' },
      { env: 'ATPROTO_PDS_MAX_BODY_BYTES', label: 'PDS max body (bytes)', type: 'num', def: '1000000', hint: 'DoS guard' },
      { env: 'ATPROTO_APPVIEW_MAX_BODY_BYTES', label: 'AppView max body (bytes)', type: 'num', def: '1000000' },
      { env: 'ATPROTO_LABEL_WS_MAX_PAYLOAD', label: 'Label ws max payload (bytes)', type: 'num', def: '1000000' },
      { env: 'ATPROTO_FEED_RKEY', label: 'Feed generator rkey', type: 'text', def: 'exprsn-clean' },
      { env: 'ATPROTO_FEED_NAME', label: 'Feed name', type: 'text', def: 'Exprsn Clean' },
      { env: 'ATPROTO_FEED_DESCRIPTION', label: 'Feed description', type: 'text', def: 'Exprsn-moderated feed: ingested posts carrying our moderation labels, with hidden content removed.' },
    ],
  },
  {
    key: 'ext', title: 'Plugins & low-code', comment: 'Extensibility framework (plugins + low-code) — default OFF, load inert',
    fields: [
      { env: 'PLUGINS_ENABLED', label: 'Plugins', type: 'bool', def: 'false' },
      { env: 'PLUGINS_SCRIPT_ENABLED', label: 'Sandboxed script plugins', type: 'bool', def: 'false', hint: 'highest-risk surface; gated separately from PLUGINS_ENABLED' },
      { env: 'PLUGINS_WEBHOOK_ALLOW_PRIVATE', label: 'Webhooks to private ranges', type: 'bool', def: 'false', hint: 'dev only — SSRF' },
      { env: 'PLUGINS_WEBHOOK_ATTEMPTS', label: 'Webhook delivery attempts', type: 'num', def: '' },
      { env: 'PLUGINS_WEBHOOK_BREAKER_THRESHOLD', label: 'Webhook breaker threshold', type: 'num', def: '' },
      { env: 'PLUGINS_WEBHOOK_BREAKER_COOLDOWN_MS', label: 'Webhook breaker cooldown (ms)', type: 'num', def: '' },
      { env: 'PLUGINS_MAX_DISPATCH_DEPTH', label: 'Hook-bus max dispatch depth', type: 'num', def: '', hint: 're-entrancy guard against plugin event storms' },
      { env: 'LOWCODE_ENABLED', label: 'Low-code builder', type: 'bool', def: 'false' },
      { env: 'LOWCODE_CORTEX_TIMEOUT_MS', label: 'Lowcode cortex-action timeout (ms)', type: 'num', def: '', hint: 'fails soft' },
      { env: 'LOWCODE_AI_FIELD_TIMEOUT_MS', label: 'Lowcode AI-field timeout (ms)', type: 'num', def: '', hint: 'fails soft' },
    ],
  },
  {
    key: 'cortex', title: 'Cortex (local LLM)', comment: 'Cortex (local-LLM agents / guardrails, FEAT-021) — default OFF, loads inert',
    fields: [
      { env: 'CORTEX_ENABLED', label: 'Cortex module', type: 'bool', def: 'false', hint: 'needs worker:cortex + a llama.cpp router' },
      { env: 'CORTEX_LLM_BASE_URL', label: 'LLM base URL', type: 'text', def: '', hint: 'OpenAI-compatible router; default http://127.0.0.1:8080/v1' },
      { env: 'CORTEX_BRAIN_MODEL', label: 'Brain model', type: 'text', def: '', hint: 'default qwen3-30b-a3b' },
      { env: 'CORTEX_JUDGE_MODEL', label: 'Judge model', type: 'text', def: '', hint: 'defaults to the brain model' },
      { env: 'CORTEX_DATA_DIR', label: 'Data dir', type: 'text', def: '', hint: 'default ./data/cortex' },
      { env: 'CORTEX_TASK_CONCURRENCY', label: 'Task concurrency', type: 'num', def: '' },
      { env: 'CORTEX_LLM_CONCURRENCY', label: 'LLM concurrency', type: 'num', def: '' },
      { env: 'CORTEX_VISION_MODEL', label: 'Vision model', type: 'text', def: '', hint: 'unset = vision off; must advertise image input (FEAT-030)' },
      { env: 'CORTEX_VISION_CONCURRENCY', label: 'Vision concurrency', type: 'num', def: '' },
      { env: 'CORTEX_VISION_TIMEOUT_MS', label: 'Vision timeout (ms)', type: 'num', def: '', hint: 'an LRU model swap alone costs ~53s' },
      { env: 'CORTEX_VISION_MAX_EDGE', label: 'Vision max edge (px)', type: 'num', def: '' },
      { env: 'CORTEX_VISION_MAX_PIXELS', label: 'Vision max pixels', type: 'num', def: '', hint: 'decompression-bomb guard' },
      { env: 'CORTEX_VISION_MAX_FRAMES', label: 'Vision max frames', type: 'num', def: '', hint: 'animated GIF/WebP sampling' },
      { env: 'CORTEX_PYTHON_TOOLS_ENABLED', label: 'Python tools (sandboxed)', type: 'bool', def: 'false', hint: 'arbitrary code execution — seatbelt-sandboxed, fail-closed; leave off until reviewed' },
      { env: 'CORTEX_PYTHON_BIN', label: 'Python interpreter', type: 'text', def: '', hint: 'default python3' },
      { env: 'CORTEX_PYTHON_CPU_SECONDS', label: 'Python CPU-seconds cap', type: 'num', def: '' },
      { env: 'CORTEX_PYTHON_MEMORY_MB', label: 'Python RSS cap (MB)', type: 'num', def: '' },
      { env: 'CORTEX_PYTHON_FSIZE_MB', label: 'Python max file size (MB)', type: 'num', def: '' },
      { env: 'CORTEX_PYTHON_WALL_MAX_SECONDS', label: 'Python wall-clock cap (s)', type: 'num', def: '' },
      { env: 'CORTEX_PYTHON_READ_PATHS', label: 'Python extra read roots', type: 'text', def: '', hint: "':'-separated read-only roots for the seatbelt profile" },
      { env: 'CORTEX_TOOL_ALLOW_PRIVATE_HOSTS', label: 'HTTP tools to private ranges', type: 'bool', def: 'false', hint: 'dev only — SSRF' },
      { env: 'CORTEX_MODERATE', label: 'Layer moderator screen', type: 'bool', def: 'false', hint: 'moderator screen on top of local guardrails (fail-open)' },
      { env: 'CORTEX_MODERATION_MODE', label: 'Text moderation via cortex', type: 'enum', options: ['off', 'shadow', 'enforce'], def: 'off', hint: 'shadow = score+log only; enforce also needs DEFAULT_AI_PROVIDER=cortex' },
      { env: 'CORTEX_MODERATION_TIMEOUT_MS', label: 'Moderation timeout (ms)', type: 'num', def: '', hint: 'fails CLOSED on expiry → falls back to a cloud provider' },
      { env: 'CORTEX_CACHE_TTL', label: 'Chat cache TTL (s)', type: 'num', def: '' },
    ],
  },
  {
    key: 'imgmod', title: 'FileVault image moderation', comment: 'FileVault image moderation at the upload chokepoint (FEAT-031)',
    fields: [
      { env: 'FILEVAULT_IMAGE_MODERATION', label: 'Image moderation mode', type: 'enum', options: ['off', 'shadow', 'enforce'], def: 'off', hint: 'INDEPENDENT of CORTEX_MODERATION_MODE (that one is text). Needs worker:filevault-moderation' },
      { env: 'FILEVAULT_IMAGE_RISK_THRESHOLD', label: 'Risk threshold (0-100)', type: 'num', def: '', check: (v) => (v && (!isNum(v) || +v > 100) ? 'must be 0-100' : null) },
      { env: 'FILEVAULT_MODERATION_ATTEMPTS', label: 'Job attempts', type: 'num', def: '' },
      { env: 'FILEVAULT_MODERATION_CONCURRENCY', label: 'Worker concurrency', type: 'num', def: '' },
      { env: 'FILEVAULT_MODERATION_RECONCILE_INTERVAL_MS', label: 'Reconcile sweep interval (ms)', type: 'num', def: '', hint: 'self-heal for images orphaned in pending' },
      { env: 'FILEVAULT_MODERATION_RECONCILE_GRACE_MS', label: 'Reconcile grace window (ms)', type: 'num', def: '' },
    ],
  },
  {
    key: 'infra', title: 'Docker extras (nginx/LDAP/DNS/Kerberos/mail)', comment: 'Docker infrastructure stack (docker-compose.yml + npm run infra:*)',
    fields: [
      { env: 'NGINX_HTTP_PORT', label: 'nginx HTTP port', type: 'port', def: '80' },
      { env: 'NGINX_HTTPS_PORT', label: 'nginx HTTPS port', type: 'port', def: '443' },
      { env: 'LDAP_ORG', label: 'LDAP org', type: 'text', def: 'Exprsn' },
      { env: 'LDAP_DOMAIN', label: 'LDAP domain', type: 'text', def: 'exprsn.local' },
      { env: 'LDAP_ADMIN_PASSWORD', label: 'LDAP admin password', type: 'secret', def: 'change_me' },
      { env: 'LDAP_PORT', label: 'LDAP port', type: 'port', def: '389' },
      { env: 'LDAPS_PORT', label: 'LDAPS port', type: 'port', def: '636' },
      { env: 'DNS_PORT', label: 'BIND9 DNS port', type: 'port', def: '53' },
      { env: 'KRB5_REALM', label: 'Kerberos realm', type: 'text', def: 'EXPRSN.LOCAL' },
      { env: 'KRB5_KDC', label: 'Kerberos KDC host', type: 'text', def: 'kerberos' },
      { env: 'KRB5_ADMIN_PASSWORD', label: 'Kerberos admin password', type: 'secret', def: 'change_me' },
      { env: 'KRB_KDC_PORT', label: 'KDC port', type: 'port', def: '88' },
      { env: 'KRB_KADMIN_PORT', label: 'kadmin port', type: 'port', def: '749' },
      { env: 'IMAP_PORT', label: 'IMAP port', type: 'port', def: '143' },
      { env: 'IMAPS_PORT', label: 'IMAPS port', type: 'port', def: '993' },
      { env: 'POP3_PORT', label: 'POP3 port', type: 'port', def: '110' },
      { env: 'POP3S_PORT', label: 'POP3S port', type: 'port', def: '995' },
      { env: 'TZ', label: 'Timezone', type: 'text', def: 'UTC' },
    ],
  },
];

// Service URLs are configuration too, but in the unified platform they must all
// point back at the single origin — so they are derived, not hand-edited.
function serviceUrlBlock(env) {
  const scheme = (env.TLS_ENABLED || 'true') === 'false' ? 'http' : 'https';
  const host = env.PUBLIC_HOST || `localhost:${env.HTTPS_PORT || '8443'}`;
  const base = `${scheme}://${host}`;
  const urls = {
    CA_SERVICE_URL: `${base}/ca`, CA_URL: `${base}/ca`, CA_BASE_URL: `${base}/ca`,
    AUTH_SERVICE_URL: `${base}/auth`, SPARK_SERVICE_URL: `${base}/spark`,
    NEXUS_SERVICE_URL: `${base}/nexus`, FILEVAULT_SERVICE_URL: `${base}/filevault`,
    VAULT_SERVICE_URL: `${base}/vault`, TIMELINE_SERVICE_URL: `${base}/timeline`,
    PREFETCH_SERVICE_URL: `${base}/prefetch`, MODERATOR_SERVICE_URL: `${base}/moderator`,
    LIVE_SERVICE_URL: `${base}/live`, HERALD_SERVICE_URL: `${base}/moderator`,
  };
  return urls;
}
const DERIVED_KEYS = new Set(Object.keys(serviceUrlBlock({})));

const SCHEMA_KEYS = new Set(SECTIONS.flatMap((s) => s.fields.map((f) => f.env)));

// ─────────────────────────────── state ─────────────────────────────────────
const ROOT = path.join(__dirname, '..');
const ENV_FILE = path.resolve(process.argv[2] || path.join(ROOT, '.env'));
const EXAMPLE_FILE = path.join(ROOT, '.env.example');

let env = {};        // key -> value (strings), managed + unmanaged alike
let unmanaged = {};  // keys found in the file but absent from the schema (preserved)
let loadedFrom = null;
let dirty = false;

function parseEnvFile(file) {
  const map = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    // strip an inline comment only on unquoted values
    if (!/^["']/.test(v)) v = v.replace(/\s+#.*$/, '').trim();
    v = v.replace(/^["'](.*)["']$/, '$1');
    map[m[1]] = v;
  }
  return map;
}

function load() {
  let src = null;
  if (fs.existsSync(ENV_FILE)) { src = ENV_FILE; }
  else if (fs.existsSync(EXAMPLE_FILE)) { src = EXAMPLE_FILE; }
  const parsed = src ? parseEnvFile(src) : {};
  loadedFrom = src;
  env = {};
  unmanaged = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (SCHEMA_KEYS.has(k) || DERIVED_KEYS.has(k)) env[k] = v;
    else unmanaged[k] = v;
  }
}

function valueOf(f) {
  return env[f.env] !== undefined && env[f.env] !== '' ? env[f.env] : '';
}
function effective(f) {
  const v = valueOf(f);
  return v !== '' ? v : f.def;
}
function isSecretWeak(f) {
  if (f.type !== 'secret') return false;
  const v = effective(f);
  return PLACEHOLDERS.has(String(v).toLowerCase()) && f.def !== '' ;
}
function fieldProblem(f) {
  const v = valueOf(f);
  if (v === '') return null;
  if (f.type === 'port' && !isPort(v)) return 'invalid port';
  if (f.type === 'num' && !isNum(v)) return 'must be a number';
  if (f.check) return f.check(v);
  return null;
}

function displayVal(f) {
  const v = valueOf(f);
  const shown = v !== '' ? v : (f.def !== '' ? f.def : '');
  if (shown === '') return c.gray + '(unset)' + c.reset;
  let text = f.type === 'secret' ? '•'.repeat(Math.min(12, shown.length)) : shown;
  text = trunc(text, 34);
  const colored = c.yellow + text + c.reset;
  return v === '' ? colored + c.gray + ' (default)' + c.reset : colored;
}

// ───────────────────────────── field editing ───────────────────────────────
async function editField(f) {
  if (f.type === 'bool') {
    const opts = ['true', 'false'].concat(f.def === '' ? [c.gray + '(unset)' + c.reset] : []);
    const i = await selectMenu(`${f.label}  ${c.gray}[${f.env}]${c.reset}`, opts, f.hint);
    if (i === -1) return;
    env[f.env] = i === 2 ? '' : opts[i];
    dirty = true;
    return;
  }
  if (f.type === 'enum') {
    const i = await selectMenu(`${f.label}  ${c.gray}[${f.env}]${c.reset}`, f.options, f.hint);
    if (i === -1) return;
    env[f.env] = f.options[i];
    dirty = true;
    return;
  }
  if (f.type === 'secret' && f.gen) {
    const i = await selectMenu(`${f.label}  ${c.gray}[${f.env}]${c.reset}`,
      [`⚡ Generate (${f.gen}-byte hex)`, '✎ Enter manually', c.gray + '∅ Clear' + c.reset], f.hint);
    if (i === -1) return;
    if (i === 0) { env[f.env] = genHex(f.gen); dirty = true; await toast(c.green + `Generated ${f.env}` + c.reset); return; }
    if (i === 2) { env[f.env] = ''; dirty = true; return; }
  }
  while (true) {
    const v = await textInput(`${f.label}  [${f.env}]`, valueOf(f), f.hint || (f.def !== '' ? `default: ${f.def}` : 'blank = unset'));
    if (v === null) return;
    const err = (() => {
      if (v === '') return null;
      if (f.type === 'port' && !isPort(v)) return 'invalid port (0-65535)';
      if (f.type === 'num' && !isNum(v)) return 'must be a number';
      return f.check ? f.check(v) : null;
    })();
    if (err) { await toast(c.red + err + c.reset); continue; }
    env[f.env] = v;
    dirty = true;
    return;
  }
}

async function sectionEditor(sec) {
  while (true) {
    const menu = sec.fields.map((f) => {
      const prob = fieldProblem(f);
      const warn = prob ? c.red + ' ✗ ' + prob : (isSecretWeak(f) ? c.red + ' ⚠ placeholder' : '');
      return { label: pad(trunc(f.label, 30), 31) + ' ' + displayVal(f) + warn, hint: f.env };
    });
    menu.push({ label: c.dim + '← Back' + c.reset });
    const i = await selectMenu(sec.title, menu);
    if (i === -1 || i === sec.fields.length) return;
    await editField(sec.fields[i]);
  }
}

// ─────────────────────────── quick-start preset ────────────────────────────
async function devQuickStart() {
  if (!(await confirm('Apply dev quick-start? (local defaults + generated secrets)'))) return;
  for (const sec of SECTIONS) {
    for (const f of sec.fields) {
      if (env[f.env] === undefined || env[f.env] === '') {
        if (f.def !== '' && f.type !== 'secret') env[f.env] = f.def;
      }
    }
  }
  for (const [k, bytes] of [
    ['SERVICE_TOKEN_SECRET', 48], ['JWT_SECRET', 32], ['SESSION_SECRET', 32],
  ]) {
    const cur = (env[k] || '').toLowerCase();
    if (PLACEHOLDERS.has(cur)) env[k] = genHex(bytes);
  }
  for (const k of ['DB_PASSWORD', 'RABBITMQ_PASSWORD', 'LDAP_ADMIN_PASSWORD', 'KRB5_ADMIN_PASSWORD']) {
    if (PLACEHOLDERS.has((env[k] || '').toLowerCase())) env[k] = genHex(12);
  }
  env.NODE_ENV = 'development';
  dirty = true;
  await toast(c.green + 'Dev defaults applied. Secrets generated where placeholders remained.' + c.reset);
}

// ───────────────────────────── review & write ──────────────────────────────
function featureSummary() {
  const on = (k, d) => (env[k] !== undefined && env[k] !== '' ? env[k] : d);
  const lines = [];
  const feat = (label, val, good) => lines.push('  ' + pad(label, 34) + (good ? c.green : c.gray) + val + c.reset);
  feat('AT-Proto bridge', on('ATPROTO_ENABLED', 'false'), on('ATPROTO_ENABLED', 'false') === 'true');
  feat('Plugins', on('PLUGINS_ENABLED', 'false'), on('PLUGINS_ENABLED', 'false') === 'true');
  feat('  └ sandboxed scripts', on('PLUGINS_SCRIPT_ENABLED', 'false'), on('PLUGINS_SCRIPT_ENABLED', 'false') === 'true');
  feat('Low-code builder', on('LOWCODE_ENABLED', 'false'), on('LOWCODE_ENABLED', 'false') === 'true');
  feat('Cortex (local LLM)', on('CORTEX_ENABLED', 'false'), on('CORTEX_ENABLED', 'false') === 'true');
  feat('  └ text moderation mode', on('CORTEX_MODERATION_MODE', 'off'), on('CORTEX_MODERATION_MODE', 'off') !== 'off');
  feat('  └ python tools', on('CORTEX_PYTHON_TOOLS_ENABLED', 'false'), on('CORTEX_PYTHON_TOOLS_ENABLED', 'false') === 'true');
  feat('  └ vision model', on('CORTEX_VISION_MODEL', '(off)'), !!env.CORTEX_VISION_MODEL);
  feat('Image moderation (FileVault)', on('FILEVAULT_IMAGE_MODERATION', 'off'), on('FILEVAULT_IMAGE_MODERATION', 'off') !== 'off');
  feat('Metrics /metrics', on('METRICS_ENABLED', 'true'), on('METRICS_ENABLED', 'true') === 'true');
  feat('Sentry', env.SENTRY_DSN ? 'configured' : '(off)', !!env.SENTRY_DSN);
  feat('RabbitMQ', on('RABBITMQ_ENABLED', 'true'), on('RABBITMQ_ENABLED', 'true') === 'true');

  const workers = ['worker:timeline', 'worker:prefetch'];
  if (on('ATPROTO_ENABLED', 'false') === 'true') workers.push('worker:atproto');
  if (on('CORTEX_ENABLED', 'false') === 'true') workers.push('worker:cortex');
  if (on('FILEVAULT_IMAGE_MODERATION', 'off') !== 'off') workers.push('worker:filevault-moderation');
  lines.push('');
  lines.push('  ' + c.cyan + 'Workers this config needs:' + c.reset + ' ' + workers.join(', '));
  return lines.join('\n');
}

function problems() {
  const errs = [];
  for (const sec of SECTIONS) {
    for (const f of sec.fields) {
      const p = fieldProblem(f);
      if (p) errs.push(`${f.env}: ${p}`);
      if (isSecretWeak(f)) errs.push(`${f.env}: placeholder value ("${effective(f)}")`);
    }
  }
  const sts = env.SERVICE_TOKEN_SECRET || '';
  if (!sts) errs.push('SERVICE_TOKEN_SECRET: required (>= 32 chars) — generate one in Auth & service secrets');
  if (env.NODE_ENV === 'production' && (env.DEV_BYPASS || '') === 'true') {
    errs.push('DEV_BYPASS=true with NODE_ENV=production — the bypass is fail-closed and will not work; remove it');
  }
  return errs;
}

function quote(v) {
  return /[\s#"'\\]/.test(v) ? JSON.stringify(v) : v;
}

function renderEnv() {
  const lines = [];
  lines.push('# ============================================================================');
  lines.push('# Exprsn Platform — generated by scripts/setup-tui.js (npm run setup)');
  lines.push('# One process, one HTTPS port, one database. Re-run the TUI to change values.');
  lines.push('# ============================================================================');
  for (const sec of SECTIONS) {
    lines.push('');
    lines.push(`# ---- ${sec.comment} ${'-'.repeat(Math.max(3, 74 - sec.comment.length))}`);
    for (const f of sec.fields) {
      const v = valueOf(f);
      if (v !== '') lines.push(`${f.env}=${quote(v)}`);
      else if (f.def !== '') lines.push(`${f.env}=${quote(f.def)}`);
      else lines.push(`# ${f.env}=`);
    }
  }
  lines.push('');
  lines.push('# ---- Internal module base URLs (derived: single origin + prefix) ----------');
  for (const [k, v] of Object.entries(serviceUrlBlock(env))) lines.push(`${k}=${v}`);
  const extra = Object.entries(unmanaged);
  if (extra.length) {
    lines.push('');
    lines.push('# ---- Unmanaged keys (preserved from the previous file) --------------------');
    for (const [k, v] of extra) lines.push(`${k}=${quote(v)}`);
  }
  return lines.join('\n') + '\n';
}

async function reviewAndWrite() {
  const errs = problems();
  clear();
  header('Review');
  out(featureSummary() + '\n\n');
  if (errs.length) {
    out('  ' + c.red + c.bold + `${errs.length} problem(s):` + c.reset + '\n');
    errs.slice(0, 10).forEach((e) => out('  ' + c.red + '✗ ' + c.reset + e + '\n'));
    if (errs.length > 10) out(c.dim + `  … and ${errs.length - 10} more\n` + c.reset);
    out('\n');
  }
  const choice = await selectMenu(
    errs.length ? 'Problems found — write anyway?' : `Write ${path.relative(process.cwd(), ENV_FILE)}?`,
    [errs.length ? c.yellow + 'Write anyway' + c.reset : c.green + '✓ Write file' + c.reset,
     'Preview file', c.dim + '← Back' + c.reset]
  );
  if (choice === 1) {
    clear();
    header('Preview');
    const body = renderEnv();
    out(body.split('\n').slice(0, (process.stdout.rows || 40) - 10).join('\n'));
    await toast(c.dim + `${body.split('\n').length} lines total` + c.reset);
    return reviewAndWrite();
  }
  if (choice !== 0) return;
  if (fs.existsSync(ENV_FILE)) {
    const bak = `${ENV_FILE}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(ENV_FILE, bak);
    fs.writeFileSync(ENV_FILE, renderEnv(), 'utf8');
    dirty = false;
    await toast(c.green + `Wrote ${path.basename(ENV_FILE)}` + c.reset + c.dim + ` (backup: ${path.basename(bak)})` + c.reset);
  } else {
    fs.writeFileSync(ENV_FILE, renderEnv(), 'utf8');
    dirty = false;
    await toast(c.green + `Wrote ${path.basename(ENV_FILE)}` + c.reset);
  }
}

// ─────────────────────────────── main menu ─────────────────────────────────
function sectionStatus(sec) {
  const total = sec.fields.length;
  const set = sec.fields.filter((f) => valueOf(f) !== '').length;
  const bad = sec.fields.filter((f) => fieldProblem(f) || isSecretWeak(f)).length;
  let s = c.gray + `${set}/${total} set` + c.reset;
  if (bad) s += c.red + ` · ${bad} ⚠` + c.reset;
  return s;
}

async function mainMenu() {
  while (true) {
    const items = SECTIONS.map((sec) => ({
      label: pad(trunc(sec.title, 42), 43) + ' ' + sectionStatus(sec),
    }));
    items.push({ label: c.magenta + '⚡ Dev quick-start' + c.reset, hint: 'local defaults + generated secrets' });
    items.push({ label: c.green + '✓ Review & write .env' + c.reset });
    items.push({ label: c.dim + (dirty ? '✗ Quit (unsaved changes)' : '✗ Quit') + c.reset });
    const src = loadedFrom ? `loaded from ${path.relative(ROOT, loadedFrom)}` : 'starting from built-in defaults';
    const i = await selectMenu(`Configure the platform · ${src}`, items);
    if (i === -1 || i === SECTIONS.length + 2) {
      if (dirty && !(await confirm('Discard unsaved changes?'))) continue;
      exitApp(0);
    } else if (i === SECTIONS.length) {
      await devQuickStart();
    } else if (i === SECTIONS.length + 1) {
      await reviewAndWrite();
    } else {
      await sectionEditor(SECTIONS[i]);
    }
  }
}

// ─────────────────────────────── bootstrap ─────────────────────────────────
function exitApp(code) {
  out('\n');
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.exit(code);
}

function main() {
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    console.error('setup-tui needs an interactive terminal.');
    process.exit(1);
  }
  load();
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  mainMenu().catch((e) => { console.error(e); exitApp(1); });
}

main();
