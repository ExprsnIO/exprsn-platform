'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Lookup providers — dynamic (platform-backed) enum sources.
 *
 * Decisions ledger look.source = "static + dynamic providers". A LcLookup is
 * either static (its `values` array is authoritative) or provider-backed
 * (`source = { type:'provider', provider, params }`), in which case its allowed
 * values are resolved at runtime from platform data.
 *
 * A provider is a pure-ish async resolver returning `[{ value, label, ... }]`.
 * The in-process `lowcode.entity` provider reads another entity's records (fully
 * testable, no network). Cross-module providers (`platform.users`,
 * `nexus.groups`) fetch over the internal HTTPS gateway BEST-EFFORT: any failure
 * degrades to an empty list rather than throwing into a record write. Results
 * are cached briefly so record validation doesn't hammer other modules.
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const { createLogger } = require('@exprsn/shared');
const { deriveServiceToken } = require('@exprsn/shared/utils/serviceToken');
const { getInternalHttpsAgent } = require('@exprsn/shared/utils/httpAgent');

const logger = createLogger('exprsn-lowcode-lookups');

const CACHE_TTL_MS = Number(process.env.LOWCODE_LOOKUP_CACHE_MS || 30000);
const cache = new Map(); // cacheKey → { at, values }

function serviceHeaders() {
  const serviceId = process.env.SERVICE_ID || process.env.SERVICE_NAME || 'platform';
  try { return { 'X-Service-ID': serviceId, 'X-Service-Token': deriveServiceToken(serviceId) }; }
  catch { return {}; }
}
function base(envUrl, fallbackPath) {
  return process.env[envUrl] || `${process.env.PUBLIC_BASE_URL || 'https://localhost:8443'}${fallbackPath}`;
}
async function httpGet(url, params) {
  const { data } = await axios.get(url, {
    params, timeout: 4000, headers: serviceHeaders(), httpsAgent: getInternalHttpsAgent(),
  });
  return data;
}

/**
 * The provider registry. Each: { key, label, description, params?, resolve }.
 * `resolve(params, ctx)` returns an array of `{ value, label }` option rows.
 */
const PROVIDERS = {
  // ── In-process: values sourced from another low-code entity's records ──────
  'lowcode.entity': {
    key: 'lowcode.entity',
    label: 'Low-code entity records',
    description: 'Options drawn from the records of another entity in the same app.',
    params: ['entityKey', 'valueField', 'labelField'],
    async resolve(params = {}, ctx = {}) {
      const { LcEntity, LcRecord } = require('../models');
      const entity = await LcEntity.findOne({ where: { appId: params.appId || ctx.appId, key: params.entityKey } });
      if (!entity) return [];
      const rows = await LcRecord.findAll({ where: { entityId: entity.id }, limit: 1000, order: [['createdAt', 'DESC']] });
      const valueField = params.valueField || 'id';
      const labelField = params.labelField || valueField;
      return rows.map((r) => {
        const value = valueField === 'id' ? r.id : (r.data || {})[valueField];
        const label = labelField === 'id' ? r.id : (r.data || {})[labelField];
        return { value, label: label != null ? String(label) : String(value) };
      }).filter((o) => o.value !== undefined && o.value !== null);
    },
  },

  // ── Cross-module (best-effort HTTP; degrade to []) : platform user directory ─
  'platform.users': {
    key: 'platform.users',
    label: 'Platform users',
    description: 'Options drawn from the platform user directory (id → display name).',
    params: ['limit'],
    async resolve(params = {}) {
      const url = `${base('AUTH_SERVICE_URL', '/auth')}/api/users`;
      const data = await httpGet(url, { limit: Math.min(Number(params.limit) || 200, 1000) });
      const users = Array.isArray(data) ? data : (data.users || data.data || []);
      return users.map((u) => ({
        value: u.id || u.userId,
        label: u.displayName || u.name || u.username || u.email || u.id,
      })).filter((o) => o.value);
    },
  },

  // ── Cross-module (best-effort HTTP; degrade to []) : nexus groups ───────────
  'nexus.groups': {
    key: 'nexus.groups',
    label: 'Nexus groups',
    description: 'Options drawn from Nexus groups (id → group name).',
    params: ['limit'],
    async resolve(params = {}) {
      const url = `${base('NEXUS_SERVICE_URL', '/nexus')}/api/groups`;
      const data = await httpGet(url, { limit: Math.min(Number(params.limit) || 200, 1000) });
      const groups = Array.isArray(data) ? data : (data.groups || data.data || []);
      return groups.map((g) => ({ value: g.id, label: g.name || g.title || g.id })).filter((o) => o.value);
    },
  },

  // ── Moderation jobs & queues (moderator owns /api/queues) ───────────────────
  'moderator.queues': {
    key: 'moderator.queues',
    label: 'Moderation queues',
    description: 'Options drawn from moderator job queues (queue name).',
    async resolve() {
      const url = `${base('MODERATOR_SERVICE_URL', '/moderator')}/api/queues`;
      const data = await httpGet(url, {});
      const queues = Array.isArray(data) ? data : (data.queues || data.data || []);
      return queues.map((q) => {
        const name = typeof q === 'string' ? q : (q.name || q.key || q.id);
        return { value: name, label: name };
      }).filter((o) => o.value);
    },
  },

  // ── Timeline trending topics ────────────────────────────────────────────────
  'timeline.topics': {
    key: 'timeline.topics',
    label: 'Trending topics',
    description: 'Options drawn from timeline trending topics.',
    params: ['limit'],
    async resolve(params = {}) {
      const url = `${base('TIMELINE_SERVICE_URL', '/timeline')}/api/search/trending/topics`;
      const data = await httpGet(url, { limit: Math.min(Number(params.limit) || 50, 200) });
      const topics = Array.isArray(data) ? data : (data.topics || data.items || data.data || []);
      return topics.map((t) => {
        const v = typeof t === 'string' ? t : (t.topic || t.tag || t.name || t.id);
        return { value: v, label: typeof t === 'object' && t.trendScore != null ? `${v} (${t.trendScore})` : String(v) };
      }).filter((o) => o.value);
    },
  },

  // ── FileVault files (user-scoped: pass a bearer via ctx.authorization) ──────
  'filevault.files': {
    key: 'filevault.files',
    label: 'FileVault files',
    description: 'Options drawn from FileVault files (id → filename). Needs a user bearer.',
    params: ['directoryId', 'limit'],
    async resolve(params = {}, ctx = {}) {
      const url = `${base('FILEVAULT_SERVICE_URL', '/filevault')}/api/files`;
      const headers = serviceHeaders();
      if (ctx.authorization) headers.Authorization = ctx.authorization;
      const { data } = await axios.get(url, {
        params: { directoryId: params.directoryId, limit: Math.min(Number(params.limit) || 100, 500) },
        timeout: 4000, headers, httpsAgent: getInternalHttpsAgent(),
      });
      const files = Array.isArray(data) ? data : (data.files || data.data || []);
      return files.map((f) => ({ value: f.id, label: f.name || f.filename || f.id })).filter((o) => o.value);
    },
  },
};

function listProviders() {
  return Object.values(PROVIDERS).map(({ key, label, description, params }) => ({ key, label, description, params: params || [] }));
}
function isKnownProvider(key) { return Object.prototype.hasOwnProperty.call(PROVIDERS, key); }

/** Resolve one provider-backed lookup to `[{value,label}]`. Best-effort + cached. */
async function resolveProvider(source, ctx = {}) {
  const provider = PROVIDERS[source && source.provider];
  if (!provider) { logger.warn('Unknown lookup provider', { provider: source && source.provider }); return []; }
  const params = { ...(source.params || {}), appId: ctx.appId };
  const cacheKey = `${provider.key}:${JSON.stringify(params)}`;
  const hit = cache.get(cacheKey);
  if (hit && (Date.now() - hit.at) < CACHE_TTL_MS) return hit.values;
  try {
    const values = await provider.resolve(params, ctx);
    cache.set(cacheKey, { at: Date.now(), values });
    return values;
  } catch (err) {
    logger.warn('Lookup provider failed (degraded to empty)', { provider: provider.key, error: err.message });
    return hit ? hit.values : [];
  }
}

/** True if the lookup row is provider-backed. */
function isDynamic(lookup) { return !!(lookup && lookup.source && lookup.source.type === 'provider'); }

/** Resolve a single LcLookup row (static or dynamic) to its `values[]`. */
async function resolveLookup(lookup, ctx = {}) {
  if (isDynamic(lookup)) return resolveProvider(lookup.source, { appId: lookup.appId, ...ctx });
  return lookup.values || [];
}

module.exports = {
  PROVIDERS,
  listProviders,
  isKnownProvider,
  isDynamic,
  resolveProvider,
  resolveLookup,
  _cache: cache, // exposed for tests
};
