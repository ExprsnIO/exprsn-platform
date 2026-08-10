/**
 * ═══════════════════════════════════════════════════════════
 * Timeline Routes
 * User timeline and feed endpoints with CA token validation
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const { asyncHandler, validatePagination } = require('@exprsn/shared');
const { requireToken, optionalToken } = require('../middleware/auth');
const { Post, Like, Follow } = require('../models');
const feedService = require('../services/feedService');
const postService = require('../services/postService');
const { Op } = require('sequelize');
const { parsePaginationParams, buildCursorResponse, buildCursorWhere } = require('../utils/cursor');

const router = express.Router();

// All timeline routes require authentication
router.use(requireToken({ requiredPermissions: { read: true }, resourcePrefix: '/timeline' }));

/**
 * GET /api/timeline
 * Get user's personalized home feed with ranking
 * Supports both cursor-based and offset-based pagination
 *
 * Query params:
 *   - cursor: Base64 cursor for cursor-based pagination
 *   - limit: Number of items (default: 20, max: 100)
 *   - direction: 'after' (older) or 'before' (newer) - for cursor pagination
 *   - page, offset: Legacy offset-based pagination
 */
router.get('/', asyncHandler(async (req, res) => {
  const paginationParams = parsePaginationParams(req.query);

  let posts;
  let response;

  if (paginationParams.type === 'cursor') {
    // Cursor-based pagination
    const whereClause = paginationParams.cursorData
      ? buildCursorWhere(paginationParams.cursor, paginationParams.direction)
      : {};

    posts = await feedService.getHomeFeed(req.userId, {
      limit: paginationParams.limit,
      where: whereClause
    });

    response = buildCursorResponse(posts, paginationParams.limit - 1);

    res.json({
      success: true,
      posts: response.items,
      pagination: response.pagination
    });
  } else {
    // Legacy offset-based pagination
    posts = await feedService.getHomeFeed(req.userId, {
      limit: paginationParams.limit,
      offset: paginationParams.offset
    });

    res.json({
      success: true,
      posts,
      pagination: {
        page: paginationParams.page,
        limit: paginationParams.limit,
        hasMore: posts.length === paginationParams.limit
      }
    });
  }
}));

/**
 * GET /api/timeline/global
 * Get global public timeline
 * Supports cursor-based and offset-based pagination
 */
router.get('/global', asyncHandler(async (req, res) => {
  const paginationParams = parsePaginationParams(req.query);

  const baseWhere = {
    deleted: false,
    visibility: 'public',
    status: 'published'
  };

  let posts;
  let response;

  if (paginationParams.type === 'cursor') {
    // Cursor-based pagination
    const cursorWhere = paginationParams.cursorData
      ? buildCursorWhere(paginationParams.cursor, paginationParams.direction)
      : {};

    posts = await Post.findAll({
      where: {
        ...baseWhere,
        ...(Object.keys(cursorWhere).length > 0 ? cursorWhere : {})
      },
      include: [
        { model: Like, as: 'likes' }
      ],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: paginationParams.limit
    });

    response = buildCursorResponse(posts, paginationParams.limit - 1);

    res.json({
      success: true,
      posts: response.items,
      pagination: response.pagination
    });
  } else {
    // Legacy offset-based pagination
    posts = await Post.findAll({
      where: baseWhere,
      include: [
        { model: Like, as: 'likes' }
      ],
      order: [['createdAt', 'DESC']],
      limit: paginationParams.limit,
      offset: paginationParams.offset
    });

    res.json({
      success: true,
      posts,
      pagination: {
        page: paginationParams.page,
        limit: paginationParams.limit,
        hasMore: posts.length === paginationParams.limit
      }
    });
  }
}));

/**
 * GET /api/timeline/explore
 * Get discovery/explore feed
 */
router.get('/explore', asyncHandler(async (req, res) => {
  const { page, limit, offset } = validatePagination(req.query);

  const posts = await feedService.getExploreFeed({ limit, offset });

  res.json({
    success: true,
    posts,
    pagination: { page, limit, hasMore: posts.length === limit }
  });
}));

/**
 * GET /api/timeline/trending
 * Get trending posts
 */
router.get('/trending', asyncHandler(async (req, res) => {
  const { page, limit, offset } = validatePagination(req.query);

  const posts = await feedService.getTrendingPosts({ limit, offset });

  res.json({
    success: true,
    posts,
    count: posts.length,
    pagination: { page, limit, hasMore: posts.length === limit }
  });
}));

/**
 * GET /api/timeline/user/:userId
 * Get specific user's timeline
 */
router.get('/user/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { page, limit, offset } = validatePagination(req.query);

  const posts = await feedService.getUserTimeline(userId, {
    limit,
    offset
  });

  res.json({
    success: true,
    userId,
    posts,
    pagination: { page, limit, hasMore: posts.length === limit }
  });
}));

/**
 * GET /api/timeline/bookmarks
 * Get user's bookmarked posts
 */
router.get('/bookmarks', asyncHandler(async (req, res) => {
  const { page, limit, offset } = validatePagination(req.query);

  const posts = await postService.getUserBookmarks(req.userId, {
    limit,
    offset
  });

  res.json({
    success: true,
    bookmarks: posts,
    count: posts.length,
    pagination: { page, limit, hasMore: posts.length === limit }
  });
}));

/**
 * GET /api/timeline/likes
 * Get user's liked posts
 */
router.get('/likes', asyncHandler(async (req, res) => {
  const { page, limit, offset } = validatePagination(req.query);

  const posts = await postService.getUserLikes(req.userId, {
    limit,
    offset
  });

  res.json({
    success: true,
    likes: posts,
    count: posts.length,
    pagination: { page, limit, hasMore: posts.length === limit }
  });
}));

module.exports = router;
