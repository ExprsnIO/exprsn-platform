/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Timeline - Feed Service
 * ═══════════════════════════════════════════════════════════════════════
 */

const { Post, Follow, Like, Repost } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * Calculate post score for ranking
 */
function calculatePostScore(post, viewer = {}) {
  let score = 0;

  // Recency (decay over time)
  const ageHours = (Date.now() - new Date(post.createdAt)) / (1000 * 60 * 60);
  score += Math.max(0, 100 - ageHours * 2);

  // Engagement
  score += (post.likeCount || 0) * 2;
  score += (post.repostCount || 0) * 3;
  score += (post.commentCount || 0) * 1.5;

  // Relationship strength
  if (viewer.following && viewer.following.includes(post.userId)) {
    score *= 1.5;
  }

  // Content quality signals
  if (post.media && post.media.length > 0) {
    score *= 1.2;
  }

  return score;
}

/**
 * Get home feed for user
 * Supports both cursor-based and offset-based pagination
 */
async function getHomeFeed(userId, { limit = 20, offset = 0, where = {} } = {}) {
  try {
    // Get users that the current user follows
    const follows = await Follow.findAll({
      where: { followerId: userId },
      attributes: ['followingId']
    });

    const followingIds = follows.map(f => f.followingId);

    // Include user's own posts
    const userIds = [userId, ...followingIds];

    // Build where clause combining base conditions with cursor conditions
    const whereClause = {
      userId: { [Op.in]: userIds },
      deleted: false,
      status: 'published',
      visibility: { [Op.in]: ['public', 'followers'] },
      ...where // Merge cursor where clause
    };

    // Fetch posts from followed users + own posts
    const posts = await Post.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: limit * 3, // Fetch more for ranking
      offset: offset || 0
    });

    // Rank posts
    const rankedPosts = posts
      .map(post => ({
        ...post.toJSON(),
        score: calculatePostScore(post, { following: followingIds })
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return rankedPosts;
  } catch (error) {
    logger.error('Error fetching home feed:', error);
    throw error;
  }
}

/**
 * Get user timeline
 * Supports both cursor-based and offset-based pagination
 */
async function getUserTimeline(userId, { limit = 20, offset = 0, where = {} } = {}) {
  try {
    const whereClause = {
      userId,
      deleted: false,
      status: 'published',
      ...where // Merge cursor where clause
    };

    const posts = await Post.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit,
      offset: offset || 0
    });

    return posts;
  } catch (error) {
    logger.error('Error fetching user timeline:', error);
    throw error;
  }
}

/**
 * Get explore/discovery feed
 */
async function getExploreFeed({ limit = 20, offset = 0 } = {}) {
  try {
    // Get recent popular posts
    const posts = await Post.findAll({
      where: {
        deleted: false,
        visibility: 'public',
        createdAt: {
          [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        }
      },
      order: [
        ['likeCount', 'DESC'],
        ['repostCount', 'DESC'],
        ['createdAt', 'DESC']
      ],
      limit,
      offset
    });

    return posts;
  } catch (error) {
    logger.error('Error fetching explore feed:', error);
    throw error;
  }
}

/**
 * Get trending posts
 */
async function getTrendingPosts({ limit = 20, offset = 0 } = {}) {
  try {
    const posts = await Post.findAll({
      where: {
        deleted: false,
        visibility: 'public',
        createdAt: {
          [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      order: [
        ['likeCount', 'DESC'],
        ['repostCount', 'DESC']
      ],
      limit,
      offset
    });

    return posts;
  } catch (error) {
    logger.error('Error fetching trending posts:', error);
    throw error;
  }
}

/**
 * Get post thread (conversation)
 */
async function getPostThread(postId) {
  try {
    const rootPost = await Post.findByPk(postId);

    if (!rootPost) {
      throw new Error('Post not found');
    }

    // Get all replies
    const replies = await Post.findAll({
      where: {
        'metadata.replyTo': postId,
        deleted: false
      },
      order: [['createdAt', 'ASC']]
    });

    return {
      rootPost,
      replies
    };
  } catch (error) {
    logger.error('Error fetching post thread:', error);
    throw error;
  }
}

module.exports = {
  getHomeFeed,
  getUserTimeline,
  getExploreFeed,
  getTrendingPosts,
  getPostThread,
  calculatePostScore
};
