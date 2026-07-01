/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Prefetch - Worker Process
 * ═══════════════════════════════════════════════════════════════════════
 */

const config = require('./config');
const logger = require('./utils/logger');
const ActivityBasedStrategy = require('./strategies/activityBased');
const { registerProcessor, registerRabbitConsumer, closePrefetchQueue } = require('./queues/prefetchQueue');
const { destroyTokenCache } = require('./utils/caClient');

// Initialize strategies
const activityStrategy = new ActivityBasedStrategy();

let schedulerHandle = null;

/**
 * Main worker loop.
 *
 * This dedicated process owns BOTH ends of the prefetch pipeline:
 *  - the Bull consumer (registerProcessor) that runs the heavy timeline pulls
 *    for jobs enqueued here and via the gateway's REST /schedule endpoints, and
 *  - the activity-based scheduler that periodically ENQUEUES those jobs.
 * The in-process gateway only produces/serves REST; it never processes jobs.
 */
async function runWorker() {
  logger.info('Prefetch worker started');
  logger.info(`Worker concurrency: ${config.worker.concurrency}`);
  logger.info(`Batch size: ${config.worker.batchSize}`);
  logger.info(`Queue backend: ${config.queue.backend}`);

  // Consume prefetch jobs. The backend is config-driven:
  //  - 'rabbitmq' (when the broker is reachable) consumes the RabbitMQ work
  //    queue; if the broker is unavailable we fall back to the Bull processor so
  //    the worker is never left without a consumer.
  //  - 'redis' (default) registers the Bull processor.
  let consuming = 'bull';
  if (config.queue.backend === 'rabbitmq') {
    try {
      const tag = await registerRabbitConsumer();
      if (tag) {
        consuming = 'rabbitmq';
      } else {
        logger.warn('RabbitMQ backend selected but broker unavailable; using Bull processor');
        registerProcessor();
      }
    } catch (error) {
      logger.warn('Failed to start RabbitMQ consumer; using Bull processor', { error: error.message });
      registerProcessor();
    }
  } else {
    // Idempotent — also auto-registers under PREFETCH_ROLE=worker
    registerProcessor();
  }
  logger.info(`Prefetch consumer active: ${consuming}`);

  // Periodically enqueue activity-based prefetch jobs for the consumer to process
  if (config.strategies.activityBased) {
    schedulerHandle = setInterval(async () => {
      try {
        logger.debug('Scheduling activity-based prefetch jobs');
        const result = await activityStrategy.schedule();
        logger.info('Activity-based strategy scheduled', { result });
      } catch (error) {
        logger.error('Error scheduling prefetch jobs:', { error: error.message });
      }
    }, config.strategies.activityCheckInterval);

    logger.info(`Activity-based scheduler started (interval: ${config.strategies.activityCheckInterval}ms)`);
  }

  logger.info('Prefetch worker running');
}

// Graceful shutdown — drain the queue and release resources
async function shutdown(signal) {
  logger.info(`${signal} received, shutting down worker`);
  try {
    if (schedulerHandle) {
      clearInterval(schedulerHandle);
    }
    await closePrefetchQueue();
    destroyTokenCache();
  } catch (error) {
    logger.error('Error during worker shutdown', { error: error.message });
  } finally {
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start worker
runWorker().catch(error => {
  logger.error('Worker failed to start:', error);
  process.exit(1);
});
