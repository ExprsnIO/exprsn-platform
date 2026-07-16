'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Live recording-moderation queue (FEAT-074, ADR 0005)
 *
 * A dedicated Bull queue for moderating finished Live recordings — the analogue
 * of filevault's `filevault-video-moderation`, kept separate for the same
 * reason: a recording moderation pass is minutes long (ffmpeg keyframe
 * extraction + a vision pass per frame) and must not head-of-line-block anything
 * else. Drained by worker:live-recording-moderation.
 *
 * Fail-closed-visibility: a Redis outage on enqueue leaves the RecordingModeration
 * row `pending` (hidden from non-owners); the worker's reconcile sweep re-queues
 * it. Moderation is idempotent, so retries are safe.
 * ═══════════════════════════════════════════════════════════
 */

const Queue = require('bull');
const { createLogger } = require('@exprsn/shared');
const config = require('../config');

const logger = createLogger('exprsn-live-recmodqueue');

const QUEUE_NAME = 'live-recording-moderation';

const queues = { recordingModeration: null };

function redisOpts() {
  const redis = (config && config.redis) || {};
  return {
    host: redis.host || process.env.REDIS_HOST || 'localhost',
    port: redis.port || process.env.REDIS_PORT || 6379,
    password: redis.password || process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

function initQueues() {
  if (queues.recordingModeration) return queues;
  queues.recordingModeration = new Queue(QUEUE_NAME, {
    redis: redisOpts(),
    defaultJobOptions: {
      attempts: Number(process.env.MODERATE_RECORDING_ATTEMPTS) || 4,
      backoff: { type: 'exponential', delay: 60000 },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 86400 },
    },
  });
  queues.recordingModeration.on('error', (error) => {
    logger.error('recording-moderation queue error', { error: error.message });
  });
  queues.recordingModeration.on('failed', (job, error) => {
    logger.error('recording-moderation job failed', {
      jobId: job && job.id,
      recordingId: job && job.data && job.data.recordingId,
      attemptsMade: job && job.attemptsMade,
      error: error.message, // never contains video bytes
    });
  });
  return queues;
}

/** Enqueue a recording for moderation. Best-effort: a Redis outage leaves the
 *  row pending (hidden) until the reconcile sweep re-queues it. */
async function enqueueRecordingModeration(recordingId) {
  try {
    initQueues();
    await queues.recordingModeration.add(
      'moderate-recording', { recordingId }, { jobId: `recording:${recordingId}` },
    );
    return true;
  } catch (err) {
    logger.error('could not enqueue recording moderation; recording stays pending', {
      recordingId, error: err.message,
    });
    return false;
  }
}

/** Remove-then-add re-enqueue (a lingering terminal jobId key makes add() a
 *  silent no-op — BUG-016). */
async function requeueRecordingModeration(recordingId) {
  try {
    initQueues();
    const jobId = `recording:${recordingId}`;
    const existing = await queues.recordingModeration.getJob(jobId);
    if (existing) await existing.remove().catch(() => {});
    await queues.recordingModeration.add('moderate-recording', { recordingId }, { jobId });
    return true;
  } catch (err) {
    logger.error('could not re-enqueue recording moderation; recording stays pending', {
      recordingId, error: err.message,
    });
    return false;
  }
}

async function closeQueues() {
  if (queues.recordingModeration) {
    await queues.recordingModeration.close();
    queues.recordingModeration = null;
  }
}

async function queueStats() {
  if (!queues.recordingModeration) return { initialized: false };
  try {
    const [waiting, active, failed] = await Promise.all([
      queues.recordingModeration.getWaitingCount(),
      queues.recordingModeration.getActiveCount(),
      queues.recordingModeration.getFailedCount(),
    ]);
    return { initialized: true, waiting, active, failed };
  } catch (e) {
    return { initialized: true, error: e.message };
  }
}

module.exports = {
  QUEUE_NAME, initQueues, closeQueues, queueStats,
  enqueueRecordingModeration, requeueRecordingModeration, queues,
};
