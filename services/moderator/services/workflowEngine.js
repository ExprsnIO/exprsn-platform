/**
 * ═══════════════════════════════════════════════════════════
 * Workflow Engine
 * ───────────────────────────────────────────────────────────
 * Admins define workflows (a step tree) in moderator_config
 * (category 'workflows', key `workflow_<id>`). This engine runs
 * them on moderated content via a durable Bull (Redis) queue
 * (`workflow-exec`) with retries + parallelism, recording each
 * run in the `workflow_executions` table.
 *
 * Step types: analyze, apply_rules, set_action, route_queue,
 * condition, notify, label, parallel. Unknown types are recorded
 * as skipped. Step handlers are best-effort: side-effecting
 * integrations (notify/label/route_queue) never throw, while a
 * genuine infrastructure error (DB during apply_rules) propagates
 * so Bull retries the whole execution (durability).
 * ═══════════════════════════════════════════════════════════
 */

const Bull = require('bull');
const axios = require('axios');
const config = require('../config');
const logger = require('../src/utils/logger');

let deriveServiceToken;
let getInternalHttpsAgent;
try {
  ({ deriveServiceToken } = require('@exprsn/shared/utils/serviceToken'));
  ({ getInternalHttpsAgent } = require('@exprsn/shared/utils/httpAgent'));
} catch (_) {
  // Shared package not resolvable in some standalone contexts — notify becomes
  // a best-effort no-op (it is wrapped in try/catch and never throws).
}

const QUEUE_NAME = 'workflow-exec';
const JOB_NAME = 'run';

/** Build service-to-service auth headers (mirrors requireAdmin). */
function serviceHeaders() {
  const id = process.env.SERVICE_ID || process.env.SERVICE_NAME;
  if (!id || typeof deriveServiceToken !== 'function') return {};
  try {
    return { 'X-Service-ID': id, 'X-Service-Token': deriveServiceToken(id) };
  } catch (_) {
    return {};
  }
}

class WorkflowEngine {
  constructor() {
    this.queue = null;
    this._inited = false;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Lazily build (and memoize) the Bull queue using the moderator redis config. */
  _getQueue() {
    if (!this.queue) {
      const r = config.redis || {};
      this.queue = new Bull(QUEUE_NAME, {
        redis: {
          host: r.host,
          port: r.port,
          password: r.password,
          db: r.db,
          maxRetriesPerRequest: null,
          enableReadyCheck: false
        }
      });
    }
    return this.queue;
  }

  /**
   * Create the queue + register the processor. Idempotent: a second call is a
   * no-op. The orchestrator calls this during module init.
   */
  init() {
    if (this._inited) return;
    const queue = this._getQueue();
    queue.process(JOB_NAME, 5, (job) => this.processExecution(job));
    this._inited = true;
    logger.info('Workflow engine initialized', { queue: QUEUE_NAME });
  }

  // ── Workflow CRUD (over moderator_config) ───────────────────────────────────

  _sanitizeId(id) {
    return (
      String(id || '')
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'workflow'
    );
  }

  _key(id) {
    return `workflow_${this._sanitizeId(id)}`;
  }

  async listWorkflows() {
    try {
      const { ModeratorConfig } = require('../models/sequelize-index');
      const rows = await ModeratorConfig.findAll({ where: { category: 'workflows' } });
      return rows.map((row) => row.value).filter((w) => w && typeof w === 'object');
    } catch (error) {
      logger.error('Failed to list workflows', { error: error.message });
      return [];
    }
  }

  async getWorkflow(id) {
    try {
      const { ModeratorConfig } = require('../models/sequelize-index');
      return await ModeratorConfig.getConfig(this._key(id), null);
    } catch (error) {
      logger.error('Failed to get workflow', { error: error.message, id });
      return null;
    }
  }

  async saveWorkflow(spec = {}) {
    const { ModeratorConfig } = require('../models/sequelize-index');
    const id = spec.id
      ? this._sanitizeId(spec.id)
      : `${this._sanitizeId(spec.name)}_${Date.now().toString(36)}`;

    const workflow = {
      id,
      name: spec.name || id,
      description: spec.description || '',
      enabled: spec.enabled !== false,
      trigger: spec.trigger || { type: 'manual' },
      steps: Array.isArray(spec.steps) ? spec.steps : []
    };

    await ModeratorConfig.setConfig(this._key(id), workflow, 'workflows');
    logger.info('Workflow saved', { id, name: workflow.name, enabled: workflow.enabled });
    return workflow;
  }

  async deleteWorkflow(id) {
    const { ModeratorConfig } = require('../models/sequelize-index');
    const removed = await ModeratorConfig.destroy({ where: { key: this._key(id) } });
    logger.info('Workflow deleted', { id, removed });
    return { deleted: removed > 0 };
  }

  // ── Triggering / enqueuing ──────────────────────────────────────────────────

  _jobOpts() {
    return {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 50
    };
  }

  /**
   * Enqueue every ENABLED workflow whose trigger fires on content submission.
   * Best-effort: never throws (the moderation path must not break on this).
   */
  async triggerForContent(context = {}) {
    try {
      const workflows = await this.listWorkflows();
      let enqueued = 0;
      for (const wf of workflows) {
        if (!wf || wf.enabled === false) continue;
        const trigger = wf.trigger || {};
        if (trigger.event !== 'content_submitted') continue;
        await this._getQueue().add(
          JOB_NAME,
          { workflowId: wf.id, context, trigger: 'content_submitted' },
          this._jobOpts()
        );
        enqueued += 1;
      }
      if (enqueued) logger.info('Workflows triggered for content', { enqueued });
      return { enqueued };
    } catch (error) {
      logger.error('triggerForContent failed', { error: error.message });
      return { enqueued: 0 };
    }
  }

  /**
   * Enqueue a single workflow run (the Execute button). Creates the
   * WorkflowExecution row up front (status 'queued') so the UI has an id to poll.
   * @returns {Promise<{ executionId: string, jobId: (string|number) }>}
   */
  async runWorkflow(workflowId, context = {}, trigger = 'manual') {
    const { WorkflowExecution } = require('../models/sequelize-index');
    const wf = await this.getWorkflow(workflowId);

    const exec = await WorkflowExecution.create({
      workflowId,
      workflowName: wf ? wf.name : null,
      status: 'queued',
      trigger,
      context,
      steps: []
    });

    const job = await this._getQueue().add(
      JOB_NAME,
      { workflowId, context, trigger, executionId: exec.id },
      this._jobOpts()
    );

    return { executionId: exec.id, jobId: job.id };
  }

  // ── Execution ───────────────────────────────────────────────────────────────

  /**
   * Bull processor. Loads the workflow, walks its steps, and records the run.
   * Throws on genuine step failures so Bull retries; the failed attempt is
   * persisted before rethrowing.
   */
  async processExecution(job) {
    const { workflowId, context, trigger, executionId } = job.data || {};
    const { WorkflowExecution } = require('../models/sequelize-index');

    const wf = await this.getWorkflow(workflowId);

    let exec = null;
    if (executionId) exec = await WorkflowExecution.findByPk(executionId);
    if (!exec) {
      exec = await WorkflowExecution.create({
        workflowId,
        workflowName: wf ? wf.name : null,
        status: 'queued',
        trigger: trigger || 'manual',
        context,
        steps: []
      });
    }

    if (!wf) {
      // Permanent failure — do NOT rethrow (retrying won't find it).
      exec.status = 'failed';
      exec.error = `Workflow not found: ${workflowId}`;
      exec.finishedAt = Date.now();
      await exec.save();
      logger.warn('Workflow execution skipped — workflow not found', { workflowId });
      return { executionId: exec.id, status: 'failed', error: exec.error };
    }

    const ctx = { ...(context || {}) };
    const stepsLog = [];

    exec.status = 'running';
    exec.startedAt = Date.now();
    exec.workflowName = wf.name;
    await exec.save();

    try {
      await this._runSteps(wf.steps || [], ctx, stepsLog);
      exec.steps = stepsLog;
      exec.context = ctx;
      exec.status = 'completed';
      exec.finishedAt = Date.now();
      await exec.save();
      logger.info('Workflow execution completed', { workflowId, executionId: exec.id, steps: stepsLog.length });
      return { executionId: exec.id, status: 'completed' };
    } catch (error) {
      exec.steps = stepsLog;
      exec.context = ctx;
      exec.status = 'failed';
      exec.error = error.message;
      exec.finishedAt = Date.now();
      await exec.save();
      logger.error('Workflow execution failed', { workflowId, executionId: exec.id, error: error.message });
      throw error; // rethrow so Bull retries (durability)
    }
  }

  async _runSteps(steps, ctx, log) {
    for (const step of steps || []) {
      await this._runStep(step, ctx, log);
    }
  }

  async _runStep(step, ctx, log) {
    const type = step && step.type;

    // Control-flow steps manage their own logging + recursion.
    if (type === 'condition') {
      const entry = { type, name: step.name };
      let matched;
      try {
        matched = await this._evalCondition(step.if, ctx);
      } catch (error) {
        entry.ok = false;
        entry.error = error.message;
        log.push(entry);
        throw error;
      }
      entry.ok = true;
      entry.result = { matched: !!matched, branch: matched ? 'then' : 'else' };
      log.push(entry);
      await this._runSteps(matched ? step.then : step.else, ctx, log);
      return;
    }

    if (type === 'parallel') {
      log.push({ type, name: step.name, ok: true, result: { count: (step.steps || []).length } });
      await Promise.all((step.steps || []).map((child) => this._runStep(child, ctx, log)));
      return;
    }

    // Leaf steps.
    const entry = { type, name: step && step.name };
    try {
      const outcome = await this._execLeaf(step, ctx);
      Object.assign(entry, outcome);
      if (entry.ok === undefined) entry.ok = true;
    } catch (error) {
      entry.ok = false;
      entry.error = error.message;
      log.push(entry);
      throw error;
    }
    log.push(entry);
  }

  /** Build the rule-engine content view from the run context. */
  _content(ctx) {
    if (ctx && ctx.content && typeof ctx.content === 'object') return ctx.content;
    return ctx || {};
  }

  /** Execute a single leaf step. Returns { ok, result?/skipped? }. */
  async _execLeaf(step, ctx) {
    const type = step && step.type;

    switch (type) {
      case 'analyze': {
        // No live AI keys in this build — ensure a scores object exists and
        // pass through whatever is already on the context.
        if (!ctx.scores || typeof ctx.scores !== 'object') ctx.scores = {};
        return { ok: true, result: { scores: ctx.scores } };
      }

      case 'apply_rules': {
        const ruleEngine = require('./ruleEngineService');
        const result = await ruleEngine.evaluateRules(this._content(ctx), ctx.scores || {});
        ctx.ruleResult = result;
        if (result && result.matched) ctx.action = result.action;
        return { ok: true, result };
      }

      case 'set_action': {
        ctx.action = step.action;
        let persisted = false;
        if (step.persist && ctx.moderationItemId) {
          try {
            const { ModerationCase } = require('../models/sequelize-index');
            const row = await ModerationCase.findByPk(ctx.moderationItemId);
            if (row) {
              const update = { action: step.action };
              const statusMap = {
                approve: 'approved',
                auto_approve: 'approved',
                reject: 'rejected',
                remove: 'rejected',
                hide: 'flagged',
                flag: 'flagged',
                warn: 'flagged',
                escalate: 'escalated',
                require_review: 'reviewing'
              };
              if (statusMap[step.action]) update.status = statusMap[step.action];
              await row.update(update);
              persisted = true;
            }
          } catch (error) {
            // Best-effort persistence — never break the run.
            logger.warn('set_action persist failed', { error: error.message, moderationItemId: ctx.moderationItemId });
          }
        }
        return { ok: true, result: { action: step.action, persisted } };
      }

      case 'route_queue': {
        let routed = [];
        try {
          const queueRegistry = require('./queueRegistry');
          if (step.queue && typeof queueRegistry.enqueue === 'function') {
            // Route to a specific bucket by name (bypasses the queue's match rule).
            const ok = await queueRegistry.enqueue(step.queue, ctx);
            if (ok) routed = [step.queue];
          } else if (typeof queueRegistry.route === 'function') {
            const r = await queueRegistry.route(ctx);
            if (Array.isArray(r)) routed = r;
            else if (r && Array.isArray(r.queues)) routed = r.queues;
            else if (r && r.queue) routed = [r.queue];
          }
        } catch (error) {
          // queueRegistry may not be present (separate module) — never break.
          logger.warn('route_queue skipped', { error: error.message });
          return { ok: true, skipped: true, result: { routed: [], reason: 'queueRegistry unavailable' } };
        }
        ctx.routedQueues = (ctx.routedQueues || []).concat(routed);
        return { ok: true, result: { routed } };
      }

      case 'notify': {
        await this._notify(step, ctx);
        return { ok: true, result: { target: step.target } };
      }

      case 'label': {
        // Live atproto label emission is out of scope here — record intent.
        logger.info('Workflow label intent', { value: step.value });
        return { ok: true, result: { label: step.value, emitted: false } };
      }

      default:
        return { ok: true, skipped: true, result: { reason: `unknown step type: ${type}` } };
    }
  }

  /** Evaluate a condition node via the rule engine's single-rule path. */
  async _evalCondition(node, ctx) {
    if (!node) return true;
    const ruleEngine = require('./ruleEngineService');
    return ruleEngine.evaluateSingleRule(
      { conditions: node, appliesTo: null, sourceServices: null, thresholdScore: null },
      this._content(ctx),
      ctx.scores || {}
    );
  }

  /** Best-effort notification POST. Never throws. */
  async _notify(step, ctx) {
    try {
      // For 'moderators' we notify the content's user for now (best-effort).
      const userId = ctx.userId || (ctx.content && ctx.content.userId);
      if (!userId) {
        logger.debug('Workflow notify skipped — no userId on context', { target: step.target });
        return;
      }
      const base = process.env.HERALD_SERVICE_URL || (config.herald && config.herald.url) || 'http://localhost:3014';
      const requestConfig = { timeout: 5000, headers: serviceHeaders() };
      if (typeof getInternalHttpsAgent === 'function') {
        requestConfig.httpsAgent = getInternalHttpsAgent();
      }
      await axios.post(
        `${base}/api/notifications`,
        {
          userId,
          type: 'moderation',
          title: step.title,
          body: step.body,
          data: { workflow: true, target: step.target, contentId: ctx.contentId }
        },
        requestConfig
      );
    } catch (error) {
      logger.warn('Workflow notify failed', { error: error.message, target: step && step.target });
    }
  }

  // ── Execution history ───────────────────────────────────────────────────────

  async listExecutions(limit = 50) {
    try {
      const { WorkflowExecution } = require('../models/sequelize-index');
      return await WorkflowExecution.findAll({
        order: [['created_at', 'DESC']],
        limit: parseInt(limit, 10) || 50
      });
    } catch (error) {
      logger.error('Failed to list executions', { error: error.message });
      return [];
    }
  }

  async getExecution(id) {
    const { WorkflowExecution } = require('../models/sequelize-index');
    return WorkflowExecution.findByPk(id);
  }
}

module.exports = new WorkflowEngine();
