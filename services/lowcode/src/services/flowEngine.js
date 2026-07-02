'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Low-code flow engine — trigger → condition → actions.
 *
 * Rather than building a second dispatch path, the flow engine SUBSCRIBES to the
 * plugins hook bus (shared infra) for event-triggered flows; schedule/webhook/
 * manual triggers (flowScheduler, routes/hooks, design execute) call runFlow
 * directly. Every execution records an LcFlowRun with per-step results so
 * builders can inspect what actually happened.
 *
 * Per-action controls:
 *   when     — condition tree gating just this action (shared evaluator)
 *   onError  — 'continue' (default) or 'stop' (abort remaining actions)
 *   retries  — 0–3 extra attempts with linear backoff
 *
 * Self-gating: the engine only subscribes when LOWCODE_ENABLED=true, so with the
 * flag off the hook bus has no low-code subscriber and emit() stays inert.
 * ═══════════════════════════════════════════════════════════
 */

const { createLogger } = require('@exprsn/shared');
const { LcFlow, LcFlowRun, LcApp } = require('../models');

const pluginHost = require('../../../plugins/src/services/pluginHost');
const { matches } = require('../../../plugins/src/services/conditionEvaluator');
const flowActions = require('./flowActions');
const moduleActions = require('./moduleActions');

const logger = createLogger('exprsn-lowcode-flow');
let unsubscribe = null;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 250;
const RUNS_KEPT_PER_FLOW = 200;
const RESULT_SNIPPET = 2000;
const CONTEXT_SNIPPET = 4000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The flow's app row (capability grants + lifecycle status), fail-soft. */
async function flowApp(appId) {
  try { return await LcApp.findByPk(appId, { attributes: ['capabilities', 'status'] }); }
  catch { return null; }
}

/** Truncate an arbitrary value so a run row can never balloon. */
function snippet(value, max) {
  if (value === undefined || value === null) return null;
  try {
    const s = JSON.stringify(value);
    if (s.length <= max) return JSON.parse(s);
    return { _truncated: true, preview: s.slice(0, max) };
  } catch { return { _unserializable: true }; }
}

/** Run one action with retry/backoff. Returns a step-result object. */
async function runAction(flow, action, i, ctx, caps, runCtx) {
  const step = { i, type: action.type, status: 'ok', attempts: 0 };
  if (action.when && !matches(action.when, ctx)) {
    step.status = 'skipped';
    return step;
  }
  const retries = Math.min(Math.max(Number(action.retries) || 0, 0), MAX_RETRIES);
  const started = Date.now();
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    step.attempts = attempt + 1;
    try {
      let result;
      if (flowActions.isNativeAction(action.type)) {
        result = await flowActions.NATIVE_ACTIONS[action.type](action, ctx);
      } else if (moduleActions.isModuleAction(action.type)) {
        result = await moduleActions.run(action.type, action, ctx, caps);
        // Module actions return { error } instead of throwing — surface it so
        // retry/onError semantics apply uniformly.
        if (result && result.error) throw new Error(result.error);
      } else if (pluginHost.ACTIONS[action.type]) {
        result = await pluginHost.ACTIONS[action.type](action, runCtx);
      } else {
        throw new Error(`unknown action type "${action.type}"`);
      }
      step.result = snippet(result, RESULT_SNIPPET);
      step.ms = Date.now() - started;
      return step;
    } catch (err) {
      lastError = err;
      if (attempt < retries) await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  }
  step.status = 'error';
  step.error = lastError ? lastError.message : 'unknown error';
  step.ms = Date.now() - started;
  logger.warn('Low-code flow action failed', { flow: flow.key, type: action.type, error: step.error, attempts: step.attempts });
  return step;
}

/**
 * Execute a flow against a context. `trigger` names what fired it (event key,
 * or 'manual'|'schedule'|'webhook'). Records an LcFlowRun (best-effort) and
 * returns it. When `match` fails: event dispatch returns null silently;
 * `recordSkipped` (manual/webhook) records a 'skipped' run instead; and
 * `ignoreMatch` runs the actions regardless (builder test runs).
 */
async function runFlow(flow, trigger, ctx, { triggeredBy = null, recordSkipped = false, ignoreMatch = false } = {}) {
  const startedAt = new Date();
  const app = await flowApp(flow.appId);
  // Archived apps are frozen — their automations stop firing too.
  if (app && app.status === 'archived') {
    if (!recordSkipped) return null;
  }
  const matched = (!app || app.status !== 'archived') && (ignoreMatch || !flow.match || matches(flow.match, ctx));

  let status; let steps = []; let error = null;
  if (!matched) {
    if (!recordSkipped) return null; // event dispatch: non-matching flows are free
    status = 'skipped';
  } else {
    const runCtx = { pluginKey: `lowcode:${flow.key}`, event: trigger, ctx };
    const caps = (app && app.capabilities) || [];
    let stopped = false;
    for (let i = 0; i < (flow.actions || []).length; i += 1) {
      if (stopped) { steps.push({ i, type: flow.actions[i].type, status: 'skipped' }); continue; }
      const step = await runAction(flow, flow.actions[i], i, ctx, caps, runCtx);
      steps.push(step);
      if (step.status === 'error' && (flow.actions[i].onError === 'stop')) {
        stopped = true;
        error = `stopped at action[${i}] (${step.error})`;
      }
    }
    const errors = steps.filter((s) => s.status === 'error').length;
    const oks = steps.filter((s) => s.status === 'ok').length;
    status = errors === 0 ? 'success' : (oks > 0 ? 'partial' : 'error');
  }

  let run = null;
  try {
    run = await LcFlowRun.create({
      flowId: flow.id, appId: flow.appId, trigger, status,
      context: snippet(ctx, CONTEXT_SNIPPET), steps, error, triggeredBy,
      startedAt, finishedAt: new Date(),
    });
    pruneRuns(flow.id).catch(() => {});
  } catch (err) {
    logger.warn('Low-code flow run not recorded', { flow: flow.key, error: err.message });
  }
  return run || { flowId: flow.id, trigger, status, steps, error, startedAt, finishedAt: new Date() };
}

/** Keep only the newest RUNS_KEPT_PER_FLOW runs per flow (best-effort). */
async function pruneRuns(flowId) {
  const keep = await LcFlowRun.findAll({
    where: { flowId }, order: [['createdAt', 'DESC']],
    offset: RUNS_KEPT_PER_FLOW, limit: 1, attributes: ['createdAt'],
  });
  if (keep.length) {
    const { Op } = require('sequelize');
    await LcFlowRun.destroy({ where: { flowId, createdAt: { [Op.lte]: keep[0].createdAt } } });
  }
}

/** Manual/test execution from the design API (runs even when disabled). */
async function executeManual(flow, ctx = {}, { userId = null } = {}) {
  const fullCtx = { module: 'lowcode', manual: true, userId, ...ctx };
  return runFlow(flow, 'manual', fullCtx, { triggeredBy: userId, recordSkipped: true, ignoreMatch: !!ctx._ignoreMatch });
}

/** The single subscriber handler registered on the hook bus. */
async function onEvent(event, ctx) {
  // Avoid a feedback loop: low-code-created records re-emit lowcode.record.*,
  // which would re-trigger create_record flows. The hook bus depth guard is the
  // backstop; here we simply don't recurse beyond the first hop.
  if (ctx && Number(ctx._pluginDepth || 0) > 1) return;
  const flows = await LcFlow.findAll({ where: { event, enabled: true } });
  for (const flow of flows) {
    // Legacy rows have no trigger; only event-typed flows dispatch off the bus.
    const t = flow.trigger && flow.trigger.type;
    if (t && t !== 'event') continue;
    await runFlow(flow, event, ctx).catch(() => {});
  }
}

function start() {
  if (unsubscribe) return;
  unsubscribe = pluginHost.subscribe((event, ctx) => onEvent(event, ctx).catch((err) =>
    logger.warn('Low-code flow dispatch failed', { event, error: err.message })));
  logger.info('Low-code flow engine subscribed to the plugin hook bus');
}

function stop() { if (unsubscribe) { unsubscribe(); unsubscribe = null; } }

module.exports = { start, stop, runFlow, onEvent, executeManual };
