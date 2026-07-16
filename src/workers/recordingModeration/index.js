'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Live recording-moderation worker (FEAT-074, ADR 0005)
 * Run with: npm run worker:live-recording-moderation
 *   (the alias sets CORTEX_ASYNC_ROLE=worker — REQUIRED: the Ollama secondary is
 *    admitted only from a worker process, and only inside a job context.)
 *
 * Drains `live-recording-moderation`. For each finished recording it extracts
 * keyframes from the on-disk file (worker:live muxed it there), runs cortex's
 * per-frame vision passes, and writes the verdict into RecordingModeration.
 * Fail CLOSED: any inference/ffmpeg failure leaves the row `pending` (hidden) or
 * terminal `failed`, NEVER approved. Reuses the FEAT-073 pipeline core.
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();
const { Op } = require('sequelize');
const { createLogger } = require('@exprsn/shared');

const { sequelize, Recording, RecordingModeration } = require('../../../services/live/src/models');
const recordingModeration = require('../../../services/live/src/services/recordingModeration');
const {
  initQueues, closeQueues, queues, requeueRecordingModeration,
} = require('../../../services/live/src/queues/recordingModeration');
const { runInJobContext } = require('../../../services/cortex/src/backends/jobContext');
const pipeline = require('../videoModeration/pipeline');

const logger = createLogger('live-recording-moderation-worker');

let reconcileTimer = null;

// The bytes are not a decodable video — retrying cannot help.
const PERMANENT = new Set(['UNSUPPORTED_VIDEO']);

async function processRecording(recordingId) {
  const recording = await Recording.findByPk(recordingId);
  if (!recording) {
    logger.warn('recording vanished before moderation', { recordingId });
    return { skipped: true };
  }
  // Only finalized recordings have bytes to inspect.
  if (recording.status !== 'ready') {
    logger.warn('recording not ready; skipping moderation', { recordingId, status: recording.status });
    return { skipped: true, reason: 'not_ready' };
  }
  const localPath = recording.storage_url;
  if (!localPath) {
    logger.warn('recording has no storage_url; cannot moderate', { recordingId });
    return { skipped: true, reason: 'no_path' };
  }

  const [record] = await RecordingModeration.findOrCreate({
    where: { recording_id: recordingId },
    defaults: { recording_id: recordingId, status: 'pending' },
  });

  const mode = recordingModeration.moderationMode();
  if (mode === 'off') {
    await record.update({ status: 'skipped', reason: 'feature_disabled', attempts: record.attempts + 1 });
    return { status: 'skipped' };
  }
  // Idempotent: a prior attempt already wrote a verdict (rejected, or approved
  // with a reason other than the shadow placeholder).
  const scored = record.status === 'rejected'
    || (record.status === 'approved' && record.reason !== 'shadow_pending');
  if (scored) return { status: record.status, alreadyResolved: true };

  let patch;
  try {
    patch = await pipeline.evaluateLocalVideo(localPath, {
      mode,
      riskThreshold: recordingModeration.riskThreshold(),
    });
  } catch (err) {
    const permanent = PERMANENT.has(err.code);
    await record.update({
      // Fail CLOSED: hidden either way. Permanent decode failure is terminal; a
      // transient one is retried by Bull.
      status: permanent ? 'failed' : 'pending',
      reason: permanent ? 'unsupported_video' : 'error',
      attempts: record.attempts + 1,
      last_error: String(err.message).slice(0, 500), // never video bytes
    });
    if (permanent) {
      logger.warn('permanent recording moderation failure; not retrying', { recordingId, code: err.code });
      return { status: 'failed', reason: 'unsupported_video' };
    }
    throw err; // Bull retry
  }

  // Map the pipeline patch (camelCase) onto the RecordingModeration columns.
  await record.update({
    status: patch.status,
    reason: patch.reason,
    risk_score: patch.riskScore,
    verdict: patch.verdict,
    provider: patch.provider,
    backend: patch.backend,
    model: patch.model,
    alt_text: patch.altText,
    ai_tags: patch.aiTags || [],
    text_in_image: patch.textInImage,
    last_error: null,
    attempts: record.attempts + 1,
  });

  if (patch.status === 'rejected') {
    await escalate(recording, patch).catch((err) =>
      logger.error('failed to escalate flagged recording for review', { recordingId, error: err.message }));
  }

  logger.info('recording moderated', {
    recordingId,
    mode,
    status: patch.status,
    reason: patch.reason,
    riskScore: patch.riskScore,
    framesInspected: patch.verdict && patch.verdict.framesInspected,
    shadowFlagged: patch.reason === 'shadow_flagged',
    tags: (patch.aiTags || []).length,
  });
  return { status: patch.status, reason: patch.reason, riskScore: patch.riskScore };
}

/**
 * Route a flagged recording into moderator's pipeline via `precomputedResult`
 * (the real per-frame video scores), so moderator scores the VIDEO, not a text
 * analysis of its alt-text (the BUG-019 shape). `contentType:'video'` is a valid
 * content_type enum value.
 */
async function escalate(recording, patch) {
  // eslint-disable-next-line global-require
  const moderationService = require('../../../services/moderator/services/moderationService');
  const item = await moderationService.moderateContent({
    contentType: 'video',
    contentId: String(recording.id),
    sourceService: 'live',
    userId: recording.user_id,
    contentText: [patch.altText, patch.textInImage].filter(Boolean).join('\n') || 'recording',
    precomputedResult: patch.verdict,
    contentMetadata: {
      roomId: recording.room_id,
      streamId: recording.stream_id,
      escalatedBy: 'cortex-vision',
    },
  });
  const moderationItemId = item && (item.moderationId || item.id);
  if (moderationItemId) {
    await RecordingModeration.update(
      { moderation_item_id: moderationItemId },
      { where: { recording_id: recording.id } },
    );
  }
}

/**
 * Re-queue recordings stranded before scoring with no live job. Never throws
 * into the caller. Same self-heal as the FileVault video worker.
 */
async function reconcileStuckPending() {
  const graceMs = Number(process.env.LIVE_RECORDING_MODERATION_RECONCILE_GRACE_MS) || 5 * 60 * 1000;
  const cutoff = new Date(Date.now() - graceMs);
  let requeued = 0;
  try {
    const stuck = await RecordingModeration.findAll({
      where: {
        updatedAt: { [Op.lt]: cutoff },
        [Op.or]: [
          { status: 'pending' },
          { status: 'approved', reason: 'shadow_pending' },
        ],
      },
      attributes: ['recording_id'],
      limit: 500,
    });
    for (const row of stuck) {
      // eslint-disable-next-line no-await-in-loop
      const existing = await queues.recordingModeration.getJob(`recording:${row.recording_id}`);
      if (existing) {
        // eslint-disable-next-line no-await-in-loop
        const state = await existing.getState().catch(() => null);
        if (['waiting', 'active', 'delayed'].includes(state)) continue;
      }
      // eslint-disable-next-line no-await-in-loop
      if (await requeueRecordingModeration(row.recording_id)) requeued += 1;
    }
    if (requeued) logger.warn('reconciled stuck pending recordings', { requeued, of: stuck.length });
  } catch (err) {
    logger.error('stuck-pending recording reconciliation failed', { error: err.message });
  }
  return requeued;
}

async function startWorker() {
  try {
    logger.info('Starting Live recording-moderation worker');
    await sequelize.authenticate();
    initQueues();

    const concurrency = Math.max(1, Number(process.env.LIVE_RECORDING_MODERATION_CONCURRENCY) || 1);
    queues.recordingModeration.process('moderate-recording', concurrency, (job) => {
      const { recordingId } = job.data;
      logger.info('moderating recording', { recordingId, attempt: job.attemptsMade + 1 });
      // REQUIRED: wrap the job so a primary outage fails over to Ollama instead
      // of throwing CORTEX_SYNC_CALL_FORBIDDEN (FEAT-072 queue-only invariant).
      return runInJobContext({ queue: 'live-recording-moderation', jobId: job.id }, () => processRecording(recordingId));
    });

    const reconcileEveryMs = Number(process.env.LIVE_RECORDING_MODERATION_RECONCILE_INTERVAL_MS) || 5 * 60 * 1000;
    reconcileTimer = setInterval(reconcileStuckPending, reconcileEveryMs);
    reconcileTimer.unref();
    setTimeout(reconcileStuckPending, 15000).unref();

    logger.info('Live recording-moderation worker started', {
      concurrency,
      mode: recordingModeration.moderationMode(),
      riskThreshold: recordingModeration.riskThreshold(),
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
    await sequelize.close();
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
  startWorker, processRecording, escalate, reconcileStuckPending,
};
