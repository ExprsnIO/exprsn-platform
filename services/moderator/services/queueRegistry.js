/**
 * ═══════════════════════════════════════════════════════════
 * Queue Registry Service
 * ─────────────────────────────────────────────────────────────
 * Admin-defined named review "buckets". Each bucket is a spec persisted in
 * moderator_config (category 'queues', key `queue_<sanitized-name>`), backed by
 * a real broker queue — Bull/Redis OR RabbitMQ.
 *
 *  - Moderation items route into matching buckets via the rule engine: each
 *    bucket's optional `match` condition tree is evaluated with
 *    ruleEngineService.evaluateSingleRule(). No `match` ⇒ manual placement only.
 *  - Every enabled bucket gets a per-bucket CONSUMER that "processes" routed
 *    items (records them for review + bumps a processed counter). Failures are
 *    retried up to `attempts` then DEAD-LETTERED: Bull buckets to a companion
 *    `modq:<name>:dlq` queue; RabbitMQ buckets to `<queue>.dlq` (via the shared
 *    rabbit helper).
 * ═══════════════════════════════════════════════════════════
 */

const Bull = require('bull');
const rabbit = require('@exprsn/shared/utils/rabbit');
const logger = require('../src/utils/logger');
const config = require('../config');
const ruleEngineService = require('./ruleEngineService');

const KEY_PREFIX = 'queue_';
const CATEGORY = 'queues';
const BULL_PREFIX = 'modq:';

const PRIORITY_SCORE = { low: 20, normal: 50, high: 75, urgent: 95 };

class QueueRegistry {
  constructor() {
    this._live = new Map();        // name → live Bull work queue
    this._dlq = new Map();         // name → Bull dead-letter queue
    this._consumers = new Set();   // names with a registered consumer (Bull or rabbit)
    this._rabbitReady = new Set(); // rabbit buckets whose topology+consumer are up
    this._rabbitPending = new Map(); // name → publishes we couldn't deliver (broker down)
    this._processed = new Map();   // name → items the consumer has processed
    try { rabbit.setLogger(logger); } catch (_) { /* noop */ }
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  _models() {
    return require('../models/sequelize-index');
  }

  sanitizeName(name) {
    return String(name || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  }

  _key(name) { return `${KEY_PREFIX}${this.sanitizeName(name)}`; }
  _bullName(name) { return `${BULL_PREFIX}${this.sanitizeName(name)}`; }
  _dlqName(name) { return `${BULL_PREFIX}${this.sanitizeName(name)}:dlq`; }
  _rabbitQueue(name) { return `${BULL_PREFIX}${this.sanitizeName(name)}`; }
  _exchange(spec) { return (spec.rabbit && spec.rabbit.exchange) || `modx:${spec.name}`; }
  _routingKey(spec) { return (spec.rabbit && spec.rabbit.routingKey) || spec.name; }

  _redisConfig() {
    return {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      maxRetriesPerRequest: null,
      enableReadyCheck: false
    };
  }

  _normalize(spec = {}) {
    const name = this.sanitizeName(spec.name);
    const backoff = spec.backoff && typeof spec.backoff === 'object' ? spec.backoff : {};
    return {
      name,
      displayName: spec.displayName || spec.name || name,
      description: spec.description || '',
      backend: spec.backend === 'rabbitmq' ? 'rabbitmq' : 'redis',
      enabled: spec.enabled !== false,
      priority: ['low', 'normal', 'high', 'urgent'].includes(spec.priority) ? spec.priority : 'normal',
      concurrency: Number.isInteger(spec.concurrency) ? spec.concurrency : 4,
      attempts: Number.isInteger(spec.attempts) ? spec.attempts : 3,
      backoff: {
        type: backoff.type === 'fixed' ? 'fixed' : 'exponential',
        delay: Number.isInteger(backoff.delay) ? backoff.delay : 2000
      },
      deadLetter: spec.deadLetter === true,
      rateLimit:
        spec.rateLimit && typeof spec.rateLimit === 'object'
          ? { max: parseInt(spec.rateLimit.max, 10) || 0, duration: parseInt(spec.rateLimit.duration, 10) || 0 }
          : null,
      rabbit:
        spec.rabbit && typeof spec.rabbit === 'object'
          ? {
            exchange: spec.rabbit.exchange || '',
            exchangeType: ['topic', 'direct', 'fanout'].includes(spec.rabbit.exchangeType) ? spec.rabbit.exchangeType : 'direct',
            routingKey: spec.rabbit.routingKey || '',
            durable: spec.rabbit.durable !== false,
            dlx: spec.rabbit.dlx || ''
          }
          : null,
      match: spec.match && typeof spec.match === 'object' ? spec.match : null
    };
  }

  _payload(spec, context = {}) {
    const scores = { riskScore: context.riskScore, ...(context.scores || {}) };
    return {
      moderationItemId: context.moderationItemId,
      contentId: context.contentId,
      contentType: context.contentType,
      sourceService: context.sourceService,
      contentText: context.contentText,
      contentMetadata: context.contentMetadata || (context.authorDid ? { authorDid: context.authorDid } : {}),
      authorDid: context.authorDid,
      scores,
      riskScore: context.riskScore,
      action: context.action,
      _forceFail: context._forceFail === true || undefined,
      queue: spec.name,
      routedAt: new Date().toISOString()
    };
  }

  // ── persistence ──────────────────────────────────────────────────────────

  async listQueues() {
    try {
      const { ModeratorConfig } = this._models();
      const rows = await ModeratorConfig.findAll({ where: { category: CATEGORY } });
      return rows.filter((r) => String(r.key).startsWith(KEY_PREFIX)).map((r) => this._normalize(r.value || {}));
    } catch (error) {
      logger.error('Failed to list queues', { error: error.message });
      return [];
    }
  }

  async getQueue(name) {
    try {
      const { ModeratorConfig } = this._models();
      const val = await ModeratorConfig.getConfig(this._key(name), null);
      return val ? this._normalize(val) : null;
    } catch (error) {
      logger.error('Failed to get queue', { name, error: error.message });
      return null;
    }
  }

  async saveQueue(spec, updatedBy = null) {
    const normalized = this._normalize(spec);
    if (!normalized.name || !/^[a-z0-9_]+$/.test(normalized.name)) {
      throw new Error('Invalid queue name (must sanitize to ^[a-z0-9_]+$)');
    }
    const { ModeratorConfig } = this._models();
    await ModeratorConfig.setConfig(this._key(normalized.name), normalized, CATEGORY, updatedBy);
    // A spec change may flip backend/enabled — drop cached live state so it's rebuilt.
    await this._teardown(normalized.name);
    logger.info('Queue saved', { name: normalized.name, backend: normalized.backend, enabled: normalized.enabled });
    return normalized;
  }

  async deleteQueue(name) {
    const sanitized = this.sanitizeName(name);
    const { ModeratorConfig } = this._models();
    const deleted = await ModeratorConfig.destroy({ where: { key: this._key(sanitized) } });
    await this._teardown(sanitized, { deleteRabbit: true });
    logger.info('Queue deleted', { name: sanitized, deleted });
    return deleted > 0;
  }

  /** Close + forget any live state for a bucket (Bull instances, consumer flags). */
  async _teardown(name, { deleteRabbit = false } = {}) {
    const live = this._live.get(name);
    if (live) { try { await live.close(); } catch (_) { /* noop */ } this._live.delete(name); }
    const dlq = this._dlq.get(name);
    if (dlq) { try { await dlq.close(); } catch (_) { /* noop */ } this._dlq.delete(name); }
    this._consumers.delete(name);
    this._rabbitReady.delete(name);
    this._rabbitPending.delete(name);
    if (deleteRabbit) { try { await rabbit.deleteQueue(this._rabbitQueue(name)); } catch (_) { /* noop */ } }
  }

  // ── consumer ───────────────────────────────────────────────────────────────

  /**
   * Process one routed item. Best-effort records the item into the review queue
   * (so it surfaces in the Queue tab) and bumps the processed counter. Throws on
   * a `_forceFail` payload so the dead-letter path can be exercised/verified.
   */
  async _processItem(spec, payload = {}) {
    if (payload && payload._forceFail) {
      throw new Error('forced failure (dead-letter test)');
    }
    if (payload && payload.moderationItemId) {
      try {
        const { ReviewQueue } = this._models();
        const existing = await ReviewQueue.findOne({ where: { moderationItemId: payload.moderationItemId } });
        if (!existing) {
          await ReviewQueue.create({
            moderationItemId: payload.moderationItemId,
            priority: PRIORITY_SCORE[spec.priority] || 50,
            escalated: spec.priority === 'urgent',
            escalatedReason: spec.priority === 'urgent' ? `Routed to ${spec.name}` : null,
            status: 'pending',
            queuedAt: Date.now()
          });
        }
      } catch (e) {
        // FK / transient errors must not fail the consumer (it would dead-letter
        // a perfectly valid item). Log and continue.
        logger.warn('Bucket consumer review-queue upsert failed', { name: spec.name, error: e.message });
      }
    }
    this._processed.set(spec.name, (this._processed.get(spec.name) || 0) + 1);
  }

  // ── live queues (Bull) + consumers ──────────────────────────────────────────

  async ensureLiveQueues() {
    const specs = await this.listQueues();
    for (const spec of specs) {
      if (!spec.enabled) continue;
      if (spec.backend === 'rabbitmq') {
        await this._ensureRabbit(spec);
        continue;
      }
      await this._ensureBull(spec);
    }
    return Array.from(this._live.keys());
  }

  async _ensureBull(spec) {
    if (!this._live.has(spec.name)) {
      try {
        const opts = {
          redis: this._redisConfig(),
          defaultJobOptions: { attempts: spec.attempts, backoff: { type: spec.backoff.type, delay: spec.backoff.delay } }
        };
        if (spec.rateLimit && spec.rateLimit.max > 0 && spec.rateLimit.duration > 0) {
          opts.limiter = { max: spec.rateLimit.max, duration: spec.rateLimit.duration };
        }
        const queue = new Bull(this._bullName(spec.name), opts);
        this._live.set(spec.name, queue);
        if (spec.deadLetter && !this._dlq.has(spec.name)) {
          this._dlq.set(spec.name, new Bull(this._dlqName(spec.name), { redis: this._redisConfig() }));
        }
        logger.info('Live queue ensured', { name: spec.name, bull: this._bullName(spec.name) });
      } catch (error) {
        logger.error('Failed to ensure live queue', { name: spec.name, error: error.message });
        return;
      }
    }
    // Register the per-bucket consumer once.
    if (!this._consumers.has(spec.name)) {
      const queue = this._live.get(spec.name);
      if (!queue) return;
      try {
        // Jobs are enqueued with the name 'review' (see _deliver), so the
        // processor must be registered under that same name — a nameless
        // processor would never pick them up ("Missing process handler").
        queue.process('review', spec.concurrency, async (job) => this._processItem(spec, job.data));
        queue.on('failed', async (job, err) => {
          const max = (job.opts && job.opts.attempts) || spec.attempts;
          if (job.attemptsMade >= max) {
            const dlq = this._dlq.get(spec.name);
            if (dlq) {
              try {
                await dlq.add('dead', { payload: job.data, error: err.message, attempts: job.attemptsMade, failedAt: new Date().toISOString() });
                logger.warn('Bucket job dead-lettered (redis)', { name: spec.name, error: err.message });
              } catch (e) {
                logger.warn('Failed to dead-letter job', { name: spec.name, error: e.message });
              }
            }
          }
        });
        this._consumers.add(spec.name);
        logger.info('Bucket consumer registered (redis)', { name: spec.name, concurrency: spec.concurrency });
      } catch (e) {
        logger.warn('Failed to register bucket consumer', { name: spec.name, error: e.message });
      }
    }
  }

  /** Assert RabbitMQ topology + start the consumer for a rabbit bucket (once). */
  async _ensureRabbit(spec) {
    if (this._rabbitReady.has(spec.name)) return true;
    if (!rabbit.isEnabled()) {
      if (!this._rabbitPending.has(spec.name)) this._rabbitPending.set(spec.name, 0);
      return false;
    }
    try {
      const exchange = this._exchange(spec);
      const exchangeType = (spec.rabbit && spec.rabbit.exchangeType) || 'direct';
      const queue = this._rabbitQueue(spec.name);
      const routingKey = this._routingKey(spec);
      await rabbit.assertTopology({ exchange, exchangeType, routingKey, queue, durable: true, deadLetter: spec.deadLetter });
      await rabbit.consume(queue, async (payload) => this._processItem(spec, payload), {
        prefetch: spec.concurrency,
        maxAttempts: spec.attempts,
        deadLetter: spec.deadLetter
      });
      this._rabbitReady.add(spec.name);
      this._consumers.add(spec.name);
      logger.info('Bucket consumer registered (rabbitmq)', { name: spec.name, exchange, queue });
      return true;
    } catch (e) {
      logger.warn('Failed to ensure rabbit bucket', { name: spec.name, error: e.message });
      return false;
    }
  }

  // ── routing ──────────────────────────────────────────────────────────────

  async route(context = {}) {
    const routed = [];
    try {
      const content = {
        contentType: context.contentType,
        sourceService: context.sourceService,
        contentText: context.contentText,
        contentMetadata: context.contentMetadata || (context.authorDid ? { authorDid: context.authorDid } : {}),
        authorDid: context.authorDid
      };
      const scores = { riskScore: context.riskScore, ...(context.scores || {}) };

      const specs = await this.listQueues();
      for (const spec of specs) {
        if (!spec.enabled || !spec.match) continue;
        let matched = false;
        try {
          matched = await ruleEngineService.evaluateSingleRule(
            { conditions: spec.match, appliesTo: null, sourceServices: null, thresholdScore: null },
            content,
            scores
          );
        } catch (e) {
          logger.warn('Queue match evaluation failed', { name: spec.name, error: e.message });
          continue;
        }
        if (!matched) continue;
        if (await this._deliver(spec, context)) routed.push(spec.name);
      }
    } catch (error) {
      logger.error('Queue routing failed', { error: error.message });
      return [];
    }
    return routed;
  }

  /** Enqueue into a SPECIFIC named bucket (workflow `route_queue` steps). */
  async enqueue(name, context = {}) {
    const spec = await this.getQueue(name);
    if (!spec || !spec.enabled) return false;
    return this._deliver(spec, context);
  }

  /** Deliver a payload to a bucket on its backend. Best-effort; never throws. */
  async _deliver(spec, context) {
    const payload = this._payload(spec, context);
    try {
      if (spec.backend === 'rabbitmq') {
        if (rabbit.isEnabled()) {
          await this._ensureRabbit(spec);
          await rabbit.publish(this._exchange(spec), this._routingKey(spec), payload);
          logger.info('Queue route (rabbitmq)', { name: spec.name, contentId: payload.contentId });
          return true;
        }
        // Broker unavailable → record the would-be delivery so it's visible.
        this._rabbitPending.set(spec.name, (this._rabbitPending.get(spec.name) || 0) + 1);
        return true;
      }
      await this._ensureBull(spec);
      const queue = this._live.get(spec.name);
      if (!queue) return false;
      const jobId = `${this.sanitizeName(spec.name)}:${context.contentId || context.moderationItemId || Date.now()}`;
      await queue.add('review', payload, { jobId });
      logger.info('Queue route (redis)', { name: spec.name, jobId });
      return true;
    } catch (e) {
      logger.warn('Failed to deliver routed item', { name: spec.name, backend: spec.backend, error: e.message });
      if (spec.backend === 'rabbitmq') this._rabbitPending.set(spec.name, (this._rabbitPending.get(spec.name) || 0) + 1);
      return false;
    }
  }

  // ── dead-letter management ─────────────────────────────────────────────────

  async _ensureDlqQueue(name) {
    if (this._dlq.has(name)) return this._dlq.get(name);
    try {
      const q = new Bull(this._dlqName(name), { redis: this._redisConfig() });
      this._dlq.set(name, q);
      return q;
    } catch (e) {
      logger.warn('Failed to ensure dlq queue', { name, error: e.message });
      return null;
    }
  }

  /** Inspect a bucket's dead-letter queue: { items, depth }. */
  async listDlq(name, limit = 50) {
    const spec = await this.getQueue(name);
    if (!spec) return { items: [], depth: 0 };
    if (spec.backend === 'rabbitmq') {
      if (!rabbit.isEnabled()) return { items: [], depth: 0 };
      const q = `${this._rabbitQueue(spec.name)}.dlq`;
      // Read depth BEFORE peeking — peek holds messages unacked while reading,
      // which would make a depth-after read momentarily report 0.
      const depth = await rabbit.queueDepth(q);
      return { items: await rabbit.peek(q, limit), depth };
    }
    const dlq = await this._ensureDlqQueue(spec.name);
    if (!dlq) return { items: [], depth: 0 };
    const jobs = await dlq.getJobs(['waiting', 'delayed', 'paused', 'active'], 0, Math.max(0, limit - 1));
    const depth = (await dlq.getJobCounts()).waiting || 0;
    return { items: jobs.map((j) => j.data), depth };
  }

  /** Move dead-lettered items back onto the bucket. Returns how many moved. */
  async redriveDlq(name, limit = 100) {
    const spec = await this.getQueue(name);
    if (!spec) return 0;
    if (spec.backend === 'rabbitmq') {
      if (!rabbit.isEnabled()) return 0;
      await this._ensureRabbit(spec);
      return rabbit.redrive(`${this._rabbitQueue(spec.name)}.dlq`, this._exchange(spec), this._routingKey(spec), limit);
    }
    const dlq = await this._ensureDlqQueue(spec.name);
    await this._ensureBull(spec);
    const main = this._live.get(spec.name);
    if (!dlq || !main) return 0;
    const jobs = await dlq.getJobs(['waiting', 'delayed', 'paused'], 0, Math.max(0, limit - 1));
    let moved = 0;
    for (const j of jobs) {
      const original = j.data && j.data.payload !== undefined ? j.data.payload : j.data;
      const cid = original && original.contentId;
      await main.add('review', original, { jobId: `${this.sanitizeName(spec.name)}:redrive:${cid || j.id}` });
      await j.remove();
      moved++;
    }
    logger.info('DLQ redriven', { name: spec.name, moved });
    return moved;
  }

  /** Empty a bucket's dead-letter queue. Returns how many were purged. */
  async purgeDlq(name) {
    const spec = await this.getQueue(name);
    if (!spec) return 0;
    if (spec.backend === 'rabbitmq') {
      if (!rabbit.isEnabled()) return 0;
      return rabbit.purgeQueue(`${this._rabbitQueue(spec.name)}.dlq`);
    }
    const dlq = await this._ensureDlqQueue(spec.name);
    if (!dlq) return 0;
    const before = (await dlq.getJobCounts()).waiting || 0;
    await dlq.empty();
    logger.info('DLQ purged', { name: spec.name, purged: before });
    return before;
  }

  // ── stats ────────────────────────────────────────────────────────────────

  async stats() {
    const out = [];
    const specs = await this.listQueues();
    for (const spec of specs) {
      const entry = {
        name: spec.name,
        displayName: spec.displayName,
        backend: spec.backend,
        enabled: spec.enabled,
        priority: spec.priority,
        concurrency: spec.concurrency,
        match: !!spec.match,
        consumer: this._consumers.has(spec.name),
        processed: this._processed.get(spec.name) || 0,
        counts: null
      };
      if (spec.backend === 'rabbitmq') {
        if (spec.enabled) await this._ensureRabbit(spec);
        const depth = rabbit.isEnabled() ? await rabbit.queueDepth(this._rabbitQueue(spec.name)) : 0;
        const dlq = rabbit.isEnabled() ? await rabbit.queueDepth(`${this._rabbitQueue(spec.name)}.dlq`) : 0;
        entry.counts = { wired: rabbit.isEnabled(), depth, dlq, pending: this._rabbitPending.get(spec.name) || 0 };
      } else {
        if (spec.enabled) await this._ensureBull(spec);
        const queue = this._live.get(spec.name);
        const base = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, dlq: 0 };
        if (queue) {
          try {
            Object.assign(base, await queue.getJobCounts());
          } catch (e) { logger.warn('Failed to read job counts', { name: spec.name, error: e.message }); }
        }
        const dlq = this._dlq.get(spec.name);
        if (dlq) { try { base.dlq = (await dlq.getJobCounts()).waiting || 0; } catch (_) { /* noop */ } }
        entry.counts = base;
      }
      out.push(entry);
    }
    return out;
  }

  async clearCache() {
    for (const name of new Set([...this._live.keys(), ...this._dlq.keys()])) {
      await this._teardown(name);
    }
    this._rabbitReady.clear();
    this._rabbitPending.clear();
  }
}

module.exports = new QueueRegistry();
