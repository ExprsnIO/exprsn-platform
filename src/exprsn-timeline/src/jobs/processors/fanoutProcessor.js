/**
 * ═══════════════════════════════════════════════════════════
 * Fan-out Job Processor
 * Process timeline fan-out jobs
 * ═══════════════════════════════════════════════════════════
 */

const fanoutService = require('../../services/fanoutService');
const logger = require('../../utils/logger');

/**
 * Process fan-out job
 * Distributes a post to all followers' timelines
 */
async function processFanoutJob(job) {
  const { postId, authorId, postData } = job.data;

  logger.info('Processing fan-out job', {
    jobId: job.id,
    postId,
    authorId,
    attempt: job.attemptsMade + 1
  });

  try {
    const result = await fanoutService.fanoutPostToFollowers(
      postId,
      authorId,
      postData
    );

    logger.info('Fan-out job completed', {
      jobId: job.id,
      postId,
      ...result
    });

    return result;
  } catch (error) {
    logger.error('Fan-out job failed', {
      jobId: job.id,
      postId,
      authorId,
      error: error.message,
      stack: error.stack
    });

    // Rethrow to let Bull handle retry
    throw error;
  }
}

/**
 * Process fan-out removal job
 * Removes a deleted post from followers' timelines
 */
async function processFanoutRemovalJob(job) {
  const { postId, authorId } = job.data;

  logger.info('Processing fan-out removal job', {
    jobId: job.id,
    postId,
    authorId
  });

  try {
    const result = await fanoutService.removeFanoutPost(postId, authorId);

    logger.info('Fan-out removal completed', {
      jobId: job.id,
      postId,
      ...result
    });

    return result;
  } catch (error) {
    logger.error('Fan-out removal failed', {
      jobId: job.id,
      postId,
      error: error.message
    });

    throw error;
  }
}

/**
 * Process cache invalidation job
 */
async function processCacheInvalidationJob(job) {
  const { userIds, reason } = job.data;

  logger.info('Processing cache invalidation job', {
    jobId: job.id,
    userCount: userIds.length,
    reason
  });

  try {
    await fanoutService.invalidateTimelineCache(userIds);

    return {
      success: true,
      invalidated: userIds.length
    };
  } catch (error) {
    logger.error('Cache invalidation failed', {
      jobId: job.id,
      error: error.message
    });

    throw error;
  }
}

module.exports = {
  processFanoutJob,
  processFanoutRemovalJob,
  processCacheInvalidationJob
};
