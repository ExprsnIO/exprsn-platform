'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Plugin Host / Hook Bus — the in-process async event bus.
 *
 * Domain modules call `pluginHost.emit(event, ctx)` at instrumented points
 * (mirroring workflowEngine.triggerForContent). The host:
 *   1. resolves applicable installations (scopeResolver),
 *   2. evaluates each declarative plugin's `behavior.match`,
 *   3. runs its `behavior.actions` (capability-gated, best-effort), and
 *   4. logs every outcome to plugins.plugin_deliveries.
 *
 * The TWO durability guarantees from workflowEngine are sacred here:
 *   · dispatch is best-effort and NEVER throws into the emitting request, and
 *   · a re-entrancy depth counter drops plugin-induced event storms.
 *
 * Shared-infra hook (decisions ledger §Lowcode↔Plugin = "separate, shares
 * infra"): other runtimes (the low-code flow engine) register a `subscribe()`
 * handler and reuse this same bus + scope model rather than building a second
 * dispatch path.
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const { createLogger } = require('@exprsn/shared');
const { deriveServiceToken } = require('@exprsn/shared/utils/serviceToken');
const { getInternalHttpsAgent } = require('@exprsn/shared/utils/httpAgent');

const scopeResolver = require('./scopeResolver');
const { matches } = require('./conditionEvaluator');
const capabilities = require('../capabilities');

const logger = createLogger('exprsn-plugins');

const MAX_DEPTH = Number(process.env.PLUGINS_MAX_DISPATCH_DEPTH || 3);

/** Plugin declarative execution is gated by PLUGINS_ENABLED (default false). */
function pluginsEnabled() {
  return process.env.PLUGINS_ENABLED === 'true';
}

// In-process subscribers (e.g. the low-code flow engine). Best-effort fan-out.
const subscribers = new Set();
function subscribe(handler) {
  subscribers.add(handler);
  return () => subscribers.delete(handler);
}

/** Identity-bound service headers so cross-module ingest endpoints accept us. */
function serviceHeaders() {
  const serviceId = process.env.SERVICE_ID || process.env.SERVICE_NAME || 'platform';
  try {
    return { 'X-Service-ID': serviceId, 'X-Service-Token': deriveServiceToken(serviceId) };
  } catch {
    return {};
  }
}

function heraldBase() {
  return process.env.HERALD_SERVICE_URL
    || process.env.MODERATOR_SERVICE_URL
    || `${process.env.PUBLIC_BASE_URL || 'https://localhost:8443'}/moderator`;
}

/**
 * Action handlers. Each returns a small result object for the delivery log.
 * Side-effecting handlers are best-effort: a failure is recorded, never thrown.
 */
const ACTIONS = {
  // Always-available: structured log line.
  log(action, runCtx) {
    logger.info(`[plugin:${runCtx.pluginKey}] ${action.message || 'log'}`, { event: runCtx.event });
    return { type: 'log', message: action.message || null };
  },

  // emit:audit — recorded purely via the delivery row; the handler is a marker.
  audit(action, runCtx) {
    return { type: 'audit', note: action.note || `audit:${runCtx.event}` };
  },

  // emit:notifications — push an in-app notification to ctx.userId via moderator.
  async notify(action, runCtx) {
    const userId = runCtx.ctx.userId || (runCtx.ctx.post && runCtx.ctx.post.userId);
    if (!userId) return { type: 'notify', skipped: 'no userId in context' };
    const body = {
      userId,
      type: action.notificationType || 'info',
      channel: 'in-app',
      title: action.title || `${runCtx.pluginKey}`,
      body: action.body || '',
      data: { plugin: runCtx.pluginKey, event: runCtx.event },
      priority: action.priority || 'normal',
    };
    const { data } = await axios.post(`${heraldBase()}/api/notifications`, body, {
      timeout: 4000, headers: serviceHeaders(), httpsAgent: getInternalHttpsAgent(),
    });
    return { type: 'notify', delivered: !!data };
  },

  // emit:moderator.flag — record an advisory flag (never auto-acts on content).
  flag(action, runCtx) {
    logger.warn(`[plugin:${runCtx.pluginKey}] flagged content for review`, {
      event: runCtx.event, reason: action.reason || 'plugin flag',
    });
    return { type: 'flag', reason: action.reason || null };
  },
};

/** Capability an action needs, or null if it needs none. */
const ACTION_CAPABILITY = {
  log: null,
  audit: 'emit:audit',
  notify: 'emit:notifications',
  flag: 'emit:moderator.flag',
  webhook: 'call:webhook',
};

/** Lazily-required models (avoid a require cycle at module load). */
function models() {
  return require('../models');
}

async function recordDelivery(fields) {
  try {
    const { PluginDelivery } = models();
    await PluginDelivery.create(fields);
  } catch (err) {
    logger.warn('Failed to record plugin delivery', { error: err.message, event: fields.event });
  }
}

/** Run one resolved declarative plugin against the context. Never throws. */
async function runDeclarative(resolved, runCtx) {
  const { manifest, installation, grants } = resolved;
  const behavior = manifest.behavior || {};
  let matched = false;
  try {
    matched = matches(behavior.match, runCtx.ctx);
  } catch (err) {
    matched = false;
    logger.warn(`[plugin:${runCtx.pluginKey}] match evaluation failed`, { error: err.message });
  }

  if (!matched) {
    await recordDelivery({
      installationId: installation.id, pluginKey: runCtx.pluginKey, event: runCtx.event,
      kind: 'declarative', status: 'skipped', matched: false, correlationId: runCtx.correlationId,
      finishedAt: new Date(),
    });
    return;
  }

  const results = [];
  const actions = Array.isArray(behavior.actions) ? behavior.actions : [];
  for (const action of actions) {
    const handler = ACTIONS[action.type];
    if (!handler) { results.push({ type: action.type, error: 'unknown action type' }); continue; }
    const needed = ACTION_CAPABILITY[action.type];
    if (needed && !grants.includes(needed) && !capabilities.isSubset([needed], manifest.capabilities)) {
      results.push({ type: action.type, error: `missing capability ${needed}` });
      continue;
    }
    try {
      results.push(await handler(action, runCtx));
    } catch (err) {
      results.push({ type: action.type, error: err.message });
      logger.warn(`[plugin:${runCtx.pluginKey}] action ${action.type} failed`, { error: err.message });
    }
  }

  await recordDelivery({
    installationId: installation.id, pluginKey: runCtx.pluginKey, event: runCtx.event,
    kind: 'declarative', status: results.some((r) => r.error) ? 'failed' : 'completed',
    matched: true, result: { actions: results }, correlationId: runCtx.correlationId, finishedAt: new Date(),
  });
}

/** Webhook-kind: deliver a signed payload to the plugin's endpoint. */
async function runWebhook(resolved, runCtx) {
  const dispatcher = require('./webhookDispatcher');
  await dispatcher.dispatchEvent({
    resolved, event: runCtx.event, ctx: runCtx.ctx, correlationId: runCtx.correlationId,
  });
}

/** Script-kind: run the sandboxed JS; all its I/O is brokered through the gateway. */
async function runScript(resolved, runCtx) {
  const sandbox = require('../sandbox/sandboxRunner');
  const { manifest, installation, grants } = resolved;
  const script = manifest.script || {};
  const out = await sandbox.run({
    pluginKey: runCtx.pluginKey,
    source: script.source,
    ctx: runCtx.ctx,
    grants: grants && grants.length ? grants : (manifest.capabilities || []),
    timeoutMs: script.timeoutMs,
    memoryMb: script.memoryMb,
  });
  await recordDelivery({
    installationId: installation.id, pluginKey: runCtx.pluginKey, event: runCtx.event,
    kind: 'script', status: out.ok ? 'completed' : 'failed', matched: true,
    result: { result: out.result, calls: out.calls }, error: out.ok ? null : out.error,
    correlationId: runCtx.correlationId, finishedAt: new Date(),
  });
}

/**
 * Emit an event onto the hook bus. Best-effort, NEVER throws into the caller.
 * @param {string} event   a known event key (see events.js)
 * @param {object} ctx     event payload; may carry userId/orgId/groupId/module
 */
async function emit(event, ctx = {}) {
  try {
    const depth = Number(ctx._pluginDepth || 0);
    if (depth > MAX_DEPTH) {
      logger.warn('Plugin dispatch depth exceeded — dropping event', { event, depth });
      return;
    }

    // Fan out to other runtimes (low-code flow engine) regardless of the plugin
    // flag — they gate themselves by only subscribing when enabled.
    for (const handler of subscribers) {
      Promise.resolve()
        .then(() => handler(event, ctx))
        .catch((err) => logger.warn('Plugin subscriber failed', { event, error: err.message }));
    }

    if (!pluginsEnabled()) return; // declarative plugin dispatch is opt-in

    const correlationId = ctx.correlationId || `pe_${Date.now().toString(36)}`;
    const childCtx = { ...ctx, _pluginDepth: depth + 1, correlationId };

    const moduleName = ctx.module || event.split('.')[0];
    const resolvedList = await scopeResolver.resolve({
      event, module: moduleName, userId: ctx.userId, orgId: ctx.orgId, groupId: ctx.groupId,
    });

    for (const resolved of resolvedList) {
      const runCtx = { event, pluginKey: resolved.plugin.pluginKey, ctx: childCtx, correlationId };
      const kind = resolved.manifest.kind;
      const dispatch =
        kind === 'webhook' ? runWebhook
          : kind === 'script' ? runScript
            : runDeclarative;
      await dispatch(resolved, runCtx).catch((err) =>
        logger.warn(`${kind} dispatch failed`, { plugin: runCtx.pluginKey, error: err.message }));
    }
  } catch (err) {
    // The whole emit is swallowed — a plugin subsystem fault must never break
    // the originating request (the workflowEngine never-throw guarantee).
    logger.error('pluginHost.emit failed (contained)', { event, error: err.message });
  }
}

module.exports = { emit, subscribe, MAX_DEPTH, ACTIONS, ACTION_CAPABILITY };
