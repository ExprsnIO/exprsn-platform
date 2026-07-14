'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * UGC text-moderation queue  (FEAT-009 / ADR 0004 §4)
 *
 * The SHARED moderation lane for native user-generated *text* — timeline posts
 * and spark messages — generalised from the FEAT-031 image lane
 * (`services/filevault/src/queues/imageModeration.js`, the proven pattern).
 *
 * This is distinct from `filevault-image-moderation`: that lane needs the file
 * BYTES + the cortex vision model and stays exactly as it is (ADR 0004 §4). This
 * lane scores TEXT via `moderationService.moderateContent` and writes verdicts
 * back through each module's published sink.
 *
 * Producers live in the GATEWAY process (timeline/spark invariants, next phase)
 * and call `submitForModeration()` in-process, fire-and-forget. The consumer is
 * a SEPARATE worker (`services/moderator/src/worker.js`,
 * `npm run worker:moderation`) — never the gateway.
 *
 * Require-time is side-effect-free: the Bull queue is built lazily by
 * `initQueues()` so this module can be required from the gateway (to enqueue)
 * and from the worker (to drain) without opening a Redis connection until first
 * use — the same discipline `imageModeration.js` uses.
 * ═══════════════════════════════════════════════════════════
 */

const crypto = require('crypto');
const Queue = require('bull');
const logger = require('../utils/logger');

const QUEUE_NAME = 'moderate-ugc';

// The job name registered by the worker's processor. One name, one processor.
const JOB_NAME = 'moderate-ugc';

const queues = { ugc: null };

/**
 * Redis connection for this lane.
 *
 * ADR 0004 §4: "shared Redis, db 0 — same instance as every other Bull queue."
 * We deliberately do NOT read `REDIS_DB` (moderator's own config defaults that
 * to 3 for its `moderation`/`queueRegistry` queues); this lane lives on db 0
 * alongside `filevault-image-moderation`, `worker:timeline`, etc., so a single
 * `bull` dashboard sees every UGC job. Override with MODERATE_UGC_REDIS_DB only
 * if the whole platform's Bull db is relocated.
 */
function redisOptions() {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.MODERATE_UGC_REDIS_DB || 0),
    // Required for Bull on ioredis: unbounded command retries + no ready check
    // so a transient Redis blip doesn't hard-fail enqueue/consume.
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

/**
 * Job options mirror `services/filevault/src/queues/imageModeration.js:40`
 * verbatim (ADR 0004 §4): text moderation is idempotent (same text + same
 * provider ⇒ same verdict, and `moderateContent` dedupes on
 * (sourceService,contentType,contentId)), so retrying is safe; the failed-set is
 * the DLQ an admin triages.
 */
function defaultJobOptions() {
  return {
    attempts: Number(process.env.MODERATE_UGC_ATTEMPTS) || 4,
    backoff: { type: 'exponential', delay: 30000 },
    removeOnComplete: { age: 3600, count: 1000 },
    // Keep failures for a day: the failed-set IS the DLQ the terminal-state
    // ladder (§4.2) surfaces `status='failed'` items into.
    removeOnFail: { age: 86400 },
  };
}

function initQueues() {
  if (queues.ugc) return queues;
  queues.ugc = new Queue(QUEUE_NAME, {
    redis: redisOptions(),
    defaultJobOptions: defaultJobOptions(),
  });
  queues.ugc.on('error', (error) => {
    logger.error('moderate-ugc queue error', { error: error.message });
  });
  queues.ugc.on('failed', (job, error) => {
    logger.error('moderate-ugc job failed', {
      jobId: job && job.id,
      sourceService: job && job.data && job.data.sourceService,
      contentType: job && job.data && job.data.contentType,
      contentId: job && job.data && job.data.contentId,
      attemptsMade: job && job.attemptsMade,
      error: error.message, // never raw content
    });
  });
  return queues;
}

async function closeQueues() {
  if (queues.ugc) {
    await queues.ugc.close();
    queues.ugc = null;
  }
}

/** sha256 hex of the judged text — the compare-and-set token (BUG-022). */
function hashContent(text) {
  return crypto.createHash('sha256').update(String(text == null ? '' : text)).digest('hex');
}

/** Stable, dedupe-able job id: `<service>:<type>:<id>` (ADR 0004 §4). */
function jobIdFor({ sourceService, contentType, contentId }) {
  return `${sourceService}:${contentType}:${contentId}`;
}

/**
 * Normalise + validate a producer payload into the exact job shape the worker
 * consumes. Throws on a missing discriminator (a programming error at the call
 * site) — `submitForModeration` wraps this so producers never see the throw.
 */
function buildJobData(payload) {
  const {
    sourceService, contentType, contentId, userId,
    contentText = null, contentUrl = null, contentMetadata = {},
  } = payload || {};

  if (!sourceService || !contentType || !contentId) {
    throw new Error('submitForModeration: sourceService, contentType and contentId are required');
  }

  // The producer computes contentHash once and writes it onto the pre-created
  // side-table row; we forward the same value so the sink's compare-and-set can
  // detect a mid-flight edit. Fall back to hashing here only defensively.
  const contentHash = payload.contentHash || hashContent(contentText);

  return {
    sourceService,
    contentType,
    contentId: String(contentId),
    userId: userId || null,
    contentText,
    contentUrl,
    contentMetadata,
    contentHash,
  };
}

/**
 * THE public producer surface (ADR 0004 §4.1). Other modules require this file
 * in-process (the atproto-bridge pattern) and call it fire-and-forget:
 *
 *   require('.../moderator/src/queues/ugcModeration')
 *     .submitForModeration({ sourceService, contentType, contentId, userId,
 *                            contentText, contentHash, mode })
 *
 * Best-effort by contract: it NEVER throws into the caller's request path
 * (fail-OPEN write path, §5a). A Redis outage leaves the pre-created side-table
 * row in `status='pending'` and the reconcile sweep re-enqueues it later — row
 * existence, not the job, is the source of truth (§4.1).
 *
 * `mode: 'reset'` (an EDIT re-moderation) removes the stale job first: Bull
 * silently no-ops `add()` on a live jobId, so a plain re-add would reuse the old
 * job and re-apply the STALE verdict (BUG-016). Distinct from the content-hash
 * compare-and-set (BUG-022): reset kills a stale JOB, the hash kills a stale
 * VERDICT — the design needs both.
 *
 * @returns {Promise<boolean>} true if enqueued, false if it was swallowed.
 */
async function submitForModeration(payload) {
  let data;
  try {
    data = buildJobData(payload);
  } catch (err) {
    logger.error('submitForModeration: invalid payload; not enqueued', { error: err.message });
    return false;
  }

  const jobId = jobIdFor(data);
  const mode = (payload && payload.mode) || 'create';

  try {
    initQueues();
    if (mode === 'reset') {
      const existing = await queues.ugc.getJob(jobId);
      if (existing) await existing.remove().catch(() => {});
    }
    await queues.ugc.add(JOB_NAME, data, { jobId });
    return true;
  } catch (err) {
    logger.error('could not enqueue UGC moderation; content stays pending', {
      sourceService: data.sourceService,
      contentType: data.contentType,
      contentId: data.contentId,
      error: err.message,
    });
    return false;
  }
}

async function queueStats() {
  if (!queues.ugc) return { initialized: false };
  try {
    const [waiting, active, failed, delayed] = await Promise.all([
      queues.ugc.getWaitingCount(),
      queues.ugc.getActiveCount(),
      queues.ugc.getFailedCount(),
      queues.ugc.getDelayedCount(),
    ]);
    return { initialized: true, waiting, active, failed, delayed };
  } catch (e) {
    return { initialized: true, error: e.message };
  }
}

module.exports = {
  QUEUE_NAME,
  JOB_NAME,
  queues,
  initQueues,
  closeQueues,
  queueStats,
  submitForModeration,
  buildJobData,
  jobIdFor,
  hashContent,
};
