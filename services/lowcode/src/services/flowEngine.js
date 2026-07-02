'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Low-code flow engine — trigger → condition → action.
 *
 * Rather than building a second dispatch path, the flow engine SUBSCRIBES to the
 * plugins hook bus (shared infra). When any instrumented event fires, it loads
 * the enabled LcFlow rows for that event, evaluates each flow's `match` with the
 * shared condition evaluator, and runs its actions — reusing the plugin action
 * handlers (log/audit/notify/flag) plus low-code-native actions (create_record).
 *
 * Self-gating: the engine only subscribes when LOWCODE_ENABLED=true, so with the
 * flag off the hook bus has no low-code subscriber and emit() stays inert.
 * ═══════════════════════════════════════════════════════════
 */

const { createLogger } = require('@exprsn/shared');
const { LcFlow, LcApp } = require('../models');

const pluginHost = require('../../../plugins/src/services/pluginHost');
const { matches } = require('../../../plugins/src/services/conditionEvaluator');
const flowActions = require('./flowActions');
const moduleActions = require('./moduleActions');

const logger = createLogger('exprsn-lowcode-flow');
let unsubscribe = null;

/** The capabilities a flow's app has been granted for module write actions. */
async function appCapabilities(appId) {
  try { const app = await LcApp.findByPk(appId, { attributes: ['capabilities'] }); return (app && app.capabilities) || []; }
  catch { return []; }
}

async function runFlow(flow, event, ctx) {
  if (flow.match && !matches(flow.match, ctx)) return;
  const runCtx = { pluginKey: `lowcode:${flow.key}`, event, ctx };
  // Only pay for the app-capabilities lookup if a module action is present.
  const needsCaps = (flow.actions || []).some((a) => moduleActions.isModuleAction(a.type));
  const caps = needsCaps ? await appCapabilities(flow.appId) : [];
  for (const action of flow.actions || []) {
    try {
      if (flowActions.isNativeAction(action.type)) {
        // Native actions mutate records against the event payload directly.
        await flowActions.NATIVE_ACTIONS[action.type](action, ctx);
      } else if (moduleActions.isModuleAction(action.type)) {
        // Capability-gated reach into another module.
        const result = await moduleActions.run(action.type, action, ctx, caps);
        if (result.error) logger.warn('Low-code module action skipped', { flow: flow.key, type: action.type, error: result.error });
      } else if (pluginHost.ACTIONS[action.type]) {
        await pluginHost.ACTIONS[action.type](action, runCtx);
      } else {
        logger.warn('Unknown low-code flow action', { flow: flow.key, type: action.type });
      }
    } catch (err) {
      logger.warn('Low-code flow action failed', { flow: flow.key, type: action.type, error: err.message });
    }
  }
}

/** The single subscriber handler registered on the hook bus. */
async function onEvent(event, ctx) {
  // Avoid a feedback loop: low-code-created records re-emit lowcode.record.*,
  // which would re-trigger create_record flows. The hook bus depth guard is the
  // backstop; here we simply don't recurse beyond the first hop.
  if (ctx && Number(ctx._pluginDepth || 0) > 1) return;
  const flows = await LcFlow.findAll({ where: { event, enabled: true } });
  for (const flow of flows) await runFlow(flow, event, ctx).catch(() => {});
}

function start() {
  if (unsubscribe) return;
  unsubscribe = pluginHost.subscribe((event, ctx) => onEvent(event, ctx).catch((err) =>
    logger.warn('Low-code flow dispatch failed', { event, error: err.message })));
  logger.info('Low-code flow engine subscribed to the plugin hook bus');
}

function stop() { if (unsubscribe) { unsubscribe(); unsubscribe = null; } }

module.exports = { start, stop, runFlow, onEvent };
