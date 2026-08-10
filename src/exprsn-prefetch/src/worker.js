/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Prefetch - Worker Process
 * ═══════════════════════════════════════════════════════════════════════
 */

const config = require('./config');
const logger = require('./utils/logger');
const ActivityBasedStrategy = require('./strategies/activityBased');
const { prefetchTimeline } = require('./services/prefetchService');

// Initialize strategies
const activityStrategy = new ActivityBasedStrategy();

/**
 * Main worker loop
 */
async function runWorker() {
  logger.info('Prefetch worker started');
  logger.info(`Worker concurrency: ${config.worker.concurrency}`);
  logger.info(`Batch size: ${config.worker.batchSize}`);

  // Run strategies periodically
  setInterval(async () => {
    try {
      if (config.strategies.activityBased) {
        logger.info('Running activity-based strategy');
        const result = await activityStrategy.run();
        logger.info('Activity-based strategy completed:', result);
      }
    } catch (error) {
      logger.error('Error running prefetch strategies:', error);
    }
  }, config.strategies.activityCheckInterval);

  // Keep worker alive
  logger.info('Prefetch worker running');
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down worker');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down worker');
  process.exit(0);
});

// Start worker
runWorker().catch(error => {
  logger.error('Worker failed to start:', error);
  process.exit(1);
});
