'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Module write actions — low-code flows reaching INTO the platform.
 *
 * These flow actions call other modules (timeline / spark / nexus / moderator
 * queues / filevault / vault). Each declares the capability it requires; the
 * flow engine only runs it when the flow's APP declares that capability
 * (LcApp.capabilities) — the low-code analogue of a plugin's granted caps. Every
 * call is best-effort over the internal HTTPS gateway with the platform service
 * identity (plus the caller's bearer when present); a failure is returned as an
 * error result, never thrown into the emitting request.
 *
 * Content-producing writes (timeline/spark/nexus) are force-routed back through
 * moderator by the target module — a capability here is NOT a moderation bypass
 * (capabilities.js `routesThroughModerator`).
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const { createLogger } = require('@exprsn/shared');
const { deriveServiceToken } = require('@exprsn/shared/utils/serviceToken');
const { getInternalHttpsAgent } = require('@exprsn/shared/utils/httpAgent');

const logger = createLogger('exprsn-lowcode-modaction');

function base(envUrl, fallbackPath) {
  return process.env[envUrl] || `${process.env.PUBLIC_BASE_URL || 'https://localhost:8443'}${fallbackPath}`;
}
function headers(ctx = {}) {
  const serviceId = process.env.SERVICE_ID || process.env.SERVICE_NAME || 'platform';
  const h = {};
  try { h['X-Service-ID'] = serviceId; h['X-Service-Token'] = deriveServiceToken(serviceId); } catch { /* noop */ }
  if (ctx.authorization) h.Authorization = ctx.authorization;
  return h;
}
async function post(url, body, ctx) {
  const { data } = await axios.post(url, body, { timeout: 5000, headers: headers(ctx), httpsAgent: getInternalHttpsAgent() });
  return data;
}
async function get(url, params, ctx) {
  const { data } = await axios.get(url, { params, timeout: 5000, headers: headers(ctx), httpsAgent: getInternalHttpsAgent() });
  return data;
}

/**
 * SSRF guard for the generic http_request action: only http(s) to external
 * hosts. Loopback/link-local/private hostnames and IP literals are refused
 * (redirects are also disabled on the request) unless the operator explicitly
 * opts in via LOWCODE_HTTP_ALLOW_PRIVATE=true. Note: a hostname that RESOLVES
 * to a private address (DNS rebinding) is not caught here — keep the platform
 * egress-filtered in production.
 */
function assertExternalUrl(raw) {
  let url;
  try { url = new URL(String(raw)); } catch { throw new Error(`invalid url "${raw}"`); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`unsupported protocol ${url.protocol}`);
  if (process.env.LOWCODE_HTTP_ALLOW_PRIVATE === 'true') return;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('private hostnames are not allowed');
  }
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    const priv = a === 127 || a === 10 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
    if (priv) throw new Error('private/loopback addresses are not allowed');
  }
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
    throw new Error('private/loopback addresses are not allowed');
  }
}

/** Each action: { capability, run(action, ctx) → resultObject }. */
const MODULE_ACTIONS = {
  post_timeline: {
    capability: 'write:timeline.posts',
    async run(action, ctx) {
      const data = await post(`${base('TIMELINE_SERVICE_URL', '/timeline')}/api/posts`, { content: action.content, visibility: action.visibility || 'public' }, ctx);
      return { type: 'post_timeline', postId: data && (data.id || (data.post && data.post.id)) };
    },
  },
  send_spark: {
    capability: 'write:spark.messages',
    async run(action, ctx) {
      await post(`${base('SPARK_SERVICE_URL', '/spark')}/api/messages`, { conversationId: action.conversationId, body: action.body }, ctx);
      return { type: 'send_spark', conversationId: action.conversationId };
    },
  },
  post_nexus: {
    capability: 'write:nexus.posts',
    async run(action, ctx) {
      await post(`${base('NEXUS_SERVICE_URL', '/nexus')}/api/groups/${action.groupId}/posts`, { content: action.content }, ctx);
      return { type: 'post_nexus', groupId: action.groupId };
    },
  },
  enqueue_job: {
    capability: 'call:queues.enqueue',
    async run(action, ctx) {
      const queue = action.queue || 'default';
      await post(`${base('MODERATOR_SERVICE_URL', '/moderator')}/api/queues/${queue}/jobs`, { payload: action.payload || {} }, ctx);
      return { type: 'enqueue_job', queue };
    },
  },
  write_file: {
    capability: 'write:filevault.files',
    async run(action, ctx) {
      const content = typeof action.content === 'string' ? action.content : JSON.stringify(action.content ?? {}, null, 2);
      const data = await post(`${base('FILEVAULT_SERVICE_URL', '/filevault')}/api/files/create`, { name: action.name || 'lowcode.json', content, visibility: action.visibility || 'private' }, ctx);
      return { type: 'write_file', fileId: data && data.file && data.file.id };
    },
  },
  http_request: {
    capability: 'call:http.request',
    async run(action) {
      const method = String(action.method || 'GET').toUpperCase();
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new Error(`unsupported method ${method}`);
      assertExternalUrl(action.url);
      const headers = {};
      for (const [k, v] of Object.entries(action.headers || {})) {
        // Callers may set app-level headers (auth tokens etc.) but not smuggle
        // transport/identity headers.
        if (/^(host|content-length|x-service-id|x-service-token)$/i.test(k)) continue;
        headers[k] = String(v);
      }
      const res = await axios.request({
        url: action.url, method, headers,
        data: action.body !== undefined ? action.body : undefined,
        timeout: 10000, maxContentLength: 512 * 1024, maxBodyLength: 512 * 1024,
        maxRedirects: 0, // a redirect could bounce into a private range
        validateStatus: () => true,
      });
      let body = res.data;
      if (typeof body === 'string' && body.length > 4000) body = `${body.slice(0, 4000)}…`;
      else if (body && typeof body === 'object') {
        const s = JSON.stringify(body);
        if (s.length > 4000) body = { _truncated: true, preview: s.slice(0, 4000) };
      }
      return { type: 'http_request', status: res.status, ok: res.status >= 200 && res.status < 300, contentType: res.headers['content-type'], body };
    },
  },
  read_secret: {
    capability: 'read:vault.secrets',
    async run(action, ctx) {
      // Returns presence only — never echo the secret value into a delivery log.
      const data = await get(`${base('VAULT_SERVICE_URL', '/vault')}/api/config/${action.section || 'lowcode'}`, {}, ctx);
      const present = !!(data && (data[action.key] !== undefined || (data.config && data.config[action.key] !== undefined)));
      return { type: 'read_secret', key: action.key, present };
    },
  },
};

function isModuleAction(type) { return Object.prototype.hasOwnProperty.call(MODULE_ACTIONS, type); }
function requiredCapability(type) { const a = MODULE_ACTIONS[type]; return a ? a.capability : null; }
function actionTypes() { return Object.keys(MODULE_ACTIONS); }

/** Run a module action after asserting the app declares its capability. */
async function run(type, action, ctx, appCapabilities = []) {
  const spec = MODULE_ACTIONS[type];
  if (!spec) return { type, error: 'unknown module action' };
  if (!appCapabilities.includes(spec.capability)) {
    logger.warn('Low-code module action denied (app lacks capability)', { type, needed: spec.capability });
    return { type, error: `app missing capability ${spec.capability}` };
  }
  try {
    return await spec.run(action, ctx);
  } catch (err) {
    logger.warn('Low-code module action failed', { type, error: err.message });
    return { type, error: err.message };
  }
}

module.exports = { MODULE_ACTIONS, isModuleAction, requiredCapability, actionTypes, run };
