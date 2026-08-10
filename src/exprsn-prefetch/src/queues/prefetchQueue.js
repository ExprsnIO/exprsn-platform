/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Prefetch - Bull Queue Implementation
 * Reliable background job processing for prefetch operations
 * ═══════════════════════════════════════════════════════════════════════
 */

const Queue = require('bull');
const config = require('../config');
const { prefetchTimeline } = require('../services/prefetchService');
const logger = require('../utils/logger');

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

// Process prefetch jobs
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
 * Add prefetch job to queue
 */
async function queuePrefetch(userId, priority = 'medium', options = {}) {
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

    return {
      name: 'prefetch',
      waiting,
      active,
      completed,
      failed,
      delayed
    };
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
    logger.info('Prefetch queue closed');
  } catch (error) {
    logger.error('Error closing queue:', { error: error.message });
    throw error;
  }
}

module.exports = {
  prefetchQueue,
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
