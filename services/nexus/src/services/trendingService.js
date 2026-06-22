/**
 * Trending Groups Service
 *
 * Calculates and tracks trending groups based on multiple metrics:
 * - Member growth rate
 * - Activity levels (posts, events, interactions)
 * - Engagement quality
 * - Recency bias (time-decay algorithm)
 *
 * Implements a scoring algorithm similar to Hacker News ranking.
 */

const { Group, GroupTrendingStats, GroupMembership, Event } = require('../models');
const logger = require('../utils/logger');
const redis = require('../config/redis');

// Trending algorithm constants
const GRAVITY = 1.8; // Controls time decay (higher = faster decay)
const TIME_BOOST_HOURS = 24; // Hours to apply recency boost
const ACTIVITY_WEIGHT = 0.35;
const GROWTH_WEIGHT = 0.30;
const ENGAGEMENT_WEIGHT = 0.25;
const QUALITY_WEIGHT = 0.10;

/**
 * Calculate trending score for a group
 * Uses time-decay algorithm: score = (activity + growth + engagement + quality) / (age + 2)^gravity
 *
 * @param {object} stats - GroupTrendingStats object
 * @returns {number} Trending score (0-100)
 */
function calculateTrendingScore(stats) {
  const now = Date.now();
  const ageInHours = (now - (stats.lastActivityAt || stats.createdAt)) / (1000 * 60 * 60);

  // Activity component (0-100)
  const activityScore = Math.min(100, (
    (stats.postsCount24h * 5) +
    (stats.activeMembers24h * 2) +
    (stats.eventsCount7d * 10) +
    (stats.interactionsCount24h * 0.5)
  ));

  // Growth component (0-100)
  const growthScore = Math.min(100, (
    (stats.memberGrowth24h * 10) +
    (stats.memberGrowth7d * 2) +
    (stats.growthVelocity * 20)
  ));

  // Engagement component (0-100)
  const engagementScore = Math.min(100, (
    (stats.avgEngagementRate * 200) +
    (stats.activityVelocity * 30)
  ));

  // Quality component (0-100)
  const qualityScore = (stats.qualityScore + stats.moderationScore) / 2;

  // Weighted composite score
  const compositeScore = (
    (activityScore * ACTIVITY_WEIGHT) +
    (growthScore * GROWTH_WEIGHT) +
    (engagementScore * ENGAGEMENT_WEIGHT) +
    (qualityScore * QUALITY_WEIGHT)
  );

  // Apply time decay
  const timeFactor = Math.pow(ageInHours + 2, GRAVITY);
  let trendingScore = compositeScore / timeFactor;

  // Apply recency boost for very recent activity
  if (ageInHours < TIME_BOOST_HOURS) {
    const boostFactor = 1 + ((TIME_BOOST_HOURS - ageInHours) / TIME_BOOST_HOURS) * 0.5;
    trendingScore *= boostFactor;
  }

  return Math.min(100, Math.max(0, trendingScore));
}

/**
 * Update trending stats for a specific group
 * @param {string} groupId - Group ID
 * @returns {Promise<object>} Updated GroupTrendingStats
 */
async function updateGroupTrendingStats(groupId) {
  try {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

    // Get or create stats record
    let stats = await GroupTrendingStats.findOne({ where: { groupId } });
    if (!stats) {
      stats = await GroupTrendingStats.create({ groupId });
    }

    // Calculate member metrics
    const currentMemberCount = await GroupMembership.count({
      where: { groupId, status: 'active' }
    });

    const memberGrowth24h = await GroupMembership.count({
      where: {
        groupId,
        status: 'active',
        joinedAt: { $gte: oneDayAgo }
      }
    });

    const memberGrowth7d = await GroupMembership.count({
      where: {
        groupId,
        status: 'active',
        joinedAt: { $gte: sevenDaysAgo }
      }
    });

    const memberGrowth30d = await GroupMembership.count({
      where: {
        groupId,
        status: 'active',
        joinedAt: { $gte: thirtyDaysAgo }
      }
    });

    // Calculate growth velocity (percentage change)
    const previousMemberCount = currentMemberCount - memberGrowth7d;
    const growthVelocity = previousMemberCount > 0
      ? ((memberGrowth7d / previousMemberCount) * 100)
      : 0;

    // Calculate event metrics
    const upcomingEventsCount = await Event.count({
      where: {
        groupId,
        status: 'published',
        startTime: { $gte: now }
      }
    });

    const eventsCount7d = await Event.count({
      where: {
        groupId,
        status: 'published',
        createdAt: { $gte: sevenDaysAgo }
      }
    });

    // Get last activity timestamp
    const lastEvent = await Event.findOne({
      where: { groupId },
      order: [['createdAt', 'DESC']],
      attributes: ['createdAt']
    });

    const lastActivityAt = lastEvent ? lastEvent.createdAt : stats.lastActivityAt;

    // Update stats
    await stats.update({
      memberCount: currentMemberCount,
      memberGrowth24h,
      memberGrowth7d,
      memberGrowth30d,
      growthVelocity,
      upcomingEventsCount,
      eventsCount7d,
      lastActivityAt,
      lastCalculatedAt: now
    });

    // Calculate trending score
    stats.trendingScore = calculateTrendingScore(stats);
    await stats.save();

    // Cache in Redis for fast access
    await cacheGroupTrendingScore(groupId, stats.trendingScore);

    logger.info(`Updated trending stats for group ${groupId}: score=${stats.trendingScore.toFixed(2)}`);

    return stats;
  } catch (error) {
    logger.error(`Error updating trending stats for group ${groupId}:`, error);
    throw error;
  }
}

/**
 * Update trending stats for all active groups
 * Should be run periodically (e.g., every 15 minutes)
 * @param {object} options - Options (limit, batchSize)
 * @returns {Promise<object>} Update results
 */
async function updateAllTrendingStats(options = {}) {
  try {
    const { limit = 1000, batchSize = 50 } = options;

    const groups = await Group.findAll({
      where: { isActive: true },
      attributes: ['id'],
      limit,
      order: [['updatedAt', 'DESC']]
    });

    logger.info(`Updating trending stats for ${groups.length} groups...`);

    let processed = 0;
    let errors = 0;

    // Process in batches
    for (let i = 0; i < groups.length; i += batchSize) {
      const batch = groups.slice(i, i + batchSize);

      await Promise.allSettled(
        batch.map(async (group) => {
          try {
            await updateGroupTrendingStats(group.id);
            processed++;
          } catch (error) {
            errors++;
            logger.error(`Failed to update stats for group ${group.id}:`, error.message);
          }
        })
      );
    }

    // Update global trending ranks
    await updateTrendingRanks();

    logger.info(`Trending stats update complete: ${processed} processed, ${errors} errors`);

    return {
      totalGroups: groups.length,
      processed,
      errors,
      timestamp: Date.now()
    };
  } catch (error) {
    logger.error('Error updating all trending stats:', error);
    throw error;
  }
}

/**
 * Update global and category-based trending ranks
 * @returns {Promise<void>}
 */
async function updateTrendingRanks() {
  try {
    // Update global ranks
    const globalStats = await GroupTrendingStats.findAll({
      order: [['trendingScore', 'DESC']],
      limit: 1000
    });

    for (let i = 0; i < globalStats.length; i++) {
      await globalStats[i].update({ trendingRank: i + 1 });
    }

    // Update category ranks
    const categories = await Group.findAll({
      attributes: ['category'],
      where: { category: { $ne: null } },
      group: ['category']
    });

    for (const { category } of categories) {
      const categoryStats = await GroupTrendingStats.findAll({
        include: [{
          model: Group,
          as: 'group',
          where: { category },
          attributes: []
        }],
        order: [['trendingScore', 'DESC']],
        limit: 100
      });

      for (let i = 0; i < categoryStats.length; i++) {
        await categoryStats[i].update({ categoryRank: i + 1 });
      }
    }

    logger.info('Trending ranks updated successfully');
  } catch (error) {
    logger.error('Error updating trending ranks:', error);
    throw error;
  }
}

/**
 * Get trending groups
 * @param {object} options - Filter options
 * @returns {Promise<Array>} Array of trending groups
 */
async function getTrendingGroups(options = {}) {
  try {
    const {
      category = null,
      limit = 20,
      offset = 0,
      minScore = 0,
      timeframe = 'global' // 'global', 'category'
    } = options;

    const whereClause = {
      trendingScore: { $gte: minScore }
    };

    const includeClause = [{
      model: Group,
      as: 'group',
      where: {
        isActive: true,
        ...(category ? { category } : {})
      },
      attributes: ['id', 'name', 'slug', 'description', 'category', 'tags', 'avatarUrl', 'memberCount', 'isFeatured', 'isVerified']
    }];

    const stats = await GroupTrendingStats.findAll({
      where: whereClause,
      include: includeClause,
      order: [['trendingScore', 'DESC']],
      limit,
      offset
    });

    return stats.map(stat => ({
      ...stat.group.toJSON(),
      trendingStats: {
        score: stat.trendingScore,
        rank: timeframe === 'category' ? stat.categoryRank : stat.trendingRank,
        memberGrowth24h: stat.memberGrowth24h,
        memberGrowth7d: stat.memberGrowth7d,
        activeMembers24h: stat.activeMembers24h,
        upcomingEventsCount: stat.upcomingEventsCount,
        lastActivityAt: stat.lastActivityAt
      }
    }));
  } catch (error) {
    logger.error('Error getting trending groups:', error);
    throw error;
  }
}

/**
 * Cache group trending score in Redis
 * @param {string} groupId - Group ID
 * @param {number} score - Trending score
 * @returns {Promise<void>}
 */
async function cacheGroupTrendingScore(groupId, score) {
  try {
    await redis.zadd('trending:groups:global', score, groupId);
    await redis.expire('trending:groups:global', 3600); // 1 hour TTL
  } catch (error) {
    logger.warn('Failed to cache trending score in Redis:', error.message);
  }
}

/**
 * Get trending groups from Redis cache (fast path)
 * @param {number} limit - Number of groups to return
 * @returns {Promise<Array|null>} Array of group IDs or null if cache miss
 */
async function getTrendingGroupsFromCache(limit = 20) {
  try {
    const groupIds = await redis.zrevrange('trending:groups:global', 0, limit - 1);
    return groupIds.length > 0 ? groupIds : null;
  } catch (error) {
    logger.warn('Failed to get trending groups from cache:', error.message);
    return null;
  }
}

module.exports = {
  calculateTrendingScore,
  updateGroupTrendingStats,
  updateAllTrendingStats,
  updateTrendingRanks,
  getTrendingGroups,
  getTrendingGroupsFromCache
};
