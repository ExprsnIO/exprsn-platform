/**
 * Queue Service
 * Background job management with Bull queues
 */

const Queue = require('bull');
const { createLogger } = require('@exprsn/shared');

const logger = createLogger('exprsn-spark:queue');

// Queue configuration
const queueConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: process.env.BULL_REDIS_DB || 1
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 100,
    removeOnFail: false
  }
};

/**
 * Message Notification Queue
 * Sends notifications for new messages
 */
const messageNotificationQueue = new Queue('spark:message-notification', queueConfig);

/**
 * Message Indexing Queue
 * Indexes messages in Elasticsearch for search
 */
const messageIndexingQueue = new Queue('spark:message-indexing', queueConfig);

/**
 * File Processing Queue
 * Processes uploaded files (thumbnails, transcoding, etc.)
 */
const fileProcessingQueue = new Queue('spark:file-processing', queueConfig);

/**
 * Delivery Tracking Queue
 * Tracks message delivery and read receipts
 */
const deliveryTrackingQueue = new Queue('spark:delivery-tracking', queueConfig);

/**
 * Cleanup Queue
 * Periodic cleanup of old messages, attachments, etc.
 */
const cleanupQueue = new Queue('spark:cleanup', queueConfig);

// Queue event handlers
function setupQueueEventHandlers(queue, name) {
  queue.on('completed', (job, result) => {
    logger.info(`${name} job completed`, {
      jobId: job.id,
      data: job.data,
      result
    });
  });

  queue.on('failed', (job, err) => {
    logger.error(`${name} job failed`, {
      jobId: job.id,
      data: job.data,
      error: err.message,
      stack: err.stack
    });
  });

  queue.on('stalled', (job) => {
    logger.warn(`${name} job stalled`, {
      jobId: job.id,
      data: job.data
    });
  });

  queue.on('error', (error) => {
    logger.error(`${name} queue error`, {
      error: error.message,
      stack: error.stack
    });
  });
}

// Setup event handlers for all queues
setupQueueEventHandlers(messageNotificationQueue, 'Message Notification');
setupQueueEventHandlers(messageIndexingQueue, 'Message Indexing');
setupQueueEventHandlers(fileProcessingQueue, 'File Processing');
setupQueueEventHandlers(deliveryTrackingQueue, 'Delivery Tracking');
setupQueueEventHandlers(cleanupQueue, 'Cleanup');

/**
 * Add message notification job
 */
async function addNotificationJob(message, recipientIds) {
  try {
    const job = await messageNotificationQueue.add({
      messageId: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      content: message.content,
      recipientIds
    }, {
      priority: 1,
      delay: 0
    });

    logger.debug('Notification job added', { jobId: job.id, messageId: message.id });
    return job;
  } catch (error) {
    logger.error('Failed to add notification job', {
      messageId: message.id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Add message indexing job
 */
async function addIndexingJob(message) {
  try {
    const job = await messageIndexingQueue.add({
      messageId: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      content: message.content,
      createdAt: message.createdAt
    }, {
      priority: 2,
      delay: 1000 // Index after 1 second
    });

    logger.debug('Indexing job added', { jobId: job.id, messageId: message.id });
    return job;
  } catch (error) {
    logger.error('Failed to add indexing job', {
      messageId: message.id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Add file processing job
 */
async function addFileProcessingJob(attachment) {
  try {
    const job = await fileProcessingQueue.add({
      attachmentId: attachment.id,
      messageId: attachment.messageId,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      fileUrl: attachment.fileUrl
    }, {
      priority: 3,
      timeout: 300000 // 5 minutes
    });

    logger.debug('File processing job added', { jobId: job.id, attachmentId: attachment.id });
    return job;
  } catch (error) {
    logger.error('Failed to add file processing job', {
      attachmentId: attachment.id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Add delivery tracking job
 */
async function addDeliveryTrackingJob(messageId, userId, status) {
  try {
    const job = await deliveryTrackingQueue.add({
      messageId,
      userId,
      status, // 'delivered' or 'read'
      timestamp: new Date()
    }, {
      priority: 4,
      delay: 0
    });

    logger.debug('Delivery tracking job added', { jobId: job.id, messageId });
    return job;
  } catch (error) {
    logger.error('Failed to add delivery tracking job', {
      messageId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Add cleanup job
 */
async function addCleanupJob(type, options = {}) {
  try {
    const job = await cleanupQueue.add({
      type, // 'messages', 'attachments', 'conversations'
      ...options
    }, {
      priority: 5,
      repeat: options.repeat || undefined
    });

    logger.debug('Cleanup job added', { jobId: job.id, type });
    return job;
  } catch (error) {
    logger.error('Failed to add cleanup job', {
      type,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get queue statistics
 */
async function getQueueStats(queueName) {
  const queues = {
    'notification': messageNotificationQueue,
    'indexing': messageIndexingQueue,
    'file-processing': fileProcessingQueue,
    'delivery-tracking': deliveryTrackingQueue,
    'cleanup': cleanupQueue
  };

  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Unknown queue: ${queueName}`);
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
  const stats = await Promise.all([
    getQueueStats('notification'),
    getQueueStats('indexing'),
    getQueueStats('file-processing'),
    getQueueStats('delivery-tracking'),
    getQueueStats('cleanup')
  ]);

  return stats;
}

/**
 * Pause a queue
 */
async function pauseQueue(queueName) {
  const queues = {
    'notification': messageNotificationQueue,
    'indexing': messageIndexingQueue,
    'file-processing': fileProcessingQueue,
    'delivery-tracking': deliveryTrackingQueue,
    'cleanup': cleanupQueue
  };

  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Unknown queue: ${queueName}`);
  }

  await queue.pause();
  logger.info('Queue paused', { queueName });
}

/**
 * Resume a queue
 */
async function resumeQueue(queueName) {
  const queues = {
    'notification': messageNotificationQueue,
    'indexing': messageIndexingQueue,
    'file-processing': fileProcessingQueue,
    'delivery-tracking': deliveryTrackingQueue,
    'cleanup': cleanupQueue
  };

  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Unknown queue: ${queueName}`);
  }

  await queue.resume();
  logger.info('Queue resumed', { queueName });
}

/**
 * Clean completed jobs from a queue
 */
async function cleanQueue(queueName, grace = 3600000) {
  const queues = {
    'notification': messageNotificationQueue,
    'indexing': messageIndexingQueue,
    'file-processing': fileProcessingQueue,
    'delivery-tracking': deliveryTrackingQueue,
    'cleanup': cleanupQueue
  };

  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Unknown queue: ${queueName}`);
  }

  await queue.clean(grace, 'completed');
  logger.info('Queue cleaned', { queueName, grace });
}

/**
 * Shutdown all queues gracefully
 */
async function shutdownQueues() {
  logger.info('Shutting down queues...');

  await Promise.all([
    messageNotificationQueue.close(),
    messageIndexingQueue.close(),
    fileProcessingQueue.close(),
    deliveryTrackingQueue.close(),
    cleanupQueue.close()
  ]);

  logger.info('All queues shut down');
}

module.exports = {
  messageNotificationQueue,
  messageIndexingQueue,
  fileProcessingQueue,
  deliveryTrackingQueue,
  cleanupQueue,
  addNotificationJob,
  addIndexingJob,
  addFileProcessingJob,
  addDeliveryTrackingJob,
  addCleanupJob,
  getQueueStats,
  getAllQueueStats,
  pauseQueue,
  resumeQueue,
  cleanQueue,
  shutdownQueues
};
