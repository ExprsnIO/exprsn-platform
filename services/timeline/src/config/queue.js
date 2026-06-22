/**
 * ═══════════════════════════════════════════════════════════
 * Queue Configuration
 * Bull queue setup for background jobs
 * ═══════════════════════════════════════════════════════════
 */

const Queue = require('bull');
const logger = require('../utils/logger');

// Redis connection options
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false
};

/**
 * Queue configurations
 */
const queueConfigs = {
  // Timeline fan-out queue - high priority
  fanout: {
    redis: redisConfig,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      removeOnComplete: {
        age: 3600, // Keep completed jobs for 1 hour
        count: 1000
      },
      removeOnFail: {
        age: 86400 // Keep failed jobs for 24 hours
      }
    },
    limiter: {
      max: 100, // Max 100 jobs per second
      duration: 1000
    }
  },

  // Hashtag and trending processing - medium priority
  trending: {
    redis: redisConfig,
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: 'fixed',
        delay: 5000
      },
      removeOnComplete: {
        age: 3600,
        count: 500
      },
      removeOnFail: {
        age: 86400
      }
    },
    limiter: {
      max: 50,
      duration: 1000
    }
  },

  // Search indexing - low priority
  indexing: {
    redis: redisConfig,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 3000
      },
      removeOnComplete: {
        age: 1800,
        count: 500
      },
      removeOnFail: {
        age: 86400
      }
    },
    limiter: {
      max: 30,
      duration: 1000
    }
  },

  // Notification queue - high priority
  notifications: {
    redis: redisConfig,
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 1000
      },
      removeOnComplete: {
        age: 3600,
        count: 2000
      },
      removeOnFail: {
        age: 86400
      }
    },
    limiter: {
      max: 200,
      duration: 1000
    }
  }
};

/**
 * Create queues
 */
const queues = {
  fanout: null,
  trending: null,
  indexing: null,
  notifications: null
};

/**
 * Initialize all queues
 */
function initializeQueues() {
  try {
    Object.keys(queueConfigs).forEach(queueName => {
      queues[queueName] = new Queue(queueName, queueConfigs[queueName]);

      // Queue event handlers
      queues[queueName].on('error', (error) => {
        logger.error(`Queue ${queueName} error:`, { error: error.message });
      });

      queues[queueName].on('failed', (job, error) => {
        logger.error(`Job ${job.id} in ${queueName} failed:`, {
          jobId: job.id,
          error: error.message,
          attempts: job.attemptsMade
        });
      });

      queues[queueName].on('completed', (job) => {
        logger.debug(`Job ${job.id} in ${queueName} completed`, {
          jobId: job.id,
          duration: Date.now() - job.timestamp
        });
      });

      queues[queueName].on('stalled', (job) => {
        logger.warn(`Job ${job.id} in ${queueName} stalled`, {
          jobId: job.id
        });
      });

      logger.info(`Queue ${queueName} initialized`);
    });

    return queues;
  } catch (error) {
    logger.error('Failed to initialize queues:', { error: error.message });
    throw error;
  }
}

/**
 * Close all queues gracefully
 */
async function closeQueues() {
  const closePromises = Object.entries(queues).map(async ([name, queue]) => {
    if (queue) {
      await queue.close();
      logger.info(`Queue ${name} closed`);
    }
  });

  await Promise.all(closePromises);
}

/**
 * Get queue statistics
 */
async function getQueueStats(queueName) {
  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Queue ${queueName} not found`);
  }

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount()
  ]);

  return {
    name: queueName,
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed
  };
}

/**
 * Get all queue statistics
 */
async function getAllQueueStats() {
  const statsPromises = Object.keys(queues).map(queueName =>
    getQueueStats(queueName)
  );

  return Promise.all(statsPromises);
}

/**
 * Pause a queue
 */
async function pauseQueue(queueName) {
  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Queue ${queueName} not found`);
  }

  await queue.pause();
  logger.info(`Queue ${queueName} paused`);
}

/**
 * Resume a queue
 */
async function resumeQueue(queueName) {
  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Queue ${queueName} not found`);
  }

  await queue.resume();
  logger.info(`Queue ${queueName} resumed`);
}

/**
 * Clean completed jobs from a queue
 */
async function cleanQueue(queueName, grace = 3600000) {
  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Queue ${queueName} not found`);
  }

  await queue.clean(grace, 'completed');
  await queue.clean(grace * 24, 'failed');

  logger.info(`Queue ${queueName} cleaned`, { grace });
}

module.exports = {
  initializeQueues,
  closeQueues,
  getQueueStats,
  getAllQueueStats,
  pauseQueue,
  resumeQueue,
  cleanQueue,
  queues,
  queueConfigs
};
