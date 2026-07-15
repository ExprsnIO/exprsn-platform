'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Video-moderation queue (FEAT-073)
 *
 * A SEPARATE Bull queue from image moderation (`filevault-image-moderation`).
 * A single video moderation job can run for minutes — retrieve a mult-GB
 * recording, ffprobe it, extract a dozen keyframes, run a vision pass per
 * frame. If those jobs shared the image queue they would head-of-line-block the
 * seconds-long image jobs behind them. Keeping the two queues distinct lets a
 * separate worker/concurrency budget drain each without cross-starvation.
 *
 * Same fail-closed-visibility posture as images: a Redis outage on enqueue
 * leaves the row `pending` (hidden), and the worker's reconcile sweep re-queues
 * it later. Retries are safe because moderation is idempotent — the same bytes
 * always yield the same verdict.
 * ═══════════════════════════════════════════════════════════
 */

const Queue = require('bull');
const { createLogger } = require('@exprsn/shared');
const config = require('../config');

const logger = createLogger('exprsn-filevault-videomodqueue');

const QUEUE_NAME = 'filevault-video-moderation';

const queues = { videoModeration: null };

function initQueues() {
  if (queues.videoModeration) return queues;
  const redis = config.redis || {};
  queues.videoModeration = new Queue(QUEUE_NAME, {
    redis: {
      host: redis.host || process.env.REDIS_HOST || 'localhost',
      port: redis.port || process.env.REDIS_PORT || 6379,
      password: redis.password || process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    },
    defaultJobOptions: {
      attempts: Number(process.env.MODERATE_VIDEO_ATTEMPTS) || 4,
      // A video pass is minutes long; back off far more slowly than images so a
      // transient model/ffmpeg outage isn't hammered every 30s.
      backoff: { type: 'exponential', delay: 60000 },
      removeOnComplete: { age: 3600, count: 1000 },
      // Keep failures for a day so the DLQ/triage surface has something to show.
      removeOnFail: { age: 86400 },
    },
  });
  queues.videoModeration.on('error', (error) => {
    logger.error('video-moderation queue error', { error: error.message });
  });
  queues.videoModeration.on('failed', (job, error) => {
    logger.error('video-moderation job failed', {
      jobId: job && job.id,
      fileId: job && job.data && job.data.fileId,
      attemptsMade: job && job.attemptsMade,
      error: error.message, // never contains video bytes
    });
  });
  return queues;
}

/**
 * Enqueue a file for video moderation. Best-effort by contract: a Redis outage
 * must not fail the upload. The file stays `pending` (hidden) until a worker
 * picks it up — the fail-closed-visibility posture.
 */
async function enqueueVideoModeration(fileId) {
  try {
    initQueues();
    await queues.videoModeration.add('moderate-video', { fileId }, { jobId: `file:${fileId}` });
    return true;
  } catch (err) {
    logger.error('could not enqueue video moderation; file stays pending', {
      fileId, error: err.message,
    });
    return false;
  }
}

/**
 * Enqueue a RE-moderation (new version / restore of an existing file).
 *
 * `add()` with an existing jobId is a silent no-op in Bull while that job's key
 * still exists in Redis — completed jobs linger for an hour, failed ones a day
 * (BUG-016). Remove the stale job first so a re-moderation of recently judged
 * bytes actually runs.
 */
async function requeueVideoModeration(fileId) {
  try {
    initQueues();
    const jobId = `file:${fileId}`;
    const existing = await queues.videoModeration.getJob(jobId);
    if (existing) await existing.remove().catch(() => {});
    await queues.videoModeration.add('moderate-video', { fileId }, { jobId });
    return true;
  } catch (err) {
    logger.error('could not re-enqueue video moderation; file stays pending', {
      fileId, error: err.message,
    });
    return false;
  }
}

async function closeQueues() {
  if (queues.videoModeration) {
    await queues.videoModeration.close();
    queues.videoModeration = null;
  }
}

async function queueStats() {
  if (!queues.videoModeration) return { initialized: false };
  try {
    const [waiting, active, failed] = await Promise.all([
      queues.videoModeration.getWaitingCount(),
      queues.videoModeration.getActiveCount(),
      queues.videoModeration.getFailedCount(),
    ]);
    return { initialized: true, waiting, active, failed };
  } catch (e) {
    return { initialized: true, error: e.message };
  }
}

module.exports = {
  QUEUE_NAME, initQueues, closeQueues, queueStats,
  enqueueVideoModeration, requeueVideoModeration, queues,
};
