/**
 * ═══════════════════════════════════════════════════════════
 * Search Routes
 * Search posts, trending topics with CA token validation
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const { asyncHandler, AppError, validatePagination } = require('@exprsn/shared');
const { requireToken } = require('../middleware/auth');
const { Post, Trending } = require('../models');
const { Op } = require('sequelize');
const elasticsearchService = require('../services/elasticsearchService');
const config = require('../config');

const router = express.Router();

// All search routes require authentication
router.use(requireToken({ requiredPermissions: { read: true }, resourcePrefix: '/search' }));

/**
 * GET /api/search/posts
 * Search posts by content
 */
router.get('/posts', asyncHandler(async (req, res) => {
  const { q: query, page, limit, offset } = validatePagination(req.query);
  const { sortBy = 'relevance', hasMedia, dateFrom, dateTo } = req.query;

  if (!query || query.trim().length === 0) {
    throw new AppError('Search query required', 400, 'MISSING_QUERY');
  }

  if (query.length < 2) {
    throw new AppError('Query must be at least 2 characters', 400, 'QUERY_TOO_SHORT');
  }

  let posts;
  let total;
  let searchMethod;

  // Use ElasticSearch if enabled
  if (config.elasticsearch.enabled) {
    searchMethod = 'elasticsearch';

    const filters = {};
    if (hasMedia !== undefined) {
      filters.hasMedia = hasMedia === 'true';
    }
    if (dateFrom) {
      filters.dateFrom = dateFrom;
    }
    if (dateTo) {
      filters.dateTo = dateTo;
    }

    const result = await elasticsearchService.searchPosts(query, {
      from: offset,
      size: limit,
      sortBy,
      filters
    });

    if (result.success) {
      posts = result.posts;
      total = result.total;
    } else {
      // Fallback to SQL search if ElasticSearch fails
      searchMethod = 'postgres-fallback';
      posts = await sqlSearch(query, limit, offset);
      total = posts.length;
    }
  } else {
    // Fallback to SQL search
    searchMethod = 'postgres';
    posts = await sqlSearch(query, limit, offset);
    total = posts.length;
  }

  res.json({
    success: true,
    query,
    posts,
    count: posts.length,
    total,
    searchMethod,
    pagination: {
      page,
      limit,
      offset,
      hasMore: posts.length === limit
    }
  });
}));

/**
 * SQL-based search fallback
 */
async function sqlSearch(query, limit, offset) {
  return await Post.findAll({
    where: {
      content: { [Op.iLike]: `%${query}%` },
      deleted: false,
      visibility: 'public',
      status: 'published'
    },
    order: [
      ['likeCount', 'DESC'],
      ['createdAt', 'DESC']
    ],
    limit,
    offset
  });
}

/**
 * GET /api/search/hashtags
 * Search by hashtag
 */
router.get('/hashtags', asyncHandler(async (req, res) => {
  const { q: query, page, limit, offset } = validatePagination(req.query);

  if (!query || query.trim().length === 0) {
    throw new AppError('Hashtag query required', 400, 'MISSING_QUERY');
  }

  // Remove # if present
  const hashtag = query.replace(/^#/, '').toLowerCase();

  // Search posts with this hashtag in metadata
  const posts = await Post.findAll({
    where: {
      'metadata.entities.hashtags': {
        [Op.contains]: [{ tag: hashtag }]
      },
      deleted: false,
      visibility: 'public'
    },
    order: [
      ['createdAt', 'DESC']
    ],
    limit,
    offset
  });

  res.json({
    success: true,
    hashtag: `#${hashtag}`,
    posts,
    count: posts.length,
    pagination: { page, limit, hasMore: posts.length === limit }
  });
}));

/**
 * GET /api/trending/topics
 * Get trending topics/hashtags
 */
router.get('/trending/topics', asyncHandler(async (req, res) => {
  const { page, limit, offset } = validatePagination(req.query);

  // Get trending topics from the last 24 hours
  const trending = await Trending.findAll({
    where: {
      createdAt: {
        [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
      }
    },
    order: [
      ['score', 'DESC'],
      ['createdAt', 'DESC']
    ],
    limit,
    offset
  });

  res.json({
    success: true,
    topics: trending,
    count: trending.length,
    pagination: { page, limit, hasMore: trending.length === limit }
  });
}));

/**
 * GET /api/trending/hashtags
 * Get trending hashtags
 */
router.get('/trending/hashtags', asyncHandler(async (req, res) => {
  const { page, limit, offset } = validatePagination(req.query);

  // Get trending hashtags
  const trending = await Trending.findAll({
    where: {
      type: 'hashtag',
      createdAt: {
        [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
      }
    },
    order: [
      ['score', 'DESC'],
      ['createdAt', 'DESC']
    ],
    limit,
    offset
  });

  res.json({
    success: true,
    hashtags: trending.map(t => ({
      tag: t.topic,
      score: t.score,
      postCount: t.metadata?.postCount || 0
    })),
    count: trending.length,
    pagination: { page, limit, hasMore: trending.length === limit }
  });
}));

module.exports = router;
