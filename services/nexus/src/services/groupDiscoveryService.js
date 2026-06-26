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

// Mean Earth radius (km) and degrees→km at the equator for bounding boxes.
const EARTH_RADIUS_KM = 6371;
const KM_PER_DEGREE_LAT = 111.045;
// Most callers won't scan more than this many candidates; the box keeps it small
// in practice, but cap so a sparse/huge-radius query can't pull the whole table.
const MAX_NEARBY_CANDIDATES = 500;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance between two points in kilometers (Haversine).
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Build the lat/lng bounding-box WHERE clause for a radius around a point.
 * Returns a Sequelize where fragment that an index on (latitude, longitude)
 * can serve. Handles antimeridian (±180°) wrap and near-pole degeneracy.
 */
function boundingBoxWhere(latitude, longitude, radiusKm) {
  const latDelta = radiusKm / KM_PER_DEGREE_LAT;
  const cosLat = Math.cos(toRadians(latitude));
  // Longitude degrees shrink toward the poles; guard against divide-by-~0.
  const lngDelta = cosLat > 1e-6 ? radiusKm / (KM_PER_DEGREE_LAT * cosLat) : 180;

  const where = {
    latitude: { [Op.between]: [latitude - latDelta, latitude + latDelta] }
  };

  if (lngDelta >= 180) {
    // Radius spans all longitudes (huge radius or near a pole) — latitude box
    // alone bounds it; just require a coordinate to exist.
    where.longitude = { [Op.ne]: null };
    return where;
  }

  const minLng = longitude - lngDelta;
  const maxLng = longitude + lngDelta;
  if (minLng >= -180 && maxLng <= 180) {
    where.longitude = { [Op.between]: [minLng, maxLng] };
  } else {
    // Box crosses the antimeridian — split into two normalized ranges.
    const norm = (lng) => ((lng + 540) % 360) - 180;
    where[Op.or] = [
      { longitude: { [Op.gte]: norm(minLng) } },
      { longitude: { [Op.lte]: norm(maxLng) } }
    ];
  }
  return where;
}

/**
 * Find public/unlisted groups within `radiusKm` of a point, ordered by
 * distance. Uses an index-friendly bounding-box prefilter, then computes the
 * exact Haversine distance, filters to the radius, and paginates. Each result
 * carries a `distanceKm` field.
 *
 * @param {number} latitude - Latitude in decimal degrees (-90..90)
 * @param {number} longitude - Longitude in decimal degrees (-180..180)
 * @param {number} radiusKm - Search radius in kilometers
 * @param {object} options - { limit, offset }
 * @returns {Promise<Array>} Nearby groups, nearest first
 */
async function findGroupsNearLocation(latitude, longitude, radiusKm = 50, options = {}) {
  try {
    const { limit = 20, offset = 0 } = options;

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new Error('INVALID_COORDINATES');
    }

    // Clamp radius to a sane range (0 < r <= half Earth circumference).
    const radius = Math.min(Math.max(Number(radiusKm) || 0, 0.1), 20000);

    const cacheKey =
      `groups:near:${latitude.toFixed(4)}:${longitude.toFixed(4)}:${radius}:${limit}:${offset}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const where = {
      isActive: true,
      visibility: { [Op.in]: ['public', 'unlisted'] },
      ...boundingBoxWhere(latitude, longitude, radius)
    };

    // Prefilter via the box (cheap), rank precisely afterwards.
    const candidates = await Group.findAll({
      where,
      include: [{
        model: GroupTrendingStats,
        as: 'trendingStats',
        required: false
      }],
      limit: MAX_NEARBY_CANDIDATES
    });

    const ranked = candidates
      .map((group) => {
        const plain = typeof group.toJSON === 'function' ? group.toJSON() : { ...group };
        const gLat = parseFloat(plain.latitude);
        const gLng = parseFloat(plain.longitude);
        plain.distanceKm = Number.isFinite(gLat) && Number.isFinite(gLng)
          ? Math.round(haversineKm(latitude, longitude, gLat, gLng) * 100) / 100
          : Infinity;
        return plain;
      })
      .filter((g) => g.distanceKm <= radius)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(offset, offset + limit);

    // Cache for 1 hour
    await redis.setex(cacheKey, 3600, JSON.stringify(ranked));

    logger.info(`Found ${ranked.length} groups within ${radius}km of (${latitude}, ${longitude})`);

    return ranked;
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
