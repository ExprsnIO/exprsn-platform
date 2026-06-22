/**
 * ═══════════════════════════════════════════════════════════
 * Timeline Worker
 * Background job processor for timeline operations
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();
const { initializeQueues, closeQueues, queues } = require('./config/queue');
const { initRedisClient } = require('@exprsn/shared');
const { createLogger } = require('@exprsn/shared');
const db = require('./models');

// Job processors
const {
  processFanoutJob,
  processFanoutRemovalJob,
  processCacheInvalidationJob
} = require('./jobs/processors/fanoutProcessor');

const {
  processHashtagJob,
  processTrendingUpdateJob,
  processTrendingCleanupJob
} = require('./jobs/processors/trendingProcessor');

const {
  processIndexingJob,
  processBulkReindexJob
} = require('./jobs/processors/indexingProcessor');

const {
  processNotificationJob,
  processBatchNotificationJob
} = require('./jobs/processors/notificationProcessor');

const logger = createLogger('timeline-worker');

/**
 * Worker configuration
 */
const WORKER_CONCURRENCY = {
  fanout: parseInt(process.env.FANOUT_WORKER_CONCURRENCY) || 10,
  trending: parseInt(process.env.TRENDING_WORKER_CONCURRENCY) || 5,
  indexing: parseInt(process.env.INDEXING_WORKER_CONCURRENCY) || 3,
  notifications: parseInt(process.env.NOTIFICATION_WORKER_CONCURRENCY) || 20
};

/**
 * Register job processors
 */
function registerProcessors() {
  // Fan-out queue processors
  if (queues.fanout) {
    queues.fanout.process('post-fanout', WORKER_CONCURRENCY.fanout, processFanoutJob);
    queues.fanout.process('post-removal', WORKER_CONCURRENCY.fanout, processFanoutRemovalJob);
    queues.fanout.process('cache-invalidation', WORKER_CONCURRENCY.fanout, processCacheInvalidationJob);

    logger.info('Fan-out processors registered', {
      concurrency: WORKER_CONCURRENCY.fanout
    });
  }

  // Trending queue processors
  if (queues.trending) {
    queues.trending.process('hashtag-extraction', WORKER_CONCURRENCY.trending, processHashtagJob);
    queues.trending.process('trending-update', WORKER_CONCURRENCY.trending, processTrendingUpdateJob);
    queues.trending.process('trending-cleanup', WORKER_CONCURRENCY.trending, processTrendingCleanupJob);

    logger.info('Trending processors registered', {
      concurrency: WORKER_CONCURRENCY.trending
    });
  }

  // Indexing queue processors
  if (queues.indexing) {
    queues.indexing.process('post-index', WORKER_CONCURRENCY.indexing, processIndexingJob);
    queues.indexing.process('bulk-reindex', WORKER_CONCURRENCY.indexing, processBulkReindexJob);

    logger.info('Indexing processors registered', {
      concurrency: WORKER_CONCURRENCY.indexing
    });
  }

  // Notification queue processors
  if (queues.notifications) {
    queues.notifications.process('notification', WORKER_CONCURRENCY.notifications, processNotificationJob);
    queues.notifications.process('batch-notification', WORKER_CONCURRENCY.notifications, processBatchNotificationJob);

    logger.info('Notification processors registered', {
      concurrency: WORKER_CONCURRENCY.notifications
    });
  }
}

/**
 * Schedule recurring jobs
 */
async function scheduleRecurringJobs() {
  // Update trending posts every 15 minutes
  if (queues.trending) {
    await queues.trending.add(
      'trending-update',
      {},
      {
        repeat: {
          cron: '*/15 * * * *' // Every 15 minutes
        },
        jobId: 'trending-update-recurring'
      }
    );

    logger.info('Scheduled recurring: trending-update (every 15 min)');

    // Clean old trending records daily at 3 AM
    await queues.trending.add(
      'trending-cleanup',
      {},
      {
        repeat: {
          cron: '0 3 * * *' // Daily at 3 AM
        },
        jobId: 'trending-cleanup-recurring'
      }
    );

    logger.info('Scheduled recurring: trending-cleanup (daily 3 AM)');
  }
}

/**
 * Start worker
 */
async function startWorker() {
  try {
    logger.info('Starting Timeline Worker');
    logger.info('Environment:', process.env.NODE_ENV || 'development');

    // Initialize database connection
    await db.sequelize.authenticate();
    logger.info('Database connection established');

    // Initialize Redis
    if (process.env.REDIS_ENABLED === 'true') {
      await initRedisClient();
      logger.info('Redis client initialized');
    }

    // Initialize queues
    initializeQueues();
    logger.info('Queues initialized');

    // Register processors
    registerProcessors();

    // Schedule recurring jobs
    await scheduleRecurringJobs();

    logger.info('Timeline Worker started successfully');
    logger.info('Worker concurrency:', WORKER_CONCURRENCY);
    logger.info('Press Ctrl+C to stop');

  } catch (error) {
    logger.error('Failed to start worker:', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function shutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully`);

  try {
    // Close all queues
    await closeQueues();
    logger.info('All queues closed');

    // Close database connection
    await db.sequelize.close();
    logger.info('Database connection closed');

    logger.info('Worker shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', { error: error.message });
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', {
    error: error.message,
    stack: error.stack
  });
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection:', {
    reason,
    promise
  });
});

// Start the worker
if (require.main === module) {
  startWorker();
}

module.exports = { startWorker, registerProcessors };
