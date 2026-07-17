'use strict';

/**
 * The exhaustive registry of env keys that may be overridden from the DB-backed
 * platform config store (TASK-039 / ADR). This file — not the database — is the
 * authority on WHAT is overridable and HOW (type, hot vs restart, secrecy):
 * a DB row whose key is absent here is ignored at load and surfaced as an
 * anomaly by the list API. Never add a "generic key" escape hatch.
 *
 * Per-key fields:
 *   key             canonical env-var name
 *   module          display grouping for the admin UI (not ownership)
 *   type            'boolean' | 'int' | 'string' | 'enum'
 *   description     shown in the admin UI
 *   hot             true only when every consumer reads the value lazily
 *                   (per request/job); everything else is restart-required
 *   isSecret        masked in API/audit; requires CONFIG_STORE_KEY support
 *                   before any secret key is added (currently none)
 *   min/max/values  validation per type
 *   apply(config,v) patch the parsed config object in-place (env is always
 *                   patched too, for require-time readers)
 *
 * Invariant: a setting writable through a module's /api/config section must
 * never also appear here — every key has exactly one owner.
 */

const OVERRIDABLE_KEYS = [
  {
    key: 'METRICS_ENABLED',
    module: 'platform',
    type: 'boolean',
    description: 'Prometheus metrics endpoint + socket instrumentation',
    hot: false,
    apply: (config, v) => { config.metrics.enabled = v; },
  },
  {
    key: 'PLATFORM_ORG_SLUG',
    module: 'platform',
    type: 'string',
    description: 'Default organization slug used for platform-level resources',
    hot: true,
    apply: (config, v) => { config.platformOrgSlug = v; },
  },
  {
    key: 'SENTRY_DSN',
    module: 'platform',
    type: 'string',
    description: 'Error-tracking DSN (empty disables reporting)',
    hot: false,
    apply: (config, v) => { config.sentry.dsn = v || null; },
  },
  {
    key: 'PLUGINS_ENABLED',
    module: 'plugins',
    type: 'boolean',
    description: 'Load the plugins module at boot',
    hot: false,
    apply: (config, v) => { config.features.pluginsEnabled = v; },
  },
  {
    key: 'PLUGINS_SCRIPT_ENABLED',
    module: 'plugins',
    type: 'boolean',
    description: 'Allow sandboxed-script plugin hooks',
    hot: false,
    apply: (config, v) => { config.features.pluginsScriptEnabled = v; },
  },
  {
    key: 'LOWCODE_ENABLED',
    module: 'lowcode',
    type: 'boolean',
    description: 'Load the lowcode module at boot',
    hot: false,
    apply: (config, v) => { config.features.lowcodeEnabled = v; },
  },
  {
    key: 'CORTEX_ENABLED',
    module: 'cortex',
    type: 'boolean',
    description: 'Load the cortex (local-LLM agents) module at boot',
    hot: false,
    apply: (config, v) => { config.features.cortexEnabled = v; },
  },
  // FileVault image moderation (module reads lazily per request → hot; the
  // worker captures the threshold at boot → restart).
  {
    key: 'FILEVAULT_IMAGE_MODERATION',
    module: 'filevault',
    type: 'enum',
    values: ['off', 'shadow', 'enforce'],
    description: 'Image moderation rung: off (serve as-is), shadow (log only), enforce (hold flagged)',
    hot: true,
  },
  {
    key: 'FILEVAULT_IMAGE_RISK_THRESHOLD',
    module: 'filevault',
    type: 'int',
    min: 0,
    max: 100,
    description: 'Risk score (0-100) at or above which an image is flagged',
    hot: false,
  },
  {
    key: 'FILEVAULT_MODERATION_CONCURRENCY',
    module: 'filevault',
    type: 'int',
    min: 1,
    max: 16,
    description: 'FileVault moderation worker concurrency',
    hot: false,
  },
  // atproto bridge — all read at module/worker boot → restart-required.
  // Secrets (PDS password, signing keys, PLC token) are deliberately absent.
  {
    key: 'ATPROTO_ENABLED',
    module: 'atproto',
    type: 'boolean',
    description: 'Enable the AT-Protocol bridge (firehose ingest, labeler, DID)',
    hot: false,
  },
  {
    key: 'ATPROTO_FIREHOSE_TRANSPORT',
    module: 'atproto',
    type: 'enum',
    values: ['jetstream', 'subscribeRepos'],
    description: 'Firehose transport for ingest',
    hot: false,
  },
  {
    key: 'ATPROTO_SAMPLE_RATE',
    module: 'atproto',
    type: 'string',
    pattern: '^(0(\\.\\d+)?|1(\\.0+)?)$',
    description: 'Fraction of firehose events ingested (0–1)',
    hot: false,
  },
  {
    key: 'ATPROTO_BACKPRESSURE_HIGH',
    module: 'atproto',
    type: 'int',
    min: 100,
    max: 1000000,
    description: 'Queue depth above which firehose ingest pauses (see BUG-032)',
    hot: false,
  },
  {
    key: 'ATPROTO_BACKPRESSURE_LOW',
    module: 'atproto',
    type: 'int',
    min: 10,
    max: 1000000,
    description: 'Queue depth below which paused ingest resumes',
    hot: false,
  },
];

/**
 * Keys that must NEVER be DB-overridable, checked in both the load and write
 * paths even though the allowlist already excludes them (defense in depth —
 * this list is the reviewable invariant). Prefixes end with '*'.
 */
const DENYLIST = [
  'NODE_ENV',
  'DEV_BYPASS*',
  'SERVICE_TOKEN_SECRET',
  'SERVICE_TOKEN',
  'SERVICE_ID',
  'DB_*',
  'REDIS_*',
  'TLS_*',
  'HOST',
  'HTTPS_PORT',
  'HTTP_REDIRECT_PORT',
  'TRUST_PROXY',
  'CORS_ORIGIN',
  'METRICS_TOKEN',
  'PLATFORM_ADMIN_EMAILS',
  'CONFIG_STORE_KEY',
  'CONFIG_OVERRIDES_DISABLED',
];

function isDenied(key) {
  return DENYLIST.some((d) =>
    d.endsWith('*') ? key.startsWith(d.slice(0, -1)) : key === d,
  );
}

function descriptorFor(key) {
  return OVERRIDABLE_KEYS.find((d) => d.key === key) || null;
}

/**
 * Validate + coerce a raw string value against a descriptor.
 * Returns { ok: true, value } (coerced) or { ok: false, error }.
 */
function coerce(desc, raw) {
  const s = String(raw);
  switch (desc.type) {
    case 'boolean': {
      const t = s.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(t)) return { ok: true, value: true };
      if (['false', '0', 'no', 'off'].includes(t)) return { ok: true, value: false };
      return { ok: false, error: `not a boolean: ${s}` };
    }
    case 'int': {
      const n = Number(s);
      if (!Number.isInteger(n)) return { ok: false, error: `not an integer: ${s}` };
      if (desc.min != null && n < desc.min) return { ok: false, error: `below min ${desc.min}` };
      if (desc.max != null && n > desc.max) return { ok: false, error: `above max ${desc.max}` };
      return { ok: true, value: n };
    }
    case 'enum': {
      if (!desc.values || !desc.values.includes(s)) {
        return { ok: false, error: `must be one of: ${(desc.values || []).join(', ')}` };
      }
      return { ok: true, value: s };
    }
    default:
      if (desc.pattern && !new RegExp(desc.pattern).test(s)) {
        return { ok: false, error: 'does not match required pattern' };
      }
      return { ok: true, value: s };
  }
}

module.exports = { OVERRIDABLE_KEYS, DENYLIST, isDenied, descriptorFor, coerce };
