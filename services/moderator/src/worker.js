'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * UGC text-moderation worker  (FEAT-009 / ADR 0004 §4)
 * Run with:  npm run worker:moderation
 *
 * Drains `moderate-ugc` (shared Redis). For each timeline post / spark message:
 * runs the moderator's IN-PROCESS verdict engine (`moderateContent`, never an
 * HTTP self-call — TASK-009), then writes the verdict back through the source
 * module's PUBLISHED SINK (which writes ONLY its own schema — per-schema
 * isolation, ADR 0004 §Consequences 2). A SEPARATE process from the gateway.
 *
 * The lane FileVault's image worker does NOT implement: an explicit
 * TERMINAL-STATE LADDER (§4.2) so a permanently-unavailable scorer can never
 * leave a row cycling forever (the poison loop). See `processJob` below.
 *
 * All heavy dependencies (the model layer via `moderationService`, the AI
 * provider factory, the module sinks) are resolved LAZILY / injectably so this
 * file can be unit-tested without a live DB/Redis (`tests/worker/`), and so a
 * deployment missing a given module still boots.
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();
const logger = require('./utils/logger');
const queue = require('./queues/ugcModeration');
const sinkRegistry = require('../services/ugcSinkRegistry');

// Valid `content_type` values, mirrored from
// `services/moderator/models/ModerationCase.js:20-23`. An invalid value throws
// inside moderateContent's dedupe query (the silent-failure shape of BUG-015),
// so we ASSERT rather than assume (ADR 0004 §4). This lane carries 'post' and
// 'message'; the full set is validated for forward-compat.
const VALID_CONTENT_TYPES = new Set([
  'text', 'image', 'video', 'audio', 'post', 'comment', 'message', 'profile', 'file',
]);

// A moderator ACTION that auto-retracts content. Everything else — including a
// "requires human review" verdict — leaves TEXT servable (fail-OPEN visibility,
// §5b): the content was already published, and a human's later decision arrives
// via the HTTP action sink (POST /<module>/api/moderation/action) and flips the
// row to 'rejected' then. Only a hard remove/reject/hide auto-retracts.
const REMOVE_ACTIONS = new Set(['reject', 'remove', 'hide']);

let reconcileTimer = null;

// ── Default (production) dependency resolvers — lazy so require-time is DB-free
//    and so tests can inject fakes without any of these being constructed.

function defaultHasAiProvider() {
  // eslint-disable-next-line global-require
  return require('./ai-providers').getAvailableProviders().length > 0;
}

function lazyModerationService() {
  // eslint-disable-next-line global-require
  return require('../services/moderationService');
}

/**
 * Map a moderator verdict (`moderateContent` result) onto the side-table patch
 * the module sink applies. `status` is the SERVABILITY decision; `action` is the
 * precise moderator verdict, mirrored so the sink can enforce (retract) locally.
 */
function mapVerdictToSink(result) {
  const rejected = result.status === 'rejected' || REMOVE_ACTIONS.has(result.action);
  return {
    status: rejected ? 'rejected' : 'approved',
    reason: rejected ? 'flagged' : 'clean',
    action: result.action || null,
    riskScore: typeof result.riskScore === 'number' ? result.riskScore : null,
    moderationItemId: result.moderationId || null,
    verdict: {
      riskLevel: result.riskLevel,
      requiresReview: result.requiresReview,
      scores: result.scores,
    },
  };
}

/**
 * Write a patch through a module sink. Never throws; returns a discriminated
 * result the ladder reasons about:
 *   { superseded:true }  — content-hash compare-and-set missed (BUG-022)
 *   { applied:true }     — verdict written + enforced
 *   { noSink:true }      — no sink published yet (verdict deferred, not lost)
 *   { error }            — sink threw (module DB blip) — caller may retry
 */
async function applyToSink(sink, patch, log) {
  if (!sink || typeof sink.applyVerdict !== 'function') {
    log.warn('verdict computed but no sink to apply it (deferred until module sink ships)', {
      sourceService: patch.sourceService, contentType: patch.contentType,
      contentId: patch.contentId, status: patch.status,
    });
    return { applied: false, noSink: true };
  }
  try {
    const res = await sink.applyVerdict(patch);
    return res || { applied: true };
  } catch (err) {
    log.error('sink.applyVerdict failed', {
      sourceService: patch.sourceService, contentId: patch.contentId, error: err.message,
    });
    return { applied: false, error: err.message };
  }
}

/**
 * THE terminal-state ladder (ADR 0004 §4.2). Order is non-negotiable.
 *
 * @param {import('bull').Job} job
 * @param {object} injected  test/override deps: { logger, hasAiProvider,
 *        resolveSink, moderationService }
 */
async function processJob(job, injected = {}) {
  const log = injected.logger || logger;
  const hasAiProvider = injected.hasAiProvider || defaultHasAiProvider;
  const resolveSink = injected.resolveSink || sinkRegistry.resolveSink;
  const moderationService = injected.moderationService || lazyModerationService();

  const data = job.data || {};
  const { sourceService, contentType, contentId, contentHash } = data;
  const key = { sourceService, contentType, contentId };

  const maxAttempts = (job.opts && job.opts.attempts) || Number(process.env.MODERATE_UGC_ATTEMPTS) || 4;
  const attemptNo = (job.attemptsMade || 0) + 1;
  const isFinalAttempt = attemptNo >= maxAttempts;

  const sink = resolveSink(sourceService);

  // 0. GUARD FIRST (§4.2.1): no AI provider configured ⇒ terminal 'skipped'
  //    (servable), NEVER enter the retry loop (F3 — else the reconcile sweep
  //    hammers a dead engine forever, turning "no AI" into an outage).
  if (!hasAiProvider()) {
    await applyToSink(sink, { ...key, status: 'skipped', reason: 'no_ai_provider', contentHash }, log);
    return { status: 'skipped', reason: 'no_ai_provider' };
  }

  // Assert contentType (BUG-015). An invalid value is a deterministic,
  // non-retryable error → fail-CLOSED terminally instead of burning 4 attempts.
  if (!VALID_CONTENT_TYPES.has(contentType)) {
    await applyToSink(sink, { ...key, status: 'failed', reason: 'invalid_content_type', contentHash }, log);
    log.error('invalid contentType for moderation; failing terminally', { contentType, contentId });
    return { status: 'failed', reason: 'invalid_content_type' };
  }

  // 1. Score IN-PROCESS (TASK-009). moderateContent dedupes on
  //    (sourceService,contentType,contentId), so at-least-once retry is safe.
  let result;
  try {
    result = await moderationService.moderateContent({
      contentType,
      contentId,
      sourceService,
      userId: data.userId || undefined,
      contentText: data.contentText,
      contentUrl: data.contentUrl || undefined,
      contentMetadata: data.contentMetadata || {},
    });
  } catch (err) {
    const msg = String((err && err.message) || err).slice(0, 500); // never raw content
    if (isFinalAttempt) {
      // 3. Attempts EXHAUSTED ⇒ fail-CLOSED: write 'failed' (NEVER 'approved',
      //    §5c) BEFORE the terminal throw, so the row is terminal (not
      //    re-swept) and surfaces as a DLQ item (removeOnFail 24h).
      await applyToSink(sink, { ...key, status: 'failed', reason: 'error', lastError: msg, contentHash, bumpAttempts: true }, log);
      log.error('UGC moderation exhausted retries; failed (fail-closed)', { ...key, attemptNo, error: msg });
      throw err;
    }
    // 2. TRANSIENT ⇒ stay 'pending', bump attempts, THROW so Bull retries with
    //    exponential backoff.
    await applyToSink(sink, { ...key, status: 'pending', reason: 'error', lastError: msg, contentHash, bumpAttempts: true }, log);
    log.warn('UGC moderation transient error; will retry', { ...key, attemptNo, error: msg });
    throw err;
  }

  // Real verdict → map, then apply with a content-hash COMPARE-AND-SET (§4.2.2,
  // BUG-022): the sink writes ONLY if content_hash still matches — if the text
  // was edited under us, the verdict is discarded and the row stays 'pending'
  // (a fresh job for the new text is already queued).
  const patch = mapVerdictToSink(result);
  const res = await applyToSink(sink, { ...key, ...patch, contentHash }, log);

  if (res && res.superseded) {
    log.warn('content changed during moderation; verdict discarded (BUG-022)', { ...key });
    return { status: 'superseded' };
  }
  if (res && res.error) {
    // The verdict is computed (and persisted in moderator's own schema) but the
    // module-local write failed. moderateContent is idempotent, so retry; a
    // persistently unavailable sink leaves the row 'pending' for the reconcile
    // sweep to retry when the module recovers.
    throw new Error(`sink.applyVerdict failed for ${sourceService}:${contentId}: ${res.error}`);
  }

  log.info('UGC moderated', { ...key, status: patch.status, action: patch.action, riskScore: patch.riskScore });
  return { status: patch.status, action: patch.action, riskScore: patch.riskScore, superseded: false };
}

/**
 * Reconcile stuck-pending content (§4.2 step 6). Asks EACH published sink for
 * its own rows stranded at status='pending' past a grace window and re-enqueues
 * them. The worker never reads another module's tables — each module reports its
 * own pending rows (`listStalePending`), so per-schema isolation holds.
 *
 * Only 'pending' rows are returned by the contract, so 'failed'/'skipped'/
 * 'approved'/'rejected' are terminal and NEVER re-swept — this is precisely what
 * stops the poison loop. Never throws into the caller.
 */
async function reconcileStuckPending(injected = {}) {
  const log = injected.logger || logger;
  const resolveSink = injected.resolveSink || sinkRegistry.resolveSink;
  const knownSinks = injected.knownSinks || sinkRegistry.knownSinks;
  const submitForModeration = injected.submitForModeration || queue.submitForModeration;

  const graceMs = Number(process.env.MODERATE_UGC_RECONCILE_GRACE_MS) || 5 * 60 * 1000;
  const limit = Number(process.env.MODERATE_UGC_RECONCILE_LIMIT) || 500;
  let requeued = 0;

  for (const sourceService of knownSinks()) {
    const sink = resolveSink(sourceService);
    if (!sink || typeof sink.listStalePending !== 'function') continue;
    try {
      const rows = (await sink.listStalePending({ graceMs, limit })) || [];
      for (const row of rows) {
        // eslint-disable-next-line no-await-in-loop
        if (await submitForModeration({ ...row, sourceService, mode: 'create' })) requeued += 1;
      }
    } catch (err) {
      log.error('reconcile sweep failed for a module', { sourceService, error: err.message });
    }
  }
  if (requeued) log.warn('reconciled stuck-pending UGC', { requeued });
  return requeued;
}

async function startWorker() {
  try {
    logger.info('Starting UGC text-moderation worker (FEAT-009)');
    queue.initQueues();

    const concurrency = Math.max(1, Number(process.env.MODERATE_UGC_CONCURRENCY) || 2);
    queue.queues.ugc.process(queue.JOB_NAME, concurrency, (job) => processJob(job));

    // Periodic self-heal for rows orphaned in 'pending' (§4.1/§4.2 step 6).
    // Interval unref'd so it never keeps the process alive on its own; one early
    // pass catches anything stranded by the last crash.
    const reconcileEveryMs = Number(process.env.MODERATE_UGC_RECONCILE_INTERVAL_MS) || 5 * 60 * 1000;
    reconcileTimer = setInterval(() => reconcileStuckPending().catch(() => {}), reconcileEveryMs);
    reconcileTimer.unref();
    setTimeout(() => reconcileStuckPending().catch(() => {}), 15000).unref();

    logger.info('UGC text-moderation worker started', {
      queue: queue.QUEUE_NAME,
      concurrency,
      hasAiProvider: defaultHasAiProvider(),
      reconcileEveryMs,
    });
  } catch (error) {
    logger.error('Failed to start UGC moderation worker', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

async function shutdown(signal) {
  logger.info(`${signal} received, shutting down UGC moderation worker`);
  try {
    if (reconcileTimer) clearInterval(reconcileTimer);
    await queue.closeQueues();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

if (require.main === module) {
  startWorker();
}

module.exports = {
  startWorker,
  processJob,
  reconcileStuckPending,
  mapVerdictToSink,
  VALID_CONTENT_TYPES,
  REMOVE_ACTIONS,
};
