'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Cron scheduler for schedule-triggered flows.
 *
 * Registers a node-cron task per enabled flow whose trigger is
 * { type: 'schedule', cron: '<5-field expression>' }. refresh() reloads the
 * whole schedule set — the design API calls it after any flow mutation, so
 * there's no incremental bookkeeping to get wrong. Each tick re-fetches the
 * flow row (latest actions, still enabled) before running.
 *
 * Single-gateway MVP: one process, one scheduler — no distributed lock needed
 * (mirrors the platform's single-instance scope decision).
 * ═══════════════════════════════════════════════════════════
 */

const cron = require('node-cron');
const { createLogger } = require('@exprsn/shared');
const { LcFlow } = require('../models');
const flowEngine = require('./flowEngine');

const logger = createLogger('exprsn-lowcode-flow');
const tasks = new Map(); // flowId → cron task
let started = false;

function isScheduleFlow(flow) {
  return flow.trigger && flow.trigger.type === 'schedule' && typeof flow.trigger.cron === 'string';
}

/** Validate a cron expression (design-time check). */
function validateCron(expr) {
  return typeof expr === 'string' && cron.validate(expr);
}

async function tick(flowId) {
  try {
    const flow = await LcFlow.findByPk(flowId);
    if (!flow || !flow.enabled || !isScheduleFlow(flow)) return;
    const ctx = { module: 'lowcode', schedule: true, cron: flow.trigger.cron, firedAt: new Date().toISOString() };
    await flowEngine.runFlow(flow, 'schedule', ctx, { recordSkipped: true });
  } catch (err) {
    logger.warn('Scheduled flow tick failed', { flowId, error: err.message });
  }
}

/** Reload all schedule-triggered flows and (re)register their cron tasks. */
async function refresh() {
  if (!started) return;
  for (const [, task] of tasks) task.stop();
  tasks.clear();
  try {
    const flows = await LcFlow.findAll({ where: { enabled: true, event: '_schedule' } });
    for (const flow of flows) {
      if (!isScheduleFlow(flow) || !cron.validate(flow.trigger.cron)) continue;
      tasks.set(flow.id, cron.schedule(flow.trigger.cron, () => tick(flow.id)));
    }
    logger.info('Low-code flow scheduler refreshed', { scheduled: tasks.size });
  } catch (err) {
    logger.warn('Flow scheduler refresh failed', { error: err.message });
  }
}

async function start() {
  if (started) return;
  started = true;
  await refresh();
}

function stop() {
  for (const [, task] of tasks) task.stop();
  tasks.clear();
  started = false;
}

module.exports = { start, stop, refresh, validateCron, _tasks: tasks };
