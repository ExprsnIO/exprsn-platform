/**
 * ═══════════════════════════════════════════════════════════
 * Trending Service
 * Process hashtags and calculate trending topics
 * ═══════════════════════════════════════════════════════════
 */

const { Trending, Post } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const { getRedisClient } = require('@exprsn/shared');

/**
 * Process hashtags from a post
 */
async function processHashtags(postId, hashtags, postData) {
  if (!hashtags || hashtags.length === 0) {
    return { success: true, processed: 0 };
  }

  try {
    logger.debug('Processing hashtags', { postId, count: hashtags.length });

    // Extract unique hashtags
    const uniqueTags = [...new Set(hashtags.map(h => h.tag.toLowerCase()))];

    // Update trending records
    for (const tag of uniqueTags) {
      await updateTrendingHashtag(tag, postData);
    }

    // Update Redis trending cache
    await updateRedisTrending(uniqueTags);

    logger.info('Hashtags processed', {
      postId,
      hashtags: uniqueTags.length
    });

    return {
      success: true,
      processed: uniqueTags.length
    };
  } catch (error) {
    logger.error('Hashtag processing failed:', {
      postId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Update trending hashtag in database
 */
async function updateTrendingHashtag(tag, postData) {
  const now = new Date();
  const hourAgo = new Date(now - 60 * 60 * 1000);

  try {
    // Find or create trending record for this hour
    const [trending, created] = await Trending.findOrCreate({
      where: {
        topic: `#${tag}`,
        type: 'hashtag',
        createdAt: {
          [Op.gte]: hourAgo
        }
      },
      defaults: {
        topic: `#${tag}`,
        type: 'hashtag',
        score: 1,
        metadata: {
          postCount: 1,
          lastPostAt: now,
          samplePostIds: [postData.postId]
        }
      }
    });

    if (!created) {
      // Update existing trending record
      const metadata = trending.metadata || {};
      const samplePostIds = metadata.samplePostIds || [];

      // Add post ID to sample (keep last 10)
      if (!samplePostIds.includes(postData.postId)) {
        samplePostIds.push(postData.postId);
        if (samplePostIds.length > 10) {
          samplePostIds.shift();
        }
      }

      await trending.update({
        score: trending.score + 1,
        metadata: {
          ...metadata,
          postCount: (metadata.postCount || 0) + 1,
          lastPostAt: now,
          samplePostIds
        }
      });
    }

    return trending;
  } catch (error) {
    logger.error('Failed to update trending hashtag:', {
      tag,
      error: error.message
    });
    throw error;
  }
}

/**
 * Update Redis trending cache
 */
async function updateRedisTrending(tags) {
  const redis = getRedisClient();
  if (!redis) return;

  const TRENDING_KEY = 'trending:hashtags';
  const TRENDING_TTL = 3600; // 1 hour

  try {
    const pipeline = redis.pipeline();

    for (const tag of tags) {
      // Increment score in sorted set
      pipeline.zincrby(TRENDING_KEY, 1, tag);
    }

    // Set expiry
    pipeline.expire(TRENDING_KEY, TRENDING_TTL);

    await pipeline.exec();

    logger.debug('Redis trending updated', { tags: tags.length });
  } catch (error) {
    logger.error('Redis trending update failed:', { error: error.message });
    // Don't throw - Redis is cache only
  }
}

/**
 * Get trending hashtags from cache or database
 */
async function getTrendingHashtags(limit = 20) {
  const redis = getRedisClient();

  // Try Redis cache first
  if (redis) {
    try {
      const trending = await redis.zrevrange(
        'trending:hashtags',
        0,
        limit - 1,
        'WITHSCORES'
      );

      if (trending && trending.length > 0) {
        const results = [];
        for (let i = 0; i < trending.length; i += 2) {
          results.push({
            tag: trending[i],
            score: parseInt(trending[i + 1])
          });
        }
        return results;
      }
    } catch (error) {
      logger.error('Redis trending fetch failed:', { error: error.message });
    }
  }

  // Fallback to database
  const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const trending = await Trending.findAll({
    where: {
      type: 'hashtag',
      createdAt: {
        [Op.gte]: last24Hours
      }
    },
    order: [['score', 'DESC']],
    limit
  });

  return trending.map(t => ({
    tag: t.topic,
    score: t.score,
    postCount: t.metadata?.postCount || 0
  }));
}

/**
 * Calculate trending score for posts
 * Used for trending posts (not hashtags)
 */
function calculateTrendingScore(post) {
  const ageHours = (Date.now() - new Date(post.createdAt)) / (1000 * 60 * 60);

  // Gravity factor - older posts decay faster
  const gravity = 1.8;
  const ageDecay = Math.pow(ageHours + 2, gravity);

  // Engagement score
  const likes = post.likeCount || 0;
  const reposts = post.repostCount || 0;
  const comments = post.commentCount || 0;

  // Weighted engagement
  const engagementScore = likes + (reposts * 2) + (comments * 1.5);

  // Final score
  const score = engagementScore / ageDecay;

  return Math.round(score * 100) / 100;
}

/**
 * Update trending posts
 * Should be run periodically to refresh trending posts
 */
async function updateTrendingPosts() {
  try {
    logger.info('Updating trending posts');

    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Get recent posts with engagement
    const posts = await Post.findAll({
      where: {
        createdAt: {
          [Op.gte]: last24Hours
        },
        deleted: false,
        visibility: 'public',
        [Op.or]: [
          { likeCount: { [Op.gt]: 5 } },
          { repostCount: { [Op.gt]: 2 } },
          { commentCount: { [Op.gt]: 3 } }
        ]
      },
      limit: 1000
    });

    // Calculate scores
    const scored = posts.map(post => ({
      post,
      score: calculateTrendingScore(post)
    }));

    // Sort by score
    scored.sort((a, b) => b.score - a.score);

    // Take top posts
    const topPosts = scored.slice(0, 100);

    // Update or create trending records
    for (const { post, score } of topPosts) {
      await Trending.upsert({
        topic: `post:${post.id}`,
        type: 'post',
        score,
        metadata: {
          postId: post.id,
          authorId: post.userId,
          likes: post.likeCount,
          reposts: post.repostCount,
          comments: post.commentCount
        }
      });
    }

    logger.info('Trending posts updated', { count: topPosts.length });

    return {
      success: true,
      processed: topPosts.length
    };
  } catch (error) {
    logger.error('Trending posts update failed:', { error: error.message });
    throw error;
  }
}

/**
 * Clean old trending records
 */
async function cleanOldTrending() {
  const threshold = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours

  try {
    const deleted = await Trending.destroy({
      where: {
        createdAt: {
          [Op.lt]: threshold
        }
      }
    });

    logger.info('Old trending records cleaned', { deleted });

    return { success: true, deleted };
  } catch (error) {
    logger.error('Trending cleanup failed:', { error: error.message });
    throw error;
  }
}

module.exports = {
  processHashtags,
  getTrendingHashtags,
  calculateTrendingScore,
  updateTrendingPosts,
  cleanOldTrending
};
