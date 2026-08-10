/**
 * ═══════════════════════════════════════════════════════════
 * Indexing Job Processor
 * Process search indexing jobs (ElasticSearch integration)
 * ═══════════════════════════════════════════════════════════
 */

const logger = require('../../utils/logger');
const { Post } = require('../../models');
const elasticsearchService = require('../../services/elasticsearchService');

/**
 * Process post indexing job
 * Index post in ElasticSearch for search
 */
async function processIndexingJob(job) {
  const { postId, operation = 'index', postData } = job.data;

  logger.info('Processing indexing job', {
    jobId: job.id,
    postId,
    operation
  });

  try {
    let result;

    if (operation === 'index' || operation === 'update') {
      // Fetch post from database if not provided
      let post = postData;

      if (!post) {
        post = await Post.findByPk(postId, {
          attributes: [
            'id',
            'userId',
            'content',
            'contentType',
            'visibility',
            'status',
            'hashtags',
            'mentions',
            'urls',
            'language',
            'isRepost',
            'originalPostId',
            'replyToPostId',
            'replyToUserId',
            'likeCount',
            'repostCount',
            'replyCount',
            'viewCount',
            'engagementScore',
            'createdAt',
            'updatedAt',
            'publishedAt',
            'location',
            'locationName',
            'hasMedia',
            'mediaTypes',
            'mediaCount'
          ]
        });

        if (!post) {
          logger.warn('Post not found for indexing', { postId });
          return { success: false, reason: 'POST_NOT_FOUND' };
        }

        post = post.toJSON();
      }

      // Index or update in ElasticSearch
      if (operation === 'index') {
        result = await elasticsearchService.indexPost(post);
      } else {
        result = await elasticsearchService.updatePost(postId, post);
      }

      logger.info('Post indexed in ElasticSearch', {
        jobId: job.id,
        postId,
        operation
      });
    } else if (operation === 'delete') {
      // Delete from ElasticSearch
      result = await elasticsearchService.deletePost(postId);

      logger.info('Post deleted from ElasticSearch', {
        jobId: job.id,
        postId
      });
    } else {
      logger.error('Unknown indexing operation', { operation, postId });
      return { success: false, reason: 'UNKNOWN_OPERATION' };
    }

    return {
      success: result.success,
      operation,
      postId,
      error: result.error,
      reason: result.reason
    };
  } catch (error) {
    logger.error('Indexing job failed', {
      jobId: job.id,
      postId,
      operation,
      error: error.message
    });

    throw error;
  }
}

/**
 * Process bulk reindexing job
 * Reindex all posts or a subset
 */
async function processBulkReindexJob(job) {
  const { offset = 0, limit = 100, batchSize = 100 } = job.data;

  logger.info('Processing bulk reindex job', {
    jobId: job.id,
    offset,
    limit
  });

  try {
    let currentOffset = offset;
    let totalIndexed = 0;
    let totalErrors = 0;
    let hasMore = true;

    while (hasMore && (limit === 0 || totalIndexed < limit)) {
      const batchLimit = limit === 0 ? batchSize : Math.min(batchSize, limit - totalIndexed);

      // Fetch batch of posts
      const posts = await Post.findAll({
        where: {
          status: 'published'
        },
        attributes: [
          'id',
          'userId',
          'content',
          'contentType',
          'visibility',
          'status',
          'hashtags',
          'mentions',
          'urls',
          'language',
          'isRepost',
          'originalPostId',
          'replyToPostId',
          'replyToUserId',
          'likeCount',
          'repostCount',
          'replyCount',
          'viewCount',
          'engagementScore',
          'createdAt',
          'updatedAt',
          'publishedAt',
          'location',
          'locationName',
          'hasMedia',
          'mediaTypes',
          'mediaCount'
        ],
        limit: batchLimit,
        offset: currentOffset,
        order: [['createdAt', 'DESC']]
      });

      if (posts.length === 0) {
        hasMore = false;
        break;
      }

      // Bulk index batch
      const result = await elasticsearchService.bulkIndexPosts(
        posts.map(post => post.toJSON())
      );

      totalIndexed += result.indexed || 0;
      totalErrors += result.errors || 0;

      logger.info('Bulk reindex batch completed', {
        jobId: job.id,
        batch: Math.floor(currentOffset / batchSize) + 1,
        indexed: result.indexed,
        errors: result.errors
      });

      // Update job progress
      await job.progress(totalIndexed);

      currentOffset += batchSize;

      // Check if we have more posts
      if (posts.length < batchLimit) {
        hasMore = false;
      }
    }

    // Refresh index to make all documents searchable
    await elasticsearchService.refreshIndex();

    logger.info('Bulk reindex completed', {
      jobId: job.id,
      indexed: totalIndexed,
      errors: totalErrors,
      hasMore
    });

    return {
      success: true,
      indexed: totalIndexed,
      errors: totalErrors,
      hasMore
    };
  } catch (error) {
    logger.error('Bulk reindex failed', {
      jobId: job.id,
      error: error.message
    });

    throw error;
  }
}

module.exports = {
  processIndexingJob,
  processBulkReindexJob
};
