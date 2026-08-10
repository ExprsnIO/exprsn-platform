/**
 * ═══════════════════════════════════════════════════════════════════════
 * Media Queue - Background Job Queue for Media Processing
 * ═══════════════════════════════════════════════════════════════════════
 */

const Bull = require('bull');
const config = require('../config');
const logger = require('../utils/logger');

// Create Bull queue with Redis configuration
const mediaQueue = new Bull('media-processing', {
  redis: {
    host: config.redis.host || 'localhost',
    port: config.redis.port || 6379,
    password: config.redis.password || undefined,
    db: config.redis.db || 0
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: true,
    removeOnFail: false
  }
});

// Queue event handlers
mediaQueue.on('error', (error) => {
  logger.error('Media queue error:', error);
});

mediaQueue.on('waiting', (jobId) => {
  logger.debug('Job waiting', { jobId });
});

mediaQueue.on('active', (job) => {
  logger.info('Job started', {
    jobId: job.id,
    type: job.name,
    mediaId: job.data.mediaId
  });
});

mediaQueue.on('completed', (job, result) => {
  logger.info('Job completed', {
    jobId: job.id,
    type: job.name,
    mediaId: job.data.mediaId,
    duration: Date.now() - job.timestamp
  });
});

mediaQueue.on('failed', (job, err) => {
  logger.error('Job failed', {
    jobId: job.id,
    type: job.name,
    mediaId: job.data.mediaId,
    error: err.message,
    attempts: job.attemptsMade,
    maxAttempts: job.opts.attempts
  });
});

mediaQueue.on('stalled', (job) => {
  logger.warn('Job stalled', {
    jobId: job.id,
    type: job.name,
    mediaId: job.data.mediaId
  });
});

/**
 * Add video processing job
 * @param {string} mediaId - Media ID
 * @param {string} filePath - File path
 * @param {Object} options - Processing options
 * @returns {Promise<Job>}
 */
async function addVideoProcessingJob(mediaId, filePath, options = {}) {
  try {
    const job = await mediaQueue.add('process-video', {
      mediaId,
      filePath,
      options
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false,
      priority: options.priority || 5
    });

    logger.info('Video processing job added', {
      jobId: job.id,
      mediaId,
      filePath
    });

    return job;
  } catch (error) {
    logger.error('Failed to add video processing job:', error);
    throw error;
  }
}

/**
 * Add thumbnail generation job
 * @param {string} mediaId - Media ID
 * @param {string} filePath - File path
 * @param {Object} options - Thumbnail options
 * @returns {Promise<Job>}
 */
async function addThumbnailJob(mediaId, filePath, options = {}) {
  try {
    const job = await mediaQueue.add('generate-thumbnails', {
      mediaId,
      filePath,
      options
    }, {
      attempts: 2,
      backoff: 1000,
      removeOnComplete: true,
      removeOnFail: false,
      priority: options.priority || 7
    });

    logger.info('Thumbnail generation job added', {
      jobId: job.id,
      mediaId,
      filePath
    });

    return job;
  } catch (error) {
    logger.error('Failed to add thumbnail job:', error);
    throw error;
  }
}

/**
 * Add AI tagging job (if AI features enabled)
 * @param {string} mediaId - Media ID
 * @param {string} filePath - File path
 * @param {string} mediaType - Media type (image/video)
 * @returns {Promise<Job>}
 */
async function addAITaggingJob(mediaId, filePath, mediaType) {
  if (!config.media?.enableAutoTagging) {
    logger.debug('AI tagging disabled, skipping job');
    return null;
  }

  try {
    const job = await mediaQueue.add('ai-tagging', {
      mediaId,
      filePath,
      mediaType
    }, {
      attempts: 2,
      backoff: 3000,
      removeOnComplete: true,
      removeOnFail: false,
      priority: 8 // Lower priority
    });

    logger.info('AI tagging job added', {
      jobId: job.id,
      mediaId
    });

    return job;
  } catch (error) {
    logger.error('Failed to add AI tagging job:', error);
    throw error;
  }
}

/**
 * Add face detection job (if face detection enabled)
 * @param {string} mediaId - Media ID
 * @param {string} filePath - File path
 * @returns {Promise<Job>}
 */
async function addFaceDetectionJob(mediaId, filePath) {
  if (!config.media?.enableFaceDetection) {
    logger.debug('Face detection disabled, skipping job');
    return null;
  }

  try {
    const job = await mediaQueue.add('face-detection', {
      mediaId,
      filePath
    }, {
      attempts: 2,
      backoff: 3000,
      removeOnComplete: true,
      removeOnFail: false,
      priority: 9 // Lowest priority
    });

    logger.info('Face detection job added', {
      jobId: job.id,
      mediaId
    });

    return job;
  } catch (error) {
    logger.error('Failed to add face detection job:', error);
    throw error;
  }
}

/**
 * Get job by ID
 * @param {string} jobId - Job ID
 * @returns {Promise<Job>}
 */
async function getJob(jobId) {
  return await mediaQueue.getJob(jobId);
}

/**
 * Get job counts
 * @returns {Promise<Object>}
 */
async function getJobCounts() {
  return await mediaQueue.getJobCounts();
}

/**
 * Get active jobs
 * @returns {Promise<Array>}
 */
async function getActiveJobs() {
  return await mediaQueue.getActive();
}

/**
 * Get waiting jobs
 * @returns {Promise<Array>}
 */
async function getWaitingJobs() {
  return await mediaQueue.getWaiting();
}

/**
 * Get failed jobs
 * @returns {Promise<Array>}
 */
async function getFailedJobs() {
  return await mediaQueue.getFailed();
}

/**
 * Get completed jobs
 * @param {number} start - Start index
 * @param {number} end - End index
 * @returns {Promise<Array>}
 */
async function getCompletedJobs(start = 0, end = 100) {
  return await mediaQueue.getCompleted(start, end);
}

/**
 * Retry failed job
 * @param {string} jobId - Job ID
 * @returns {Promise<void>}
 */
async function retryJob(jobId) {
  const job = await mediaQueue.getJob(jobId);
  if (job) {
    await job.retry();
    logger.info('Job retried', { jobId });
  }
}

/**
 * Remove job
 * @param {string} jobId - Job ID
 * @returns {Promise<void>}
 */
async function removeJob(jobId) {
  const job = await mediaQueue.getJob(jobId);
  if (job) {
    await job.remove();
    logger.info('Job removed', { jobId });
  }
}

/**
 * Clean completed jobs
 * @param {number} grace - Grace period in milliseconds
 * @returns {Promise<void>}
 */
async function cleanCompletedJobs(grace = 3600000) {
  await mediaQueue.clean(grace, 'completed');
  logger.info('Cleaned completed jobs', { grace });
}

/**
 * Clean failed jobs
 * @param {number} grace - Grace period in milliseconds
 * @returns {Promise<void>}
 */
async function cleanFailedJobs(grace = 86400000) {
  await mediaQueue.clean(grace, 'failed');
  logger.info('Cleaned failed jobs', { grace });
}

/**
 * Pause queue
 * @returns {Promise<void>}
 */
async function pauseQueue() {
  await mediaQueue.pause();
  logger.info('Media queue paused');
}

/**
 * Resume queue
 * @returns {Promise<void>}
 */
async function resumeQueue() {
  await mediaQueue.resume();
  logger.info('Media queue resumed');
}

/**
 * Close queue
 * @returns {Promise<void>}
 */
async function closeQueue() {
  await mediaQueue.close();
  logger.info('Media queue closed');
}

module.exports = {
  mediaQueue,
  addVideoProcessingJob,
  addThumbnailJob,
  addAITaggingJob,
  addFaceDetectionJob,
  getJob,
  getJobCounts,
  getActiveJobs,
  getWaitingJobs,
  getFailedJobs,
  getCompletedJobs,
  retryJob,
  removeJob,
  cleanCompletedJobs,
  cleanFailedJobs,
  pauseQueue,
  resumeQueue,
  closeQueue
};
