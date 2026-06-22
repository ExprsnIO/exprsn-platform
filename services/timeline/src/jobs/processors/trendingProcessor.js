/**
 * ═══════════════════════════════════════════════════════════
 * Trending Job Processor
 * Process hashtag and trending calculations
 * ═══════════════════════════════════════════════════════════
 */

const trendingService = require('../../services/trendingService');
const logger = require('../../utils/logger');

/**
 * Process hashtag extraction job
 */
async function processHashtagJob(job) {
  const { postId, hashtags, postData } = job.data;

  logger.info('Processing hashtag job', {
    jobId: job.id,
    postId,
    hashtagCount: hashtags.length
  });

  try {
    const result = await trendingService.processHashtags(
      postId,
      hashtags,
      postData
    );

    logger.info('Hashtag job completed', {
      jobId: job.id,
      postId,
      ...result
    });

    return result;
  } catch (error) {
    logger.error('Hashtag job failed', {
      jobId: job.id,
      postId,
      error: error.message
    });

    throw error;
  }
}

/**
 * Process trending posts update job
 * Run periodically to recalculate trending posts
 */
async function processTrendingUpdateJob(job) {
  logger.info('Processing trending update job', {
    jobId: job.id
  });

  try {
    const result = await trendingService.updateTrendingPosts();

    logger.info('Trending update completed', {
      jobId: job.id,
      ...result
    });

    return result;
  } catch (error) {
    logger.error('Trending update failed', {
      jobId: job.id,
      error: error.message
    });

    throw error;
  }
}

/**
 * Process trending cleanup job
 * Remove old trending records
 */
async function processTrendingCleanupJob(job) {
  logger.info('Processing trending cleanup job', {
    jobId: job.id
  });

  try {
    const result = await trendingService.cleanOldTrending();

    logger.info('Trending cleanup completed', {
      jobId: job.id,
      ...result
    });

    return result;
  } catch (error) {
    logger.error('Trending cleanup failed', {
      jobId: job.id,
      error: error.message
    });

    throw error;
  }
}

module.exports = {
  processHashtagJob,
  processTrendingUpdateJob,
  processTrendingCleanupJob
};
