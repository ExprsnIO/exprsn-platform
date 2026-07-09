'use strict';

/**
 * Bull queue for long-running agent tasks (pattern: services/timeline's
 * config/queue.js). Interactive chat flows do NOT go through a queue — they
 * are direct in-process engine calls behind the LLM concurrency semaphore
 * (src/lib/llama.js). Only `runTask` executions land here, processed by the
 * separate worker process (npm run worker:cortex).
 */

const Queue = require('bull');
const { createLogger } = require('@exprsn/shared');
const config = require('../config');

const logger = createLogger('exprsn-cortex');

const queues = { tasks: null };

function initQueues() {
  if (queues.tasks) return queues;
  queues.tasks = new Queue('cortex-tasks', {
    redis: {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    },
    defaultJobOptions: {
      attempts: 1, // an agent task is not idempotent — never auto-retry
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 86400 },
    },
  });
  queues.tasks.on('error', (error) => {
    logger.error('cortex-tasks queue error', { error: error.message });
  });
  queues.tasks.on('failed', (job, error) => {
    logger.error('cortex task job failed', { jobId: job.id, error: error.message });
  });
  return queues;
}

async function closeQueues() {
  if (queues.tasks) {
    await queues.tasks.close();
    queues.tasks = null;
  }
}

async function queueStats() {
  if (!queues.tasks) return { initialized: false };
  try {
    const [waiting, active, failed] = await Promise.all([
      queues.tasks.getWaitingCount(),
      queues.tasks.getActiveCount(),
      queues.tasks.getFailedCount(),
    ]);
    return { initialized: true, waiting, active, failed };
  } catch (e) {
    return { initialized: true, error: e.message };
  }
}

module.exports = { initQueues, closeQueues, queueStats, queues };
