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
