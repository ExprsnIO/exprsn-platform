/**
 * Group Recommendation Service
 *
 * Generates personalized group recommendations for users based on:
 * - User interests (tags, categories from their current groups)
 * - Similar groups to ones they're already in
 * - Trending groups in relevant categories
 * - Social connections (friends in groups)
 * - Activity patterns and engagement levels
 *
 * Implements collaborative filtering and content-based recommendation algorithms.
 */

const { Group, GroupMembership, GroupRecommendation, GroupTrendingStats } = require('../models');
const logger = require('../utils/logger');
const redis = require('../config/redis');

// Recommendation scoring weights
const CATEGORY_MATCH_WEIGHT = 0.25;
const TAGS_MATCH_WEIGHT = 0.20;
const SIMILAR_GROUPS_WEIGHT = 0.20;
const TRENDING_WEIGHT = 0.15;
const SOCIAL_WEIGHT = 0.15;
const ACTIVITY_WEIGHT = 0.05;

/**
 * Generate recommendations for a user
 * @param {string} userId - User ID
 * @param {object} options - Generation options
 * @returns {Promise<Array>} Array of recommended groups
 */
async function generateRecommendations(userId, options = {}) {
  try {
    const {
      limit = 20,
      refreshExisting = false,
      minScore = 10
    } = options;

    logger.info(`Generating recommendations for user ${userId}...`);

    // Get user's current groups
    const userMemberships = await GroupMembership.findAll({
      where: { userId, status: 'active' },
      include: [{
        model: Group,
        as: 'group',
        attributes: ['id', 'category', 'tags']
      }]
    });

    const userGroupIds = userMemberships.map(m => m.groupId);
    const userCategories = [...new Set(userMemberships.map(m => m.group.category).filter(Boolean))];
    const userTags = [...new Set(userMemberships.flatMap(m => m.group.tags || []))];

    // Get candidate groups (not already joined)
    const candidateGroups = await Group.findAll({
      where: {
        id: { $notIn: userGroupIds },
        isActive: true
      },
      include: [{
        model: GroupTrendingStats,
        as: 'trendingStats',
        required: false
      }],
      limit: 500 // Sample size for recommendation
    });

    logger.info(`Found ${candidateGroups.length} candidate groups`);

    // Score each candidate group
    const scoredRecommendations = [];

    for (const group of candidateGroups) {
      const scores = await calculateRecommendationScore(
        userId,
        group,
        userCategories,
        userTags,
        userGroupIds
      );

      if (scores.total >= minScore) {
        scoredRecommendations.push({
          userId,
          groupId: group.id,
          score: scores.total,
          categoryMatchScore: scores.categoryMatch,
          tagsMatchScore: scores.tagsMatch,
          similarGroupsScore: scores.similarGroups,
          trendingScore: scores.trending,
          socialScore: scores.social,
          activityScore: scores.activity,
          reasons: scores.reasons,
          reasonsText: scores.reasonsText
        });
      }
    }

    // Sort by score
    scoredRecommendations.sort((a, b) => b.score - a.score);

    // Take top N
    const topRecommendations = scoredRecommendations.slice(0, limit);

    // Save to database
    const saved = [];
    for (let i = 0; i < topRecommendations.length; i++) {
      const rec = topRecommendations[i];
      rec.rank = i + 1;
      rec.expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days

      const [recommendation] = await GroupRecommendation.upsert(rec, {
        returning: true
      });

      saved.push(recommendation);
    }

    logger.info(`Generated ${saved.length} recommendations for user ${userId}`);

    return saved;
  } catch (error) {
    logger.error(`Error generating recommendations for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Calculate recommendation score for a group
 * @param {string} userId - User ID
 * @param {object} group - Group object
 * @param {Array} userCategories - User's current categories
 * @param {Array} userTags - User's current tags
 * @param {Array} userGroupIds - User's current group IDs
 * @returns {Promise<object>} Score breakdown
 */
async function calculateRecommendationScore(userId, group, userCategories, userTags, userGroupIds) {
  const scores = {
    categoryMatch: 0,
    tagsMatch: 0,
    similarGroups: 0,
    trending: 0,
    social: 0,
    activity: 0,
    total: 0,
    reasons: [],
    reasonsText: {}
  };

  // 1. Category match score
  if (group.category && userCategories.includes(group.category)) {
    scores.categoryMatch = 100;
    scores.reasons.push('matching-category');
    scores.reasonsText.matchingCategory = `Matches your interest in ${group.category}`;
  }

  // 2. Tags match score
  const groupTags = group.tags || [];
  const matchingTags = groupTags.filter(tag => userTags.includes(tag));
  if (matchingTags.length > 0) {
    scores.tagsMatch = Math.min(100, (matchingTags.length / groupTags.length) * 100);
    scores.reasons.push('matching-tags');
    scores.reasonsText.matchingTags = `Shares interests: ${matchingTags.slice(0, 3).join(', ')}`;
  }

  // 3. Similar groups score (based on category/tag overlap with user's groups)
  const similarityScore = await calculateGroupSimilarity(group.id, userGroupIds);
  scores.similarGroups = similarityScore;
  if (similarityScore > 50) {
    scores.reasons.push('similar-groups');
    scores.reasonsText.similarGroups = 'Similar to groups you\'re in';
  }

  // 4. Trending score
  if (group.trendingStats) {
    scores.trending = Math.min(100, group.trendingStats.trendingScore);
    if (group.trendingStats.trendingScore > 50) {
      scores.reasons.push('trending');
      scores.reasonsText.trending = `Trending #${group.trendingStats.trendingRank || ''}`;
    }
  }

  // 5. Social score (friends/connections in group)
  // This would integrate with a social graph service
  // For now, placeholder
  scores.social = 0;

  // 6. Activity score
  const activityScore = group.trendingStats
    ? Math.min(100, (group.trendingStats.activeMembers24h / group.memberCount) * 100)
    : 0;
  scores.activity = activityScore;
  if (activityScore > 30) {
    scores.reasons.push('active-community');
    scores.reasonsText.activeCommunity = 'Highly active community';
  }

  // Calculate weighted total score
  scores.total = (
    (scores.categoryMatch * CATEGORY_MATCH_WEIGHT) +
    (scores.tagsMatch * TAGS_MATCH_WEIGHT) +
    (scores.similarGroups * SIMILAR_GROUPS_WEIGHT) +
    (scores.trending * TRENDING_WEIGHT) +
    (scores.social * SOCIAL_WEIGHT) +
    (scores.activity * ACTIVITY_WEIGHT)
  );

  return scores;
}

/**
 * Calculate similarity between a candidate group and user's groups
 * @param {string} candidateGroupId - Candidate group ID
 * @param {Array} userGroupIds - User's group IDs
 * @returns {Promise<number>} Similarity score (0-100)
 */
async function calculateGroupSimilarity(candidateGroupId, userGroupIds) {
  try {
    const candidateGroup = await Group.findByPk(candidateGroupId, {
      attributes: ['category', 'tags']
    });

    if (!candidateGroup) return 0;

    const userGroups = await Group.findAll({
      where: { id: userGroupIds },
      attributes: ['category', 'tags']
    });

    let totalSimilarity = 0;
    let count = 0;

    for (const userGroup of userGroups) {
      let similarity = 0;

      // Category similarity
      if (candidateGroup.category && candidateGroup.category === userGroup.category) {
        similarity += 50;
      }

      // Tag similarity (Jaccard similarity)
      const candidateTags = new Set(candidateGroup.tags || []);
      const userGroupTags = new Set(userGroup.tags || []);
      const intersection = new Set([...candidateTags].filter(x => userGroupTags.has(x)));
      const union = new Set([...candidateTags, ...userGroupTags]);

      if (union.size > 0) {
        const jaccardSimilarity = (intersection.size / union.size) * 50;
        similarity += jaccardSimilarity;
      }

      totalSimilarity += similarity;
      count++;
    }

    return count > 0 ? totalSimilarity / count : 0;
  } catch (error) {
    logger.warn(`Error calculating group similarity for ${candidateGroupId}:`, error.message);
    return 0;
  }
}

/**
 * Get recommendations for a user
 * @param {string} userId - User ID
 * @param {object} options - Options (limit, refresh)
 * @returns {Promise<Array>} Array of recommendations with group data
 */
async function getRecommendations(userId, options = {}) {
  try {
    const {
      limit = 20,
      refresh = false,
      excludeDismissed = true
    } = options;

    // Check if we need to refresh recommendations
    const existingCount = await GroupRecommendation.count({
      where: {
        userId,
        wasDismissed: false,
        expiresAt: { $gt: Date.now() }
      }
    });

    if (refresh || existingCount < limit) {
      await generateRecommendations(userId, { limit: limit * 2 });
    }

    // Fetch recommendations with group data
    const whereClause = {
      userId,
      ...(excludeDismissed ? { wasDismissed: false } : {}),
      expiresAt: { $gt: Date.now() }
    };

    const recommendations = await GroupRecommendation.findAll({
      where: whereClause,
      include: [{
        model: Group,
        as: 'group',
        where: { isActive: true },
        attributes: ['id', 'name', 'slug', 'description', 'category', 'tags', 'avatarUrl', 'bannerUrl', 'memberCount', 'isFeatured', 'isVerified']
      }],
      order: [['score', 'DESC'], ['rank', 'ASC']],
      limit
    });

    return recommendations.map(rec => ({
      ...rec.group.toJSON(),
      recommendation: {
        score: rec.score,
        rank: rec.rank,
        reasons: rec.reasons,
        reasonsText: rec.reasonsText,
        recommendationId: rec.id
      }
    }));
  } catch (error) {
    logger.error(`Error getting recommendations for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Track recommendation interaction
 * @param {string} recommendationId - Recommendation ID
 * @param {string} action - Action type (shown, clicked, joined, dismissed)
 * @param {object} metadata - Additional metadata
 * @returns {Promise<object>} Updated recommendation
 */
async function trackRecommendationInteraction(recommendationId, action, metadata = {}) {
  try {
    const recommendation = await GroupRecommendation.findByPk(recommendationId);
    if (!recommendation) {
      throw new Error('RECOMMENDATION_NOT_FOUND');
    }

    const now = Date.now();
    const updates = {};

    switch (action) {
      case 'shown':
        updates.wasShown = true;
        updates.shownAt = now;
        break;
      case 'clicked':
        updates.wasClicked = true;
        updates.clickedAt = now;
        break;
      case 'joined':
        updates.wasJoined = true;
        updates.joinedAt = now;
        break;
      case 'dismissed':
        updates.wasDismissed = true;
        updates.dismissedAt = now;
        updates.dismissReason = metadata.reason || 'not-interested';
        break;
    }

    await recommendation.update(updates);

    logger.info(`Tracked recommendation interaction: ${action} for recommendation ${recommendationId}`);

    return recommendation;
  } catch (error) {
    logger.error(`Error tracking recommendation interaction:`, error);
    throw error;
  }
}

/**
 * Get recommendation analytics for a user
 * @param {string} userId - User ID
 * @returns {Promise<object>} Analytics data
 */
async function getRecommendationAnalytics(userId) {
  try {
    const total = await GroupRecommendation.count({ where: { userId } });
    const shown = await GroupRecommendation.count({ where: { userId, wasShown: true } });
    const clicked = await GroupRecommendation.count({ where: { userId, wasClicked: true } });
    const joined = await GroupRecommendation.count({ where: { userId, wasJoined: true } });
    const dismissed = await GroupRecommendation.count({ where: { userId, wasDismissed: true } });

    const clickThroughRate = shown > 0 ? (clicked / shown) * 100 : 0;
    const conversionRate = shown > 0 ? (joined / shown) * 100 : 0;

    return {
      total,
      shown,
      clicked,
      joined,
      dismissed,
      clickThroughRate,
      conversionRate
    };
  } catch (error) {
    logger.error(`Error getting recommendation analytics for user ${userId}:`, error);
    throw error;
  }
}

module.exports = {
  generateRecommendations,
  getRecommendations,
  trackRecommendationInteraction,
  getRecommendationAnalytics
};
