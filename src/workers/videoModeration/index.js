'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * FileVault VIDEO-moderation worker (FEAT-073)
 * Run with: npm run worker:video-moderation
 *   (the alias sets CORTEX_ASYNC_ROLE=worker — REQUIRED: the Ollama secondary is
 *    admitted only from a worker process, and only inside a job context.)
 *
 * Drains `filevault-video-moderation` (a SEPARATE queue from image moderation so
 * a 12-minute video never head-of-line-blocks seconds-long image jobs). For each
 * job it streams the video to a temp dir, extracts keyframes, runs cortex's
 * per-frame vision passes, and writes the verdict + tags. Uploads never wait on
 * this; a video stays hidden from other users until a verdict clears it.
 *
 * Fail closed everywhere: any inference/ffmpeg/storage failure leaves the row
 * `pending` (hidden) or terminal `failed`, NEVER approved.
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();
const { Op } = require('sequelize');
const { createLogger } = require('@exprsn/shared');

const models = require('../../../services/filevault/src/models');
const imageModeration = require('../../../services/filevault/src/services/imageModerationService');
const {
  initQueues, closeQueues, queues, requeueVideoModeration,
} = require('../../../services/filevault/src/queues/videoModeration');
const { runInJobContext } = require('../../../services/cortex/src/backends/jobContext');
const pipeline = require('./pipeline');

const logger = createLogger('filevault-video-moderation-worker');

const { File, FileModeration } = models;

// Cleared on shutdown so the reconcile interval doesn't keep the process alive.
let reconcileTimer = null;

// Permanent client error: the bytes are not a decodable video. Retrying will
// never change that — fail the job immediately instead of burning attempts.
// Everything else (LLM_UNAVAILABLE / VISION_UNAVAILABLE / CORTEX_DISABLED /
// FFMPEG_UNAVAILABLE / FFMPEG_NO_FRAMES) is transient and Bull-retried.
const PERMANENT = new Set(['UNSUPPORTED_VIDEO']);

async function processVideo(fileId) {
  const file = await File.findByPk(fileId);
  if (!file) {
    logger.warn('file vanished before video moderation', { fileId });
    return { skipped: true };
  }

  const [record] = await FileModeration.findOrCreate({
    where: { fileId },
    defaults: { fileId, status: 'pending' },
  });

  // Re-check: the flag may have flipped, or an earlier attempt already resolved
  // this (jobs are idempotent). initialState is media-aware (FEAT-073).
  const initial = imageModeration.initialState(file);
  if (initial.status === 'skipped') {
    await record.update({ ...initial, attempts: record.attempts + 1 });
    return { status: initial.status, reason: initial.reason };
  }
  // A shadow row is seeded `approved`/`shadow_pending` (servable but NOT scored)
  // — it must still run its pass. Short-circuit only once a verdict is written.
  const scored = record.status === 'rejected'
    || (record.status === 'approved' && record.reason !== 'shadow_pending');
  if (scored) {
    return { status: record.status, alreadyResolved: true };
  }

  // Pin the exact bytes we judge. Inference takes minutes; a concurrent
  // updateFile()/restoreVersion() can swap the content in that window — writing
  // this verdict afterwards would approve the NEW bytes on the OLD verdict.
  const judgedHash = file.contentHash;

  let patch;
  try {
    patch = await pipeline.evaluateVideo(file);
  } catch (err) {
    const permanent = PERMANENT.has(err.code);
    await record.update({
      // Fail CLOSED: the video stays hidden either way. A permanent decode
      // failure is terminal; a transient one is retried by Bull.
      status: permanent ? 'failed' : 'pending',
      reason: permanent ? 'unsupported_video' : 'error',
      attempts: record.attempts + 1,
      lastError: String(err.message).slice(0, 500), // never video bytes
    });
    if (permanent) {
      logger.warn('permanent video moderation failure; not retrying', { fileId, code: err.code });
      return { status: 'failed', reason: 'unsupported_video' };
    }
    throw err; // let Bull retry with backoff
  }

  // Compare-and-set on the content hash: if the bytes changed while we judged
  // them, this verdict describes content no longer served. Discard it and leave
  // the row `pending` (hidden) — the write path already queued a fresh job.
  const current = await File.findByPk(fileId, { attributes: ['id', 'contentHash'] });
  if (!current || current.contentHash !== judgedHash) {
    logger.warn('video bytes changed during moderation; discarding stale verdict', {
      fileId, judgedHash, currentHash: current && current.contentHash,
    });
    await record.update({ attempts: record.attempts + 1 });
    return { status: 'superseded' };
  }

  await record.update({ ...patch, attempts: record.attempts + 1 });

  if (patch.status === 'rejected') {
    // Escalate-only, ENFORCE-only: shadow never produces `rejected`.
    await escalate(file, patch).catch((err) =>
      logger.error('failed to escalate flagged video for review', { fileId, error: err.message }));
  }

  const shadowFlagged = patch.reason === 'shadow_flagged';
  logger.info('video moderated', {
    fileId,
    mode: imageModeration.videoModerationMode(),
    status: patch.status,
    reason: patch.reason,
    riskScore: patch.riskScore,
    framesInspected: patch.verdict && patch.verdict.framesInspected,
    shadowFlagged,
    tags: (patch.aiTags || []).length,
  });
  return { status: patch.status, reason: patch.reason, riskScore: patch.riskScore };
}

/**
 * Route a flagged video into moderator's pipeline — its rules, review queue, and
 * audit trail — rather than re-implementing any of it here. The video verdict is
 * passed as `precomputedResult` so moderator scores the VIDEO's own frame scores,
 * not a text analysis of its alt-text (the BUG-019 shape). `contentType: 'video'`
 * is a valid `content_type` enum value (verified against schema.sql).
 */
async function escalate(file, patch) {
  // eslint-disable-next-line global-require
  const moderationService = require('../../../services/moderator/services/moderationService');
  const item = await moderationService.moderateContent({
    contentType: 'video',
    contentId: String(file.id),
    sourceService: 'filevault',
    userId: file.userId,
    contentText: [patch.altText, patch.textInImage].filter(Boolean).join('\n') || 'video',
    precomputedResult: patch.verdict, // the real per-frame video scores
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
 * Reconcile VIDEO rows stranded before scoring with no live queue job — the same
 * self-heal the image worker runs, scoped (via a JOIN on the file mimetype) to
 * video so the two workers never re-queue each other's rows onto the wrong queue.
 * Never throws into the caller.
 */
async function reconcileStuckPending() {
  const graceMs = Number(process.env.FILEVAULT_VIDEO_MODERATION_RECONCILE_GRACE_MS)
    || Number(process.env.FILEVAULT_MODERATION_RECONCILE_GRACE_MS)
    || 5 * 60 * 1000;
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
      include: [{
        model: File,
        as: 'file',
        attributes: ['id'],
        required: true,
        where: { mimetype: { [Op.iLike]: 'video/%' } },
      }],
      attributes: ['fileId'],
      limit: 500,
    });
    for (const row of stuck) {
      // eslint-disable-next-line no-await-in-loop
      const existing = await queues.videoModeration.getJob(`file:${row.fileId}`);
      if (existing) {
        // eslint-disable-next-line no-await-in-loop
        const state = await existing.getState().catch(() => null);
        if (['waiting', 'active', 'delayed'].includes(state)) continue;
      }
      // remove-then-add: a lingering TERMINAL job key would make a plain add() a
      // silent no-op (BUG-016).
      // eslint-disable-next-line no-await-in-loop
      if (await requeueVideoModeration(row.fileId)) requeued += 1;
    }
    if (requeued) logger.warn('reconciled stuck pending videos', { requeued, of: stuck.length });
  } catch (err) {
    logger.error('stuck-pending video reconciliation failed', { error: err.message });
  }
  return requeued;
}

async function startWorker() {
  try {
    logger.info('Starting FileVault video-moderation worker');
    await models.sequelize.authenticate();
    initQueues();

    const concurrency = Math.max(1, Number(process.env.FILEVAULT_VIDEO_MODERATION_CONCURRENCY) || 1);
    queues.videoModeration.process('moderate-video', concurrency, (job) => {
      const { fileId } = job.data;
      logger.info('moderating video', { fileId, attempt: job.attemptsMade + 1 });
      // REQUIRED: wrap the job body so a primary outage fails over to the Ollama
      // secondary instead of throwing CORTEX_SYNC_CALL_FORBIDDEN (FEAT-072, dep).
      return runInJobContext({ queue: 'video-moderation', jobId: job.id }, () => processVideo(fileId));
    });

    const reconcileEveryMs = Number(process.env.FILEVAULT_VIDEO_MODERATION_RECONCILE_INTERVAL_MS)
      || 5 * 60 * 1000;
    reconcileTimer = setInterval(reconcileStuckPending, reconcileEveryMs);
    reconcileTimer.unref();
    setTimeout(reconcileStuckPending, 15000).unref();

    logger.info('FileVault video-moderation worker started', {
      concurrency,
      mode: imageModeration.videoModerationMode(), // off | shadow | enforce
      riskThreshold: imageModeration.videoRiskThreshold(),
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

module.exports = {
  startWorker, processVideo, escalate, reconcileStuckPending,
};
