'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Sandbox host broker — runs a `script` plugin and brokers its I/O.
 *
 * The worker (sandbox/worker.js) executes the untrusted JS; THIS module is the
 * only thing the sandbox can reach, and every `platform.*` call is:
 *   1. checked against the installation's capability grants, then
 *   2. executed by the host with a service/CA token injected and the request
 *      routed through the platform gateway — so the script never holds a
 *      credential and every effect is authenticated + auditable.
 *
 * Gated by PLUGINS_SCRIPT_ENABLED (default false): sandboxed native-JS execution
 * is the highest-risk surface, so it is opt-in separately from PLUGINS_ENABLED.
 * ═══════════════════════════════════════════════════════════
 */

const path = require('node:path');
const { Worker } = require('node:worker_threads');
const axios = require('axios');
const { createLogger } = require('@exprsn/shared');
const { deriveServiceToken } = require('@exprsn/shared/utils/serviceToken');
const { getInternalHttpsAgent } = require('@exprsn/shared/utils/httpAgent');

const logger = createLogger('exprsn-plugins-sandbox');

const WORKER_PATH = path.join(__dirname, 'worker.js');

function scriptEnabled() {
  return process.env.PLUGINS_SCRIPT_ENABLED === 'true';
}

function gatewayBase() {
  return process.env.PUBLIC_BASE_URL || `https://localhost:${process.env.HTTPS_PORT || 8443}`;
}

function serviceHeaders() {
  const serviceId = process.env.SERVICE_ID || process.env.SERVICE_NAME || 'platform';
  try {
    return { 'X-Service-ID': serviceId, 'X-Service-Token': deriveServiceToken(serviceId) };
  } catch {
    return {};
  }
}

// Map a gateway path prefix → { read, write } capability required to call it.
const PATH_CAPABILITY = [
  { prefix: '/timeline', read: 'read:timeline.posts', write: 'write:timeline.posts' },
  { prefix: '/spark', read: 'read:spark.messages', write: 'write:spark.messages' },
  { prefix: '/lowcode', read: 'read:lowcode.records', write: 'write:lowcode.records' },
  { prefix: '/moderator', read: 'read:moderator.content', write: 'emit:moderator.flag' },
  { prefix: '/nexus', read: 'read:nexus.groups', write: null },
];

function requiredCapabilityForPath(method, p) {
  const entry = PATH_CAPABILITY.find((e) => p === e.prefix || p.startsWith(`${e.prefix}/`));
  if (!entry) return undefined; // unmapped ⇒ denied
  const isRead = /^(GET|HEAD)$/i.test(method || 'GET');
  return isRead ? entry.read : entry.write;
}

/** Which platform.* methods to expose to a script, given its grants. */
function allowedMethods(grants) {
  const set = new Set(grants || []);
  const methods = ['log']; // always available
  if (set.has('emit:notifications')) methods.push('notify');
  if (set.has('call:webhook')) methods.push('callEndpoint');
  // `http` is exposed if the script can talk to ANY module; per-call capability
  // is still enforced against the requested path.
  if ([...set].some((c) => /^(read|write):/.test(c))) methods.push('http');
  return methods;
}

/**
 * The host broker. Each method is invoked in response to a sandbox call and
 * returns a JSON-cloneable value (or throws → surfaced to the script as an
 * Error). `enforce(cap)` throws if the install lacks the grant.
 */
function makeBroker({ pluginKey, grants, audit }) {
  const grantSet = new Set(grants || []);
  const enforce = (cap) => {
    if (!cap || !grantSet.has(cap)) {
      throw new Error(`capability denied: ${cap || 'unmapped path'}`);
    }
  };

  return {
    log(message) {
      logger.info(`[script:${pluginKey}] ${String(message).slice(0, 500)}`);
      audit.calls.push({ method: 'log' });
      return true;
    },

    async notify(spec = {}) {
      enforce('emit:notifications');
      audit.calls.push({ method: 'notify' });
      const base = process.env.HERALD_SERVICE_URL || process.env.MODERATOR_SERVICE_URL || `${gatewayBase()}/moderator`;
      const { data } = await axios.post(`${base}/api/notifications`, {
        userId: spec.userId, type: spec.type || 'info', channel: 'in-app',
        title: spec.title || pluginKey, body: spec.body || '',
        data: { plugin: pluginKey, ...(spec.data || {}) }, priority: spec.priority || 'normal',
      }, { timeout: 4000, headers: serviceHeaders(), httpsAgent: getInternalHttpsAgent() });
      return { delivered: !!data };
    },

    // Generic gateway call. `path` must be an in-platform module path; the host
    // attaches identity + routes it through the gateway (token/CA pass-through).
    async http(req = {}) {
      const method = (req.method || 'GET').toUpperCase();
      const p = String(req.path || '');
      if (!p.startsWith('/')) throw new Error('http path must be an absolute /module path');
      enforce(requiredCapabilityForPath(method, p));
      audit.calls.push({ method: 'http', path: p, verb: method });
      const resp = await axios({
        method, url: `${gatewayBase()}${p}`, params: req.query, data: req.body,
        timeout: Math.min(Number(req.timeoutMs) || 4000, 8000),
        headers: serviceHeaders(), httpsAgent: getInternalHttpsAgent(),
        validateStatus: () => true,
      });
      return { status: resp.status, body: resp.data };
    },

    async callEndpoint(name, payload) {
      enforce('call:webhook');
      audit.calls.push({ method: 'callEndpoint', name });
      // Delivered through the signed webhook dispatcher (lazy require avoids a
      // load cycle: dispatcher → models → … ).
      const dispatcher = require('../services/webhookDispatcher');
      return dispatcher.invokeNamedEndpoint({ pluginKey, grants, name, payload });
    },
  };
}

/**
 * Run a script plugin.
 * @returns {Promise<{ok:boolean, result?:any, error?:string, calls:object[]}>}
 */
async function run({ pluginKey, source, ctx, grants, timeoutMs = 1500, memoryMb = 64 }) {
  if (!scriptEnabled()) {
    return { ok: false, error: 'script execution disabled (set PLUGINS_SCRIPT_ENABLED=true)', calls: [] };
  }

  const audit = { calls: [] };
  const broker = makeBroker({ pluginKey, grants, audit });
  const methods = allowedMethods(grants);
  const hardTimeout = Math.min(Number(timeoutMs) || 1500, 10000) + 1000;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (out) => { if (!settled) { settled = true; cleanup(); resolve({ ...out, calls: audit.calls }); } };

    const worker = new Worker(WORKER_PATH, {
      workerData: { source, ctx, methods, timeoutMs },
      resourceLimits: { maxOldGenerationSizeMb: Math.min(Number(memoryMb) || 64, 256) },
    });

    const killTimer = setTimeout(() => {
      logger.warn(`[script:${pluginKey}] hard timeout — terminating worker`);
      worker.terminate();
      finish({ ok: false, error: 'script timed out' });
    }, hardTimeout);

    function cleanup() {
      clearTimeout(killTimer);
      worker.removeAllListeners();
      worker.terminate().catch(() => {});
    }

    worker.on('message', async (msg) => {
      if (msg.type === 'call') {
        const fn = broker[msg.method];
        try {
          if (typeof fn !== 'function') throw new Error(`unknown platform method ${msg.method}`);
          const value = await fn.apply(broker, msg.args || []);
          worker.postMessage({ type: 'callResult', id: msg.id, ok: true, value: clone(value) });
        } catch (err) {
          worker.postMessage({ type: 'callResult', id: msg.id, ok: false, error: err.message });
        }
      } else if (msg.type === 'done') {
        finish({ ok: msg.ok, result: msg.result, error: msg.error });
      }
    });

    worker.on('error', (err) => finish({ ok: false, error: err.message }));
    worker.on('exit', (code) => { if (!settled && code !== 0) finish({ ok: false, error: `worker exited ${code}` }); });
  });
}

function clone(v) {
  try { return JSON.parse(JSON.stringify(v === undefined ? null : v)); } catch { return null; }
}

module.exports = { run, scriptEnabled, allowedMethods, requiredCapabilityForPath };
