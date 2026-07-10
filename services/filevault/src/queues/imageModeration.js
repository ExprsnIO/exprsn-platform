'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Image-moderation queue (FEAT-031, ADR 0002 §6)
 *
 * Uploads NEVER await inference: a vision call costs seconds (and can stall
 * behind a model swap), so the upload path only enqueues. A separate worker
 * process drains this queue (`npm run worker:filevault-moderation`).
 *
 * Retries: unlike cortex's `cortex-tasks` (attempts: 1, because an agent task is
 * not idempotent), image moderation IS idempotent — the same bytes always yield
 * the same verdict — so retrying is safe and lets a job survive a router restart
 * or a 400s model swap. A permanent client error (UNSUPPORTED_IMAGE) is failed
 * immediately by the worker rather than retried.
 * ═══════════════════════════════════════════════════════════
 */

const Queue = require('bull');
const { createLogger } = require('@exprsn/shared');
const config = require('../config');

const logger = createLogger('exprsn-filevault-modqueue');

const QUEUE_NAME = 'filevault-image-moderation';

const queues = { imageModeration: null };

function initQueues() {
  if (queues.imageModeration) return queues;
  const redis = config.redis || {};
  queues.imageModeration = new Queue(QUEUE_NAME, {
    redis: {
      host: redis.host || process.env.REDIS_HOST || 'localhost',
      port: redis.port || process.env.REDIS_PORT || 6379,
      password: redis.password || process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    },
    defaultJobOptions: {
      attempts: Number(process.env.FILEVAULT_MODERATION_ATTEMPTS) || 4,
      backoff: { type: 'exponential', delay: 30000 },
      removeOnComplete: { age: 3600, count: 1000 },
      // Keep failures for a day so the DLQ/triage surface has something to show.
      removeOnFail: { age: 86400 },
    },
  });
  queues.imageModeration.on('error', (error) => {
    logger.error('image-moderation queue error', { error: error.message });
  });
  queues.imageModeration.on('failed', (job, error) => {
    logger.error('image-moderation job failed', {
      jobId: job && job.id,
      fileId: job && job.data && job.data.fileId,
      attemptsMade: job && job.attemptsMade,
      error: error.message, // never contains image bytes
    });
  });
  return queues;
}

/**
 * Enqueue a file for moderation. Best-effort by contract: a Redis outage must
 * not fail the upload. The file stays `pending` (and therefore hidden) until a
 * worker picks it up, which is the fail-closed-visibility posture.
 */
async function enqueueImageModeration(fileId) {
  try {
    initQueues();
    await queues.imageModeration.add('moderate-image', { fileId }, { jobId: `file:${fileId}` });
    return true;
  } catch (err) {
    logger.error('could not enqueue image moderation; file stays pending', {
      fileId, error: err.message,
    });
    return false;
  }
}

async function closeQueues() {
  if (queues.imageModeration) {
    await queues.imageModeration.close();
    queues.imageModeration = null;
  }
}

async function queueStats() {
  if (!queues.imageModeration) return { initialized: false };
  try {
    const [waiting, active, failed] = await Promise.all([
      queues.imageModeration.getWaitingCount(),
      queues.imageModeration.getActiveCount(),
      queues.imageModeration.getFailedCount(),
    ]);
    return { initialized: true, waiting, active, failed };
  } catch (e) {
    return { initialized: true, error: e.message };
  }
}

module.exports = { QUEUE_NAME, initQueues, closeQueues, queueStats, enqueueImageModeration, queues };
