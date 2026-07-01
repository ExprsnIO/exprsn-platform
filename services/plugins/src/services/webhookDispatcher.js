'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Webhook dispatcher — signed outbound delivery with timeout, bounded retry,
 * and a per-endpoint circuit breaker.
 *
 * Signing (PLUGINS_PLAN.md §5): every delivery carries
 *   X-Plugin-ID:        <pluginKey>
 *   X-Plugin-Event:     <event>
 *   X-Plugin-Timestamp: <unix-ms>
 *   X-Plugin-Signature: HMAC-SHA256(timestamp + '.' + body, secret)
 * where secret = deriveServiceToken('plugin:'+pluginKey) (the same per-identity
 * HMAC machinery the platform already uses for service-to-service auth). The
 * receiving plugin verifies with the symmetric secret it was provisioned.
 *
 * Delivery runs INLINE (best-effort, off the request's critical path via the
 * never-throw hook bus) so it works in the single-process MVP with no extra
 * worker. The Bull-backed `worker:plugins` is the scale-out path (PLUGINS_PLAN
 * §6 Phase 2) and can take over by enqueuing instead of calling deliver().
 * ═══════════════════════════════════════════════════════════
 */

const crypto = require('node:crypto');
const axios = require('axios');
const { createLogger } = require('@exprsn/shared');
const { deriveServiceToken } = require('@exprsn/shared/utils/serviceToken');

const logger = createLogger('exprsn-plugins-webhook');

const MAX_ATTEMPTS = Number(process.env.PLUGINS_WEBHOOK_ATTEMPTS || 3);
const BREAKER_THRESHOLD = Number(process.env.PLUGINS_WEBHOOK_BREAKER_THRESHOLD || 5);
const BREAKER_COOLDOWN_MS = Number(process.env.PLUGINS_WEBHOOK_BREAKER_COOLDOWN_MS || 60000);

// In-memory breaker for manifest-inline endpoints (no PluginEndpoint row).
const memBreaker = new Map(); // url → { failures, openedUntil }

function sign(pluginKey, timestamp, body) {
  const secret = deriveServiceToken(`plugin:${pluginKey}`);
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

function breakerOpen(state) {
  return state && state.openedUntil && Date.now() < new Date(state.openedUntil).getTime();
}

/** One signed HTTP POST. Returns { ok, status, body, error }. */
async function deliverOnce({ pluginKey, url, event, payload, timeoutMs }) {
  const body = JSON.stringify(payload);
  const ts = Date.now();
  try {
    const resp = await axios.post(url, body, {
      timeout: Math.min(Number(timeoutMs) || 4000, 30000),
      headers: {
        'Content-Type': 'application/json',
        'X-Plugin-ID': pluginKey,
        'X-Plugin-Event': event,
        'X-Plugin-Timestamp': String(ts),
        'X-Plugin-Signature': sign(pluginKey, ts, body),
      },
      validateStatus: () => true,
    });
    const ok = resp.status >= 200 && resp.status < 300;
    return { ok, status: resp.status, body: resp.data };
  } catch (err) {
    return { ok: false, status: null, error: err.message };
  }
}

/**
 * Deliver with bounded retry + exponential backoff. `onBreaker` get/set let the
 * caller persist breaker state (per-endpoint row) or use the in-memory map.
 */
async function deliverWithRetry({ pluginKey, url, event, payload, timeoutMs, breaker }) {
  if (breakerOpen(breaker.get())) {
    return { ok: false, attempts: 0, error: 'circuit breaker open', status: null };
  }
  let last = { ok: false };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    last = await deliverOnce({ pluginKey, url, event, payload, timeoutMs });
    last.attempts = attempt;
    if (last.ok) { breaker.reset(); return last; }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 200 * 2 ** (attempt - 1)));
    }
  }
  breaker.fail();
  return last;
}

/** In-memory breaker handle for a url. */
function memBreakerHandle(url) {
  return {
    get: () => memBreaker.get(url),
    reset: () => memBreaker.delete(url),
    fail: () => {
      const s = memBreaker.get(url) || { failures: 0, openedUntil: null };
      s.failures += 1;
      if (s.failures >= BREAKER_THRESHOLD) s.openedUntil = new Date(Date.now() + BREAKER_COOLDOWN_MS);
      memBreaker.set(url, s);
    },
  };
}

/** Persisted breaker handle backed by a PluginEndpoint row. */
function rowBreakerHandle(endpoint) {
  return {
    get: () => (endpoint.openedUntil ? { openedUntil: endpoint.openedUntil } : null),
    reset: async () => { endpoint.failureCount = 0; endpoint.openedUntil = null; await endpoint.save().catch(() => {}); },
    fail: async () => {
      endpoint.failureCount = (endpoint.failureCount || 0) + 1;
      if (endpoint.failureCount >= BREAKER_THRESHOLD) endpoint.openedUntil = new Date(Date.now() + BREAKER_COOLDOWN_MS);
      await endpoint.save().catch(() => {});
    },
  };
}

function models() { return require('../models'); }

async function recordDelivery(fields) {
  try { await models().PluginDelivery.create(fields); }
  catch (err) { logger.warn('Failed to record webhook delivery', { error: err.message }); }
}

/**
 * Dispatch a webhook-kind plugin for one event. Never throws.
 * @param {{installation, plugin, manifest}} resolved
 */
async function dispatchEvent({ resolved, event, ctx, correlationId }) {
  const { installation, plugin, manifest } = resolved;
  const pluginKey = plugin.pluginKey;
  const url = manifest.endpoint && manifest.endpoint.url;
  if (!url) {
    await recordDelivery({
      installationId: installation.id, pluginKey, event, kind: 'webhook',
      status: 'failed', error: 'no endpoint url', correlationId, finishedAt: new Date(),
    });
    return;
  }
  const payload = { event, plugin: pluginKey, installationId: installation.id, data: ctx };
  const result = await deliverWithRetry({
    pluginKey, url, event, payload,
    timeoutMs: manifest.endpoint.timeoutMs,
    breaker: memBreakerHandle(url),
  });
  await recordDelivery({
    installationId: installation.id, pluginKey, event, kind: 'webhook',
    status: result.ok ? 'completed' : 'failed', attempts: result.attempts || 0,
    responseCode: result.status || null, result: result.ok ? { body: result.body } : null,
    error: result.ok ? null : (result.error || `http ${result.status}`),
    correlationId, finishedAt: new Date(),
  });
}

/**
 * Invoke a named, managed outbound endpoint (used by the sandbox
 * `platform.callEndpoint`). Returns { ok, status, body }.
 */
async function invokeNamedEndpoint({ pluginKey, name, payload }) {
  const { PluginEndpoint } = models();
  const endpoint = await PluginEndpoint.findOne({ where: { name, direction: 'outbound', enabled: true } });
  if (!endpoint || !endpoint.url) throw new Error(`endpoint not found: ${name}`);
  const result = await deliverWithRetry({
    pluginKey, url: endpoint.url, event: `endpoint:${name}`,
    payload: { endpoint: name, plugin: pluginKey, data: payload },
    timeoutMs: endpoint.timeoutMs, breaker: rowBreakerHandle(endpoint),
  });
  if (!result.ok) throw new Error(result.error || `endpoint ${name} failed (${result.status})`);
  return { ok: true, status: result.status, body: result.body };
}

/** Verify an inbound signature for a plugin callback. */
function verifyInbound({ pluginKey, timestamp, signature, rawBody }) {
  if (!pluginKey || !timestamp || !signature) return false;
  // Reject stale timestamps (replay window 5 min).
  if (Math.abs(Date.now() - Number(timestamp)) > 5 * 60 * 1000) return false;
  let expected;
  try { expected = sign(pluginKey, timestamp, rawBody || ''); } catch { return false; }
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { dispatchEvent, invokeNamedEndpoint, verifyInbound, sign, deliverOnce };
