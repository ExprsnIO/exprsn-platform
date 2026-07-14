/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Timeline - Feed Service
 * ═══════════════════════════════════════════════════════════════════════
 */

const { Post, Follow, Like, Repost } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
// FEAT-011 block/mute enforcement. Intra-module require (both live in timeline);
// relationshipService depends only on models, so there is no require cycle.
const relationshipService = require('./relationshipService');

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

    // FEAT-011 R1: suppress authors the viewer has blocked (or who blocked the
    // viewer) and authors the viewer muted (unexpired). ONE set-returning query
    // per request — never a per-post pairwise check. Empty set = no filter, so
    // there is no cost/regression when the viewer has no relationships.
    const suppressed = (await relationshipService.getSuppressedIds(userId)) || [];

    const userIdClause = { [Op.in]: userIds };
    if (suppressed.length) {
      userIdClause[Op.notIn] = suppressed;
    }

    // Build where clause combining base conditions with cursor conditions
    const whereClause = {
      userId: userIdClause,
      deleted: false,
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
async function getUserTimeline(userId, { limit = 20, offset = 0, where = {}, viewerId = null } = {}) {
  try {
    // FEAT-011 R2: a profile is empty to a viewer who is blocked either way.
    // Block only — a one-way mute does not hide a directly-visited profile
    // (mute suppresses feed surfacing, not direct navigation).
    if (viewerId && viewerId !== userId
        && await relationshipService.isBlockedEitherWay(viewerId, userId)) {
      return [];
    }

    const whereClause = {
      userId,
      deleted: false,
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
async function getExploreFeed({ limit = 20, offset = 0, viewerId = null } = {}) {
  try {
    // FEAT-011 R3: suppress blocked/muted authors (one query per request).
    const suppressed = viewerId ? ((await relationshipService.getSuppressedIds(viewerId)) || []) : [];
    const where = {
      deleted: false,
      visibility: 'public',
      createdAt: {
        [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
      }
    };
    if (suppressed.length) {
      where.userId = { [Op.notIn]: suppressed };
    }

    // Get recent popular posts
    const posts = await Post.findAll({
      where,
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
async function getTrendingPosts({ limit = 20, offset = 0, viewerId = null } = {}) {
  try {
    // FEAT-011 R4: suppress blocked/muted authors (one query per request).
    const suppressed = viewerId ? ((await relationshipService.getSuppressedIds(viewerId)) || []) : [];
    const where = {
      deleted: false,
      visibility: 'public',
      createdAt: {
        [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
      }
    };
    if (suppressed.length) {
      where.userId = { [Op.notIn]: suppressed };
    }

    const posts = await Post.findAll({
      where,
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
async function getPostThread(postId, { viewerId = null } = {}) {
  try {
    const rootPost = await Post.findByPk(postId);

    if (!rootPost) {
      throw new Error('Post not found');
    }

    // FEAT-011 R5: suppress replies from blocked/muted authors (one query).
    const suppressed = viewerId ? ((await relationshipService.getSuppressedIds(viewerId)) || []) : [];
    const replyWhere = {
      'metadata.replyTo': postId,
      deleted: false
    };
    if (suppressed.length) {
      replyWhere.userId = { [Op.notIn]: suppressed };
    }

    // Get all replies
    const replies = await Post.findAll({
      where: replyWhere,
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
