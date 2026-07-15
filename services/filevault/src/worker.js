'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * FileVault image-moderation worker (FEAT-031)
 * Run with: npm run worker:filevault-moderation
 *
 * Drains `filevault-image-moderation`. Fetches the object's bytes, runs the
 * cortex vision passes, and writes the verdict + tags. Uploads never wait on
 * this; images stay hidden from other users until it produces a verdict.
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();
const { Op } = require('sequelize');
const { createLogger } = require('@exprsn/shared');
const models = require('./models');
const storage = require('./storage');
const imageModeration = require('./services/imageModerationService');
const {
  initQueues, closeQueues, queues, requeueImageModeration,
} = require('./queues/imageModeration');

const logger = createLogger('filevault-moderation-worker');

const { File, FileModeration } = models;

// Held across start/shutdown so the reconciliation interval is cleared cleanly.
let reconcileTimer = null;

// A permanent client error: the bytes are not a decodable image. Retrying will
// never change that, so fail the job immediately instead of burning 4 attempts
// and 90s of backoff.
const PERMANENT = new Set(['UNSUPPORTED_IMAGE']);

async function processFile(fileId) {
  const file = await File.findByPk(fileId);
  if (!file) {
    logger.warn('file vanished before moderation', { fileId });
    return { skipped: true };
  }

  const [record] = await FileModeration.findOrCreate({
    where: { fileId },
    defaults: { fileId, status: 'pending' },
  });

  // Re-check: the flag may have been turned off, or the row may already be
  // resolved by an earlier attempt (jobs are idempotent, so this is a no-op).
  const initial = imageModeration.initialState(file);
  if (initial.status === 'skipped') {
    await record.update({ ...initial, attempts: record.attempts + 1 });
    return { status: initial.status, reason: initial.reason };
  }
  // Already resolved by a prior attempt (jobs are idempotent)? A shadow row is
  // seeded `approved`/`shadow_pending` (servable but NOT yet scored) — it must
  // still run its vision pass, so short-circuit only once a verdict is written
  // (`rejected`, or `approved` with a reason other than `shadow_pending`).
  const scored = record.status === 'rejected'
    || (record.status === 'approved' && record.reason !== 'shadow_pending');
  if (scored) {
    return { status: record.status, alreadyResolved: true };
  }

  // Pin the exact bytes we are about to judge. Inference takes seconds, and a
  // concurrent updateFile()/restoreVersion() can swap the file's content in that
  // window — writing this verdict afterwards would approve the NEW bytes on the
  // strength of the OLD ones. The early-return guard above cannot catch it: it
  // runs before the evaluation, not after.
  const judgedHash = file.contentHash;
  const buffer = await storage.retrieve(file.storageKey, file.storageBackend);

  let patch;
  try {
    patch = await imageModeration.evaluate(buffer);
  } catch (err) {
    const permanent = PERMANENT.has(err.code);
    await record.update({
      // Fail CLOSED: the image stays hidden either way. A permanent decode
      // failure is terminal; a transient one will be retried by Bull.
      status: permanent ? 'failed' : 'pending',
      reason: permanent ? 'unsupported_image' : 'error',
      attempts: record.attempts + 1,
      lastError: String(err.message).slice(0, 500), // never image bytes
    });
    if (permanent) {
      logger.warn('permanent moderation failure; not retrying', { fileId, code: err.code });
      return { status: 'failed', reason: 'unsupported_image' };
    }
    throw err; // let Bull retry with backoff
  }

  // Compare-and-set on the content hash: if the bytes changed while we were
  // judging them, this verdict describes content that is no longer served.
  // Discard it and leave the row `pending` — the write path already queued a
  // fresh job for the new bytes, and `pending` keeps the file hidden meanwhile.
  const current = await File.findByPk(fileId, { attributes: ['id', 'contentHash'] });
  if (!current || current.contentHash !== judgedHash) {
    logger.warn('file bytes changed during moderation; discarding stale verdict', {
      fileId, judgedHash, currentHash: current && current.contentHash,
    });
    await record.update({ attempts: record.attempts + 1 });
    return { status: 'superseded' };
  }

  await record.update({ ...patch, attempts: record.attempts + 1 });

  if (patch.status === 'rejected') {
    // Escalate-only, and ENFORCE-only: only a `rejected` verdict is escalated.
    // Shadow never produces `rejected` (a flagged image stays `approved`/
    // `shadow_flagged`), so shadow scores and logs without holding or escalating.
    await escalate(file, patch).catch((err) =>
      logger.error('failed to escalate flagged image for review', { fileId, error: err.message }));
  }

  // Shadow-flagged images are recorded but not acted on — log them prominently so
  // TASK-023 (and operators) can see what enforce WOULD have held.
  const shadowFlagged = patch.reason === 'shadow_flagged';
  logger.info('image moderated', {
    fileId,
    mode: imageModeration.moderationMode(),
    status: patch.status,
    reason: patch.reason,
    riskScore: patch.riskScore,
    shadowFlagged,
    tags: (patch.aiTags || []).length,
  });
  return { status: patch.status, reason: patch.reason, riskScore: patch.riskScore };
}

/**
 * Route a flagged image into moderator's existing pipeline — its rules, review
 * queue, and audit trail — rather than re-implementing any of that here.
 *
 * The image verdict is passed as `precomputedResult`, so moderator scores the
 * IMAGE, not a text analysis of its alt-text. That distinction is the whole bug
 * in BUG-019: routing through the text analyzer meant the image's own
 * nsfw/violence scores never reached `requiresManualReview`, so a flagged image
 * was held from view but never actually reached a human.
 *
 * `contentType: 'image'` is a valid `moderation_items.content_type` enum value
 * (verified against the live DB); an invalid one throws inside moderator's dedup
 * query — the silent-failure shape of BUG-015 — so this is asserted, not assumed.
 */
async function escalate(file, patch) {
  // Required late: pulls in moderator's models. Keeping it out of module scope
  // means a filevault worker without moderator configured still boots.
  // eslint-disable-next-line global-require
  const moderationService = require('../../moderator/services/moderationService');
  const item = await moderationService.moderateContent({
    contentType: 'image',
    contentId: String(file.id),
    sourceService: 'filevault',
    userId: file.userId,
    contentText: [patch.altText, patch.textInImage].filter(Boolean).join('\n') || 'image',
    precomputedResult: patch.verdict, // the real image scores
    contentMetadata: {
      mimetype: file.mimetype,
      escalatedBy: 'cortex-vision',
    },
  });
  const moderationItemId = item && (item.moderationId || item.id);
  if (moderationItemId) {
    await FileModeration.update({ moderationItemId }, { where: { fileId: file.id } });
  }
}

/**
 * Reconcile images stranded before scoring with no queue job (TASK-025 / -026).
 *
 * The moderation job is enqueued best-effort AFTER the upload transaction
 * commits. If the process dies between commit and enqueue, or Redis is down at
 * that instant, the row is left with no job that will ever score it. Two cases:
 *   - enforce: the row is `pending` (hidden) permanently — fail-closed, but
 *     hidden forever.
 *   - shadow: the row is `approved`/`shadow_pending` (servable, so NO user
 *     impact) but never scored — so TASK-023 silently loses that data point.
 * This sweep finds both and re-queues them.
 *
 * Only rows older than a grace window are considered, so a row whose enqueue is
 * simply in flight is not double-queued (and `jobId: file:<id>` dedups anyway).
 * Never throws into the caller — a sweep failure must not take down the worker.
 */
async function reconcileStuckPending() {
  const graceMs = Number(process.env.FILEVAULT_MODERATION_RECONCILE_GRACE_MS) || 5 * 60 * 1000;
  const cutoff = new Date(Date.now() - graceMs);
  let requeued = 0;
  try {
    const stuck = await FileModeration.findAll({
      where: {
        updatedAt: { [Op.lt]: cutoff },
        [Op.or]: [
          { status: 'pending' }, // enforce: hidden, never scored
          { status: 'approved', reason: 'shadow_pending' }, // shadow: servable, never scored
        ],
      },
      // Scope to IMAGE rows only (FEAT-073): videos are stranded/reconciled by the
      // separate video worker onto their own queue. Without this filter, this sweep
      // would re-enqueue a stuck video onto the IMAGE queue, which would then
      // whole-buffer the video (OOM) and mis-judge it against the image model.
      include: [{
        model: File,
        as: 'file',
        attributes: ['id'],
        required: true,
        where: { mimetype: { [Op.iLike]: 'image/%' } },
      }],
      attributes: ['fileId'],
      limit: 500,
    });
    for (const row of stuck) {
      // Skip rows that already have a live (waiting/active/delayed) job.
      const existing = await queues.imageModeration.getJob(`file:${row.fileId}`);
      if (existing) {
        const state = await existing.getState().catch(() => null);
        if (['waiting', 'active', 'delayed'].includes(state)) continue;
      }
      // Use requeue (remove-then-add): a lingering TERMINAL job key (completed/
      // failed) would make a plain add() a silent no-op (BUG-016), so a row stuck
      // pending under a stale terminal key could never be re-enqueued.
      if (await requeueImageModeration(row.fileId)) requeued += 1;
    }
    if (requeued) logger.warn('reconciled stuck pending images', { requeued, of: stuck.length });
  } catch (err) {
    logger.error('stuck-pending reconciliation failed', { error: err.message });
  }
  return requeued;
}

async function startWorker() {
  try {
    logger.info('Starting FileVault image-moderation worker');
    await models.sequelize.authenticate();
    initQueues();

    const concurrency = Math.max(1, Number(process.env.FILEVAULT_MODERATION_CONCURRENCY) || 1);
    queues.imageModeration.process('moderate-image', concurrency, async (job) => {
      const { fileId } = job.data;
      logger.info('moderating image', { fileId, attempt: job.attemptsMade + 1 });
      return processFile(fileId);
    });

    // Periodic self-heal for rows orphaned in `pending` (TASK-025). Runs on an
    // interval, unref'd so it never keeps the process alive on its own, and once
    // shortly after boot to catch anything stranded by the last crash.
    const reconcileEveryMs = Number(process.env.FILEVAULT_MODERATION_RECONCILE_INTERVAL_MS) || 5 * 60 * 1000;
    reconcileTimer = setInterval(reconcileStuckPending, reconcileEveryMs);
    reconcileTimer.unref();
    setTimeout(reconcileStuckPending, 15000).unref();

    logger.info('FileVault image-moderation worker started', {
      concurrency,
      mode: imageModeration.moderationMode(), // off | shadow | enforce (TASK-026)
      featureEnabled: imageModeration.featureEnabled(),
      riskThreshold: imageModeration.imageRiskThreshold(),
      reconcileEveryMs,
    });
  } catch (error) {
    logger.error('Failed to start worker', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

async function shutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully`);
  try {
    if (reconcileTimer) clearInterval(reconcileTimer);
    await closeQueues();
    await models.sequelize.close();
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

module.exports = { startWorker, processFile, escalate, reconcileStuckPending };
