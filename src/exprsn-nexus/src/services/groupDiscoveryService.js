const { Group, GroupMembership, GroupTrendingStats, GroupCategory } = require('../models');
const logger = require('../utils/logger');
const redis = require('../config/redis');
const { Op } = require('sequelize');

/**
 * ═══════════════════════════════════════════════════════════
 * Group Discovery Service
 * Advanced group discovery with faceted search, geolocation,
 * and activity feeds
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Advanced group search with faceted filters
 * @param {object} filters - Search filters
 * @param {object} pagination - Pagination options
 * @returns {Promise<object>} Search results with facets
 */
async function advancedSearch(filters = {}, pagination = {}) {
  try {
    const {
      query,
      category,
      tags,
      location,
      nearLocation,
      radius,
      minMembers,
      maxMembers,
      activityLevel,
      governanceModel,
      visibility,
      joinMode,
      isFeatured,
      isVerified,
      hasUpcomingEvents,
      membershipStatus
    } = filters;

    const {
      page = 1,
      limit = 20,
      sortBy = 'relevance',
      sortOrder = 'DESC'
    } = pagination;

    // Build where clause
    const where = {
      isActive: true
    };

    // Text search (name or description)
    if (query) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${query}%` } },
        { description: { [Op.iLike]: `%${query}%` } }
      ];
    }

    // Category filter
    if (category) {
      where.category = category;
    }

    // Tags filter (contains any of the tags)
    if (tags && tags.length > 0) {
      where.tags = { [Op.overlap]: tags };
    }

    // Member count range
    if (minMembers !== undefined) {
      where.memberCount = { ...where.memberCount, [Op.gte]: minMembers };
    }
    if (maxMembers !== undefined) {
      where.memberCount = { ...where.memberCount, [Op.lte]: maxMembers };
    }

    // Governance model filter
    if (governanceModel) {
      where.governanceModel = governanceModel;
    }

    // Visibility filter
    if (visibility) {
      where.visibility = visibility;
    } else {
      // Default: exclude private groups for discovery
      where.visibility = { [Op.in]: ['public', 'unlisted'] };
    }

    // Join mode filter
    if (joinMode) {
      where.joinMode = joinMode;
    }

    // Featured/verified filters
    if (isFeatured !== undefined) {
      where.isFeatured = isFeatured;
    }
    if (isVerified !== undefined) {
      where.isVerified = isVerified;
    }

    // Location-based search
    if (location) {
      where.location = { [Op.iLike]: `%${location}%` };
    }

    // Calculate offset
    const offset = (page - 1) * limit;

    // Determine sort order
    let order;
    switch (sortBy) {
      case 'relevance':
        // For text search, sort by name match first, then member count
        order = query
          ? [['memberCount', 'DESC'], ['createdAt', 'DESC']]
          : [['memberCount', 'DESC']];
        break;
      case 'members':
        order = [['memberCount', sortOrder]];
        break;
      case 'created':
        order = [['createdAt', sortOrder]];
        break;
      case 'name':
        order = [['name', sortOrder]];
        break;
      case 'activity':
        // Join with trending stats for activity sorting
        order = [[{ model: GroupTrendingStats, as: 'trendingStats' }, 'activityScore', sortOrder]];
        break;
      default:
        order = [['createdAt', 'DESC']];
    }

    // Execute query
    const { count, rows: groups } = await Group.findAndCountAll({
      where,
      include: [{
        model: GroupTrendingStats,
        as: 'trendingStats',
        required: false
      }],
      limit,
      offset,
      order,
      distinct: true
    });

    // Calculate facets (aggregated filter counts)
    const facets = await calculateFacets(filters);

    return {
      groups,
      facets,
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit)
      },
      filters: filters
    };
  } catch (error) {
    logger.error('Error in advanced group search:', error);
    throw error;
  }
}

/**
 * Find groups near a location using geolocation
 * @param {number} latitude - Latitude
 * @param {number} longitude - Longitude
 * @param {number} radiusKm - Search radius in kilometers
 * @param {object} options - Additional options
 * @returns {Promise<Array>} Nearby groups
 */
async function findGroupsNearLocation(latitude, longitude, radiusKm = 50, options = {}) {
  try {
    const { limit = 20, offset = 0 } = options;

    // For now, this is a placeholder implementation
    // In production, you would:
    // 1. Add lat/lng columns to groups table
    // 2. Use PostGIS extension for spatial queries
    // 3. Calculate distance using Haversine formula

    // Temporary text-based location search
    const cacheKey = `groups:near:${latitude}:${longitude}:${radiusKm}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // For demonstration, return groups with location set
    const groups = await Group.findAll({
      where: {
        isActive: true,
        visibility: { [Op.in]: ['public', 'unlisted'] },
        location: { [Op.not]: null }
      },
      include: [{
        model: GroupTrendingStats,
        as: 'trendingStats',
        required: false
      }],
      limit,
      offset,
      order: [['memberCount', 'DESC']]
    });

    // Cache for 1 hour
    await redis.setex(cacheKey, 3600, JSON.stringify(groups));

    logger.info(`Found ${groups.length} groups near (${latitude}, ${longitude})`);

    return groups;
  } catch (error) {
    logger.error('Error finding groups near location:', error);
    throw error;
  }
}

/**
 * Get "What's Happening" activity feed across groups
 * @param {object} filters - Filters (categories, time range)
 * @param {number} limit - Number of items
 * @returns {Promise<Array>} Activity feed items
 */
async function getActivityFeed(filters = {}, limit = 50) {
  try {
    const { categories, startTime, endTime } = filters;

    const where = {
      isActive: true,
      visibility: 'public'
    };

    if (categories && categories.length > 0) {
      where.category = { [Op.in]: categories };
    }

    // Get recently active groups
    const groups = await Group.findAll({
      where,
      include: [{
        model: GroupTrendingStats,
        as: 'trendingStats',
        required: false
      }],
      order: [['updatedAt', 'DESC']],
      limit
    });

    // Transform to activity feed format
    const activityFeed = groups.map(group => ({
      type: 'group-update',
      groupId: group.id,
      groupName: group.name,
      groupCategory: group.category,
      groupAvatarUrl: group.avatarUrl,
      timestamp: group.updatedAt,
      activity: {
        newMembers: group.trendingStats?.newMembers24h || 0,
        activeMembers: group.trendingStats?.activeMembers24h || 0,
        upcomingEvents: 0 // Would query from events table
      }
    }));

    logger.info(`Generated activity feed with ${activityFeed.length} items`);

    return activityFeed;
  } catch (error) {
    logger.error('Error generating activity feed:', error);
    throw error;
  }
}

/**
 * Get topic/interest graph showing related groups
 * @param {string} groupId - Source group ID
 * @param {number} depth - Graph depth (1-3)
 * @returns {Promise<object>} Topic graph
 */
async function getTopicGraph(groupId, depth = 2) {
  try {
    const cacheKey = `group:${groupId}:topic-graph:${depth}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const sourceGroup = await Group.findByPk(groupId);
    if (!sourceGroup) {
      throw new Error('GROUP_NOT_FOUND');
    }

    // Find related groups based on category and tags
    const relatedGroups = await Group.findAll({
      where: {
        id: { [Op.ne]: groupId },
        isActive: true,
        visibility: { [Op.in]: ['public', 'unlisted'] },
        [Op.or]: [
          { category: sourceGroup.category },
          { tags: { [Op.overlap]: sourceGroup.tags || [] } }
        ]
      },
      limit: 20,
      order: [['memberCount', 'DESC']]
    });

    // Calculate relationship strength
    const graph = {
      center: {
        id: sourceGroup.id,
        name: sourceGroup.name,
        category: sourceGroup.category,
        tags: sourceGroup.tags
      },
      related: relatedGroups.map(group => {
        const categoryMatch = group.category === sourceGroup.category;
        const tagOverlap = (sourceGroup.tags || []).filter(tag =>
          (group.tags || []).includes(tag)
        );

        const strength = (categoryMatch ? 0.5 : 0) +
                        (tagOverlap.length * 0.1);

        return {
          id: group.id,
          name: group.name,
          category: group.category,
          tags: group.tags,
          memberCount: group.memberCount,
          relationshipStrength: Math.min(strength, 1.0),
          commonTags: tagOverlap
        };
      }).sort((a, b) => b.relationshipStrength - a.relationshipStrength)
    };

    // Cache for 1 hour
    await redis.setex(cacheKey, 3600, JSON.stringify(graph));

    logger.info(`Generated topic graph for group ${groupId} with ${graph.related.length} related groups`);

    return graph;
  } catch (error) {
    logger.error('Error generating topic graph:', error);
    throw error;
  }
}

/**
 * Calculate facets (aggregated filter counts) for search results
 * @param {object} currentFilters - Current active filters
 * @returns {Promise<object>} Facet counts
 */
async function calculateFacets(currentFilters = {}) {
  try {
    // Base where clause (active, non-private groups)
    const baseWhere = {
      isActive: true,
      visibility: { [Op.in]: ['public', 'unlisted'] }
    };

    // Add current filters (except the one we're faceting)
    const { category, ...otherFilters } = currentFilters;

    // Get category counts
    const categoryFacets = await Group.findAll({
      where: baseWhere,
      attributes: [
        'category',
        [Group.sequelize.fn('COUNT', '*'), 'count']
      ],
      group: ['category'],
      raw: true
    });

    // Get governance model counts
    const governanceFacets = await Group.findAll({
      where: baseWhere,
      attributes: [
        'governanceModel',
        [Group.sequelize.fn('COUNT', '*'), 'count']
      ],
      group: ['governanceModel'],
      raw: true
    });

    // Get member count ranges
    const memberRangeFacets = [
      { label: '1-10', min: 1, max: 10, count: 0 },
      { label: '11-50', min: 11, max: 50, count: 0 },
      { label: '51-100', min: 51, max: 100, count: 0 },
      { label: '101-500', min: 101, max: 500, count: 0 },
      { label: '500+', min: 501, max: null, count: 0 }
    ];

    for (const range of memberRangeFacets) {
      const rangeWhere = { ...baseWhere, memberCount: { [Op.gte]: range.min } };
      if (range.max) {
        rangeWhere.memberCount[Op.lte] = range.max;
      }

      range.count = await Group.count({ where: rangeWhere });
    }

    return {
      categories: categoryFacets.reduce((acc, item) => {
        acc[item.category || 'uncategorized'] = parseInt(item.count);
        return acc;
      }, {}),
      governanceModels: governanceFacets.reduce((acc, item) => {
        acc[item.governanceModel] = parseInt(item.count);
        return acc;
      }, {}),
      memberRanges: memberRangeFacets,
      featured: await Group.count({ where: { ...baseWhere, isFeatured: true } }),
      verified: await Group.count({ where: { ...baseWhere, isVerified: true } })
    };
  } catch (error) {
    logger.error('Error calculating facets:', error);
    return {};
  }
}

/**
 * Get popular search queries
 * @param {number} limit - Number of queries to return
 * @returns {Promise<Array>} Popular queries
 */
async function getPopularSearchQueries(limit = 10) {
  try {
    // Get from Redis sorted set (would be populated by tracking searches)
    const queries = await redis.zrevrange('group:search:popular', 0, limit - 1, 'WITHSCORES');

    const result = [];
    for (let i = 0; i < queries.length; i += 2) {
      result.push({
        query: queries[i],
        count: parseInt(queries[i + 1])
      });
    }

    return result;
  } catch (error) {
    logger.error('Error getting popular search queries:', error);
    return [];
  }
}

/**
 * Track a search query
 * @param {string} query - Search query
 */
async function trackSearchQuery(query) {
  try {
    if (!query || query.length < 2) return;

    // Increment count in Redis sorted set
    await redis.zincrby('group:search:popular', 1, query.toLowerCase());

    logger.debug(`Tracked search query: ${query}`);
  } catch (error) {
    logger.error('Error tracking search query:', error);
  }
}

module.exports = {
  advancedSearch,
  findGroupsNearLocation,
  getActivityFeed,
  getTopicGraph,
  calculateFacets,
  getPopularSearchQueries,
  trackSearchQuery
};
