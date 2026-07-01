/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Prefetch - Bull Queue Implementation
 * Reliable background job processing for prefetch operations
 * ═══════════════════════════════════════════════════════════════════════
 */

const Queue = require('bull');
const rabbit = require('@exprsn/shared/utils/rabbit');
const config = require('../config');
const { prefetchTimeline } = require('../services/prefetchService');
const logger = require('../utils/logger');

rabbit.setLogger(logger);

// Lazily assert the RabbitMQ topology (exchange + work queue + DLQ) once per
// process. Returns true if the rabbit path is usable, false to fall back to Bull.
let rabbitTopologyReady = false;
async function ensureRabbitTopology() {
  if (rabbitTopologyReady) {
    return true;
  }
  if (config.queue.backend !== 'rabbitmq' || !rabbit.isEnabled()) {
    return false;
  }
  await rabbit.assertTopology({
    exchange: config.rabbit.exchange,
    routingKey: config.rabbit.routingKey,
    queue: config.rabbit.queue,
    durable: true,
    deadLetter: true
  });
  rabbitTopologyReady = true;
  return true;
}

// Create prefetch queue
const prefetchQueue = new Queue('prefetch', {
  redis: {
    host: config.redis.host,
    port: config.redis.port
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 100,  // Keep last 100 completed jobs
    removeOnFail: 50  // Keep last 50 failed jobs
  }
});

// Process prefetch jobs.
//
// platform: registering a Bull processor turns this process into a CONSUMER.
// Inside the in-process gateway we only ENQUEUE (producer); the heavy
// timeline-pull work runs in the separate worker process. So the processor is
// registered lazily and only by the worker — either explicitly via
// registerProcessor() or automatically when PREFETCH_ROLE=worker.
let processorRegistered = false;

function registerProcessor() {
  if (processorRegistered) {
    return;
  }
  processorRegistered = true;

  prefetchQueue.process('timeline', config.worker.concurrency, async (job) => {
    const { userId, priority } = job.data;

    logger.info(`Processing prefetch job for user ${userId}`, {
      jobId: job.id,
      priority,
      attempt: job.attemptsMade + 1
    });

    // Update job progress
    await job.progress(10);

    const result = await prefetchTimeline(userId, priority);

    await job.progress(100);

    if (!result.success) {
      throw new Error(result.error);
    }

    return result;
  });

  logger.info('Prefetch queue processor registered', {
    concurrency: config.worker.concurrency
  });
}

// RabbitMQ consumer registration (used by the worker when the backend is
// 'rabbitmq'). Asserts topology then consumes the work queue, running the same
// prefetchTimeline work the Bull processor does. Bounded retries (maxAttempts)
// dead-letter to `<queue>.dlq`. Returns the consumerTag, or null if the rabbit
// backend isn't active/available (caller should fall back to the Bull processor).
let rabbitConsumerTag = null;
async function registerRabbitConsumer() {
  if (rabbitConsumerTag) {
    return rabbitConsumerTag;
  }
  if (config.queue.backend !== 'rabbitmq' || !rabbit.isEnabled()) {
    return null;
  }

  await ensureRabbitTopology();

  rabbitConsumerTag = await rabbit.consume(
    config.rabbit.queue,
    async ({ userId, priority }) => {
      logger.info(`Processing prefetch job (rabbitmq) for user ${userId}`, { priority });
      const result = await prefetchTimeline(userId, priority);
      if (!result.success) {
        throw new Error(result.error);
      }
    },
    { prefetch: config.rabbit.prefetch, maxAttempts: 3 }
  );

  logger.info('Prefetch RabbitMQ consumer registered', {
    queue: config.rabbit.queue,
    prefetch: config.rabbit.prefetch
  });

  return rabbitConsumerTag;
}

// Auto-register in dedicated worker processes only.
if (process.env.PREFETCH_ROLE === 'worker' && config.queue.backend !== 'rabbitmq') {
  registerProcessor();
}

// Job event handlers
prefetchQueue.on('completed', (job, result) => {
  logger.info(`Prefetch job completed`, {
    jobId: job.id,
    userId: job.data.userId,
    duration: result.duration,
    tier: result.tier
  });
});

prefetchQueue.on('failed', (job, err) => {
  logger.error(`Prefetch job failed`, {
    jobId: job.id,
    userId: job.data.userId,
    error: err.message,
    attempts: job.attemptsMade
  });
});

prefetchQueue.on('stalled', (job) => {
  logger.warn(`Prefetch job stalled`, {
    jobId: job.id,
    userId: job.data.userId
  });
});

prefetchQueue.on('error', (error) => {
  logger.error('Prefetch queue error:', { error: error.message });
});

/**
 * Backend-aware enqueue.
 *
 * When PREFETCH_QUEUE_BACKEND=rabbitmq and the broker is reachable, the job is
 * published to the RabbitMQ exchange. On ANY rabbit error (or when the broker
 * is disabled/unavailable) it transparently falls back to the Bull/Redis queue.
 * When the backend is 'redis' (default) it goes straight to Bull.
 *
 * Returns the Bull job for the redis path, or a lightweight descriptor
 * `{ backend: 'rabbitmq', userId, priority }` for the rabbit path.
 */
async function enqueuePrefetch(userId, priority = 'medium', options = {}) {
  if (config.queue.backend === 'rabbitmq') {
    try {
      if (await ensureRabbitTopology()) {
        await rabbit.publish(config.rabbit.exchange, config.rabbit.routingKey, { userId, priority });
        logger.info('Prefetch job published to RabbitMQ', {
          userId,
          priority,
          exchange: config.rabbit.exchange,
          routingKey: config.rabbit.routingKey
        });
        return { backend: 'rabbitmq', userId, priority };
      }
      logger.warn('RabbitMQ backend selected but broker unavailable; falling back to Redis/Bull', { userId });
    } catch (error) {
      logger.warn('RabbitMQ enqueue failed; falling back to Redis/Bull', {
        userId,
        error: error.message
      });
    }
  }
  return queuePrefetchBull(userId, priority, options);
}

// `queuePrefetch` is kept as the public name existing callers (REST /schedule)
// already use; it is now an alias for the backend-aware enqueue.
const queuePrefetch = enqueuePrefetch;

/**
 * Add prefetch job to the Bull/Redis queue (the redis backend path).
 */
async function queuePrefetchBull(userId, priority = 'medium', options = {}) {
  try {
    const job = await prefetchQueue.add('timeline',
      { userId, priority },
      {
        delay: options.delay || 0,
        priority: priority === 'high' ? 1 : priority === 'medium' ? 2 : 3,
        jobId: options.jobId || `prefetch:${userId}:${Date.now()}`,
        ...options
      }
    );

    logger.info(`Prefetch job queued`, {
      jobId: job.id,
      userId,
      priority
    });

    return job;
  } catch (error) {
    logger.error(`Failed to queue prefetch job`, {
      userId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Queue multiple prefetch jobs in batch
 */
async function queueBatchPrefetch(userIds, priority = 'medium') {
  // RabbitMQ backend: publish one message per user; fall back to Bull on error.
  if (config.queue.backend === 'rabbitmq') {
    try {
      if (await ensureRabbitTopology()) {
        for (const userId of userIds) {
          await rabbit.publish(config.rabbit.exchange, config.rabbit.routingKey, { userId, priority });
        }
        logger.info('Batch prefetch published to RabbitMQ', {
          count: userIds.length,
          priority,
          exchange: config.rabbit.exchange
        });
        return userIds.map(userId => ({ backend: 'rabbitmq', userId, priority }));
      }
      logger.warn('RabbitMQ backend selected but broker unavailable; batch falling back to Redis/Bull', {
        count: userIds.length
      });
    } catch (error) {
      logger.warn('RabbitMQ batch enqueue failed; falling back to Redis/Bull', {
        count: userIds.length,
        error: error.message
      });
    }
  }

  try {
    const jobs = userIds.map(userId => ({
      name: 'timeline',
      data: { userId, priority },
      opts: {
        priority: priority === 'high' ? 1 : priority === 'medium' ? 2 : 3,
        jobId: `prefetch:${userId}:${Date.now()}`
      }
    }));

    const addedJobs = await prefetchQueue.addBulk(jobs);

    logger.info(`Batch prefetch queued`, {
      count: userIds.length,
      priority
    });

    return addedJobs;
  } catch (error) {
    logger.error(`Failed to queue batch prefetch`, {
      count: userIds.length,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get queue statistics
 */
async function getQueueStats() {
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      prefetchQueue.getWaitingCount(),
      prefetchQueue.getActiveCount(),
      prefetchQueue.getCompletedCount(),
      prefetchQueue.getFailedCount(),
      prefetchQueue.getDelayedCount()
    ]);

    const stats = {
      name: 'prefetch',
      backend: config.queue.backend,
      waiting,
      active,
      completed,
      failed,
      delayed
    };

    // When the RabbitMQ backend is active, also surface broker queue depths.
    if (config.queue.backend === 'rabbitmq' && rabbit.isEnabled()) {
      try {
        const [depth, dlq] = await Promise.all([
          rabbit.queueDepth(config.rabbit.queue),
          rabbit.queueDepth(`${config.rabbit.queue}.dlq`)
        ]);
        stats.rabbit = { queue: config.rabbit.queue, depth, dlq };
      } catch (error) {
        stats.rabbit = { queue: config.rabbit.queue, error: error.message };
      }
    }

    return stats;
  } catch (error) {
    logger.error('Error getting queue stats:', { error: error.message });
    throw error;
  }
}

/**
 * Get failed jobs for inspection
 */
async function getFailedJobs(limit = 10) {
  try {
    const jobs = await prefetchQueue.getFailed(0, limit - 1);
    return jobs.map(job => ({
      id: job.id,
      userId: job.data.userId,
      priority: job.data.priority,
      failedReason: job.failedReason,
      attempts: job.attemptsMade,
      timestamp: job.timestamp
    }));
  } catch (error) {
    logger.error('Error getting failed jobs:', { error: error.message });
    throw error;
  }
}

/**
 * Retry failed job
 */
async function retryFailedJob(jobId) {
  try {
    const job = await prefetchQueue.getJob(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    await job.retry();
    logger.info(`Retrying failed job`, { jobId });
    return { success: true, jobId };
  } catch (error) {
    logger.error('Error retrying job:', { jobId, error: error.message });
    throw error;
  }
}

/**
 * Clean old jobs from queue
 */
async function cleanQueue(grace = 3600000) {
  try {
    await prefetchQueue.clean(grace, 'completed');
    await prefetchQueue.clean(grace, 'failed');
    logger.info('Queue cleaned', { gracePeriod: grace });
  } catch (error) {
    logger.error('Error cleaning queue:', { error: error.message });
    throw error;
  }
}

/**
 * Pause queue processing
 */
async function pauseQueue() {
  await prefetchQueue.pause();
  logger.info('Prefetch queue paused');
}

/**
 * Resume queue processing
 */
async function resumeQueue() {
  await prefetchQueue.resume();
  logger.info('Prefetch queue resumed');
}

/**
 * Close queue gracefully
 */
async function closePrefetchQueue() {
  try {
    await prefetchQueue.close();
    if (config.queue.backend === 'rabbitmq' && rabbit.isEnabled()) {
      await rabbit.close();
    }
    logger.info('Prefetch queue closed');
  } catch (error) {
    logger.error('Error closing queue:', { error: error.message });
    throw error;
  }
}

module.exports = {
  prefetchQueue,
  registerProcessor,
  registerRabbitConsumer,
  enqueuePrefetch,
  queuePrefetch,
  queueBatchPrefetch,
  getQueueStats,
  getFailedJobs,
  retryFailedJob,
  cleanQueue,
  pauseQueue,
  resumeQueue,
  closePrefetchQueue
};
