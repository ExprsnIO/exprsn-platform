/**
 * ═══════════════════════════════════════════════════════════
 * Fan-out Service
 * Distribute posts to followers' timelines
 * ═══════════════════════════════════════════════════════════
 */

const { Follow } = require('../models');
const { getRedisClient } = require('@exprsn/shared');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

/**
 * Get all followers for a user
 */
async function getFollowers(userId, options = {}) {
  const { limit = 1000000, offset = 0 } = options;

  try {
    const followers = await Follow.findAll({
      where: {
        followingId: userId,
        active: true
      },
      attributes: ['followerId'],
      limit,
      offset
    });

    return followers.map(f => f.followerId);
  } catch (error) {
    logger.error('Error fetching followers:', { userId, error: error.message });
    throw error;
  }
}

/**
 * Fan out post to followers' timelines
 * This is the main fan-out operation executed by workers
 */
async function fanoutPostToFollowers(postId, authorId, postData) {
  const startTime = Date.now();

  try {
    logger.info('Starting fan-out', { postId, authorId });

    // Get all followers
    const followerIds = await getFollowers(authorId);

    if (followerIds.length === 0) {
      logger.info('No followers to fan-out to', { postId, authorId });
      return {
        success: true,
        followerCount: 0,
        duration: Date.now() - startTime
      };
    }

    logger.info('Fan-out followers found', {
      postId,
      authorId,
      followerCount: followerIds.length
    });

    // Fan-out to Redis cache if available
    const redis = getRedisClient();
    if (redis) {
      await fanoutToRedisCache(followerIds, postId, postData);
    }

    // Fan-out to database in batches
    await fanoutToDatabase(followerIds, postId, authorId, postData);

    const duration = Date.now() - startTime;
    logger.info('Fan-out completed', {
      postId,
      authorId,
      followerCount: followerIds.length,
      duration
    });

    return {
      success: true,
      followerCount: followerIds.length,
      duration
    };
  } catch (error) {
    logger.error('Fan-out failed:', {
      postId,
      authorId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Fan-out to Redis cache (hot timelines)
 */
async function fanoutToRedisCache(followerIds, postId, postData) {
  const redis = getRedisClient();
  if (!redis) return;

  const BATCH_SIZE = 100;
  const TIMELINE_MAX_SIZE = 100;
  const TIMELINE_TTL = 300; // 5 minutes

  try {
    // Process in batches
    for (let i = 0; i < followerIds.length; i += BATCH_SIZE) {
      const batch = followerIds.slice(i, i + BATCH_SIZE);

      const pipeline = redis.pipeline();

      for (const followerId of batch) {
        const timelineKey = `timeline:${followerId}`;

        // Add post to timeline (sorted set with timestamp as score)
        pipeline.zadd(
          timelineKey,
          Date.now(),
          JSON.stringify({ postId, ...postData })
        );

        // Trim timeline to max size
        pipeline.zremrangebyrank(timelineKey, 0, -(TIMELINE_MAX_SIZE + 1));

        // Set expiry
        pipeline.expire(timelineKey, TIMELINE_TTL);
      }

      await pipeline.exec();
    }

    logger.debug('Redis cache fan-out completed', {
      followerCount: followerIds.length,
      postId
    });
  } catch (error) {
    logger.error('Redis cache fan-out failed:', {
      error: error.message,
      postId
    });
    // Don't throw - Redis is cache only
  }
}

/**
 * Fan-out to database (persistent storage)
 * In production, this would write to ScyllaDB for timeline entries
 */
async function fanoutToDatabase(followerIds, postId, authorId, postData) {
  // For now, we're using the Follow relationship for timeline generation
  // In production with ScyllaDB, we would insert timeline entries here

  // Example structure for timeline_entries table:
  // INSERT INTO timeline_entries (user_id, post_id, author_id, created_at, post_data)

  logger.debug('Database fan-out (using Follow table)', {
    followerCount: followerIds.length,
    postId
  });

  // TODO: When ScyllaDB is implemented, batch insert timeline entries:
  // const BATCH_SIZE = 1000;
  // for (let i = 0; i < followerIds.length; i += BATCH_SIZE) {
  //   const batch = followerIds.slice(i, i + BATCH_SIZE);
  //   await TimelineEntry.bulkCreate(
  //     batch.map(followerId => ({
  //       userId: followerId,
  //       postId,
  //       authorId,
  //       postData,
  //       createdAt: new Date()
  //     }))
  //   );
  // }
}

/**
 * Remove post from followers' timelines (when post is deleted)
 */
async function removeFanoutPost(postId, authorId) {
  try {
    logger.info('Removing fan-out post', { postId, authorId });

    const followerIds = await getFollowers(authorId);

    if (followerIds.length === 0) {
      return { success: true, followerCount: 0 };
    }

    // Remove from Redis cache
    const redis = getRedisClient();
    if (redis) {
      const BATCH_SIZE = 100;

      for (let i = 0; i < followerIds.length; i += BATCH_SIZE) {
        const batch = followerIds.slice(i, i + BATCH_SIZE);
        const pipeline = redis.pipeline();

        for (const followerId of batch) {
          const timelineKey = `timeline:${followerId}`;
          // Remove entries matching this postId
          pipeline.zremrangebyscore(timelineKey, postId, postId);
        }

        await pipeline.exec();
      }
    }

    // TODO: Remove from ScyllaDB timeline_entries when implemented

    logger.info('Fan-out post removed', {
      postId,
      authorId,
      followerCount: followerIds.length
    });

    return {
      success: true,
      followerCount: followerIds.length
    };
  } catch (error) {
    logger.error('Remove fan-out failed:', {
      postId,
      authorId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Invalidate timeline cache for specific users
 */
async function invalidateTimelineCache(userIds) {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    const pipeline = redis.pipeline();

    for (const userId of userIds) {
      pipeline.del(`timeline:${userId}`);
    }

    await pipeline.exec();

    logger.debug('Timeline cache invalidated', {
      userCount: userIds.length
    });
  } catch (error) {
    logger.error('Cache invalidation failed:', { error: error.message });
  }
}

module.exports = {
  getFollowers,
  fanoutPostToFollowers,
  removeFanoutPost,
  invalidateTimelineCache
};
