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
const relationshipService = require('../services/relationshipService');
const config = require('../config');

const router = express.Router();

// All search routes require authentication
router.use(requireToken({ requiredPermissions: { read: true }, resourcePrefix: '/search' }));

/**
 * GET /api/search/posts
 * Search posts by content
 */
router.get('/posts', asyncHandler(async (req, res) => {
  const { page, limit, offset } = validatePagination(req.query);
  // validatePagination returns ONLY { page, limit, offset } — it does NOT echo
  // `q`, so the search term must be read from req.query directly (reading it from
  // the pagination result left `query` permanently undefined -> a 400 on every
  // request, which also made the FEAT-011 R15/R16 suppression on this route dead
  // code).
  const query = req.query.q;
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

  // FEAT-011 R15/R16: exclude blocked/muted authors from search results. ONE
  // set-returning query per request; fed to ES as a must_not terms filter and to
  // the SQL fallback as [Op.notIn].
  const suppressed = (await relationshipService.getSuppressedIds(req.userId)) || [];

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
    if (suppressed.length) {
      filters.excludeUserIds = suppressed;
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
      posts = await sqlSearch(query, limit, offset, suppressed);
      total = posts.length;
    }
  } else {
    // Fallback to SQL search
    searchMethod = 'postgres';
    posts = await sqlSearch(query, limit, offset, suppressed);
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
async function sqlSearch(query, limit, offset, suppressed = []) {
  const where = {
    content: { [Op.iLike]: `%${query}%` },
    deleted: false,
    visibility: 'public'
  };
  // FEAT-011 R15: exclude blocked/muted authors.
  if (suppressed.length) {
    where.userId = { [Op.notIn]: suppressed };
  }
  return await Post.findAll({
    where,
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
  const { page, limit, offset } = validatePagination(req.query);
  const query = req.query.q; // validatePagination does not echo `q` (see /posts note)

  if (!query || query.trim().length === 0) {
    throw new AppError('Hashtag query required', 400, 'MISSING_QUERY');
  }

  // Remove # if present
  const hashtag = query.replace(/^#/, '').toLowerCase();

  // FEAT-011 (R15-shape): hashtag search is a public content-surfacing read path
  // with the same leak shape as the SQL post search (R15) — a blocked/muted
  // author's post must not surface to the viewer. One set-returning query per
  // request, applied as [Op.notIn] on the author id.
  const suppressed = (await relationshipService.getSuppressedIds(req.userId)) || [];

  const where = {
    'metadata.entities.hashtags': {
      [Op.contains]: [{ tag: hashtag }]
    },
    deleted: false,
    visibility: 'public'
  };
  if (suppressed.length) {
    where.userId = { [Op.notIn]: suppressed };
  }

  // Search posts with this hashtag in metadata
  const posts = await Post.findAll({
    where,
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
      ['trendScore', 'DESC'],
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
      topicType: 'hashtag',
      createdAt: {
        [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
      }
    },
    order: [
      ['trendScore', 'DESC'],
      ['createdAt', 'DESC']
    ],
    limit,
    offset
  });

  res.json({
    success: true,
    hashtags: trending.map(t => ({
      tag: t.topic,
      score: t.trendScore,
      postCount: t.postsCount || 0
    })),
    count: trending.length,
    pagination: { page, limit, hasMore: trending.length === limit }
  });
}));

module.exports = router;
