/**
 * Exprsn Herald - Job Queue Setup
 */

const Queue = require('bull');
const config = require('../config');
const logger = require('../utils/logger');

// Create queues
const emailQueue = new Queue('email-notifications', {
  redis: {
    host: config.redis.host,
    port: config.redis.port
  }
});

const pushQueue = new Queue('push-notifications', {
  redis: {
    host: config.redis.host,
    port: config.redis.port
  }
});

const smsQueue = new Queue('sms-notifications', {
  redis: {
    host: config.redis.host,
    port: config.redis.port
  }
});

const digestQueue = new Queue('digest-notifications', {
  redis: {
    host: config.redis.host,
    port: config.redis.port
  }
});

const cleanupQueue = new Queue('cleanup', {
  redis: {
    host: config.redis.host,
    port: config.redis.port
  }
});

// Import job processors
const emailJob = require('./emailJob');
const pushJob = require('./pushJob');
const smsJob = require('./smsJob');
const digestJob = require('./digestJob');
const cleanupJob = require('./cleanupJob');

// Register processors
emailQueue.process(emailJob.process);
pushQueue.process(pushJob.process);
smsQueue.process(smsJob.process);
digestQueue.process(digestJob.process);
cleanupQueue.process(cleanupJob.process);

// Queue event handlers
const setupQueueHandlers = (queue, name) => {
  queue.on('completed', (job) => {
    logger.info(`${name} job completed`, { jobId: job.id });
  });

  queue.on('failed', (job, err) => {
    logger.error(`${name} job failed`, {
      jobId: job.id,
      error: err.message
    });
  });

  queue.on('error', (error) => {
    logger.error(`${name} queue error`, { error: error.message });
  });
};

setupQueueHandlers(emailQueue, 'Email');
setupQueueHandlers(pushQueue, 'Push');
setupQueueHandlers(smsQueue, 'SMS');
setupQueueHandlers(digestQueue, 'Digest');
setupQueueHandlers(cleanupQueue, 'Cleanup');

// Schedule recurring cleanup job (runs daily at 2 AM)
cleanupQueue.add(
  {},
  {
    repeat: {
      cron: '0 2 * * *' // Every day at 2 AM
    }
  }
);

logger.info('Job queues initialized');

module.exports = {
  emailQueue,
  pushQueue,
  smsQueue,
  digestQueue,
  cleanupQueue
};
