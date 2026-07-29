'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Cortex Worker
 * Bull processor for long-running agent tasks (cortex-tasks queue).
 * Run with: npm run worker:cortex
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();
const { createLogger } = require('@exprsn/shared');
const config = require('./config');
const db = require('./models');
const { initCache } = require('./lib/cache');
const { initQueues, closeQueues, queues } = require('./queues');

const logger = createLogger('cortex-worker');

async function startWorker() {
  try {
    logger.info('Starting Cortex Worker');

    if (!config.features.cortexEnabled) {
      logger.warn('CORTEX_ENABLED is false — worker will still process any queued jobs');
    }

    await db.sequelize.authenticate();
    logger.info('Database connection established');

    initCache();
    initQueues();

    // Required late so the engine (which touches models/cache at import time
    // of its dependencies) initializes after DB/Redis are up.
    const { runTask, runAgentRun } = require('./engine/jobs');

    const concurrency = Math.max(1, config.cortex.taskConcurrency);
    queues.tasks.process('run-task', concurrency, async (job) => {
      logger.info('Running agent task', { taskId: job.data.taskId });
      const task = await runTask(job.data.taskId);
      logger.info('Agent task finished', { taskId: job.data.taskId, status: task.status });
    });
    // FEAT-080: DB-defined agent runs share the cortex-tasks queue/concurrency.
    queues.tasks.process('run-agent', concurrency, async (job) => {
      logger.info('Running agent run', { runId: job.data.runId });
      const run = await runAgentRun(job.data.runId);
      logger.info('Agent run finished', { runId: job.data.runId, status: run.status });
    });

    logger.info('Cortex Worker started', {
      concurrency,
      llmBaseUrl: config.cortex.llmBaseUrl,
      brain: config.cortex.brainModel,
    });
  } catch (error) {
    logger.error('Failed to start worker', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

async function shutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully`);
  try {
    await closeQueues();
    await db.sequelize.close();
    logger.info('Worker shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
});

if (require.main === module) {
  startWorker();
}

module.exports = { startWorker };
