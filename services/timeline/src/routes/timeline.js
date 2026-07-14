/**
 * ═══════════════════════════════════════════════════════════
 * Timeline Routes
 * User timeline and feed endpoints with CA token validation
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const { asyncHandler, validatePagination, requireGroupMembership } = require('@exprsn/shared');
const { requireToken, optionalToken } = require('../middleware/auth');
const { Post, Like, Follow } = require('../models');
const feedService = require('../services/feedService');
const postService = require('../services/postService');
const moderationSink = require('../services/moderationSink');
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

    // Moderation read-gate: hide rejected (and, when the hold flag is on,
    // pending) posts from users other than the author. No-op when moderation
    // is not deployed.
    posts = await moderationSink.filterServablePosts(posts, req.userId);

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

    posts = await moderationSink.filterServablePosts(posts, req.userId);

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
    visibility: 'public'
  };

  let posts;
  let response;

  if (paginationParams.type === 'cursor') {
    // Cursor-based pagination. buildCursorWhere returns an object keyed by a
    // Sequelize Op.* Symbol; spread copies Symbol keys but Object.keys() does
    // NOT enumerate them, so never gate the merge on Object.keys().length.
    const cursorWhere = paginationParams.cursorData
      ? buildCursorWhere(paginationParams.cursor, paginationParams.direction)
      : null;

    posts = await Post.findAll({
      where: {
        ...baseWhere,
        ...(cursorWhere || {})
      },
      include: [
        { model: Like, as: 'likes' }
      ],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: paginationParams.limit
    });

    // Moderation read-gate (no-op unless moderation is deployed).
    posts = await moderationSink.filterServablePosts(posts, req.userId);

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

    posts = await moderationSink.filterServablePosts(posts, req.userId);

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
 * GET /api/timeline/group/:groupId
 * Get a group's feed (newest-first), guarded by group membership.
 * Returns only that group's non-deleted posts. Membership is the access
 * boundary, so member-only (private) group posts are included for members.
 * Supports cursor-based and offset-based pagination (mirrors /global).
 */
router.get('/group/:groupId', requireGroupMembership(), asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const paginationParams = parsePaginationParams(req.query);

  const baseWhere = {
    groupId,
    deleted: false
  };

  let posts;
  let response;

  if (paginationParams.type === 'cursor') {
    const cursorWhere = paginationParams.cursorData
      ? buildCursorWhere(paginationParams.cursor, paginationParams.direction)
      : null;

    posts = await Post.findAll({
      where: {
        ...baseWhere,
        ...(cursorWhere || {})
      },
      include: [
        { model: Like, as: 'likes' }
      ],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: paginationParams.limit
    });

    // Moderation read-gate (no-op unless moderation is deployed).
    posts = await moderationSink.filterServablePosts(posts, req.userId);

    response = buildCursorResponse(posts, paginationParams.limit - 1);

    res.json({
      success: true,
      groupId,
      posts: response.items,
      pagination: response.pagination
    });
  } else {
    posts = await Post.findAll({
      where: baseWhere,
      include: [
        { model: Like, as: 'likes' }
      ],
      order: [['createdAt', 'DESC']],
      limit: paginationParams.limit,
      offset: paginationParams.offset
    });

    posts = await moderationSink.filterServablePosts(posts, req.userId);

    res.json({
      success: true,
      groupId,
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

  const posts = await moderationSink.filterServablePosts(
    await feedService.getExploreFeed({ limit, offset }), req.userId
  );

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

  const posts = await moderationSink.filterServablePosts(
    await feedService.getTrendingPosts({ limit, offset }), req.userId
  );

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

  let posts = await feedService.getUserTimeline(userId, {
    limit,
    offset
  });

  // A viewer sees another user's posts here; a rejected post must not leak.
  posts = await moderationSink.filterServablePosts(posts, req.userId);

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

  const posts = await moderationSink.filterServablePosts(
    await postService.getUserBookmarks(req.userId, { limit, offset }), req.userId
  );

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

  const posts = await moderationSink.filterServablePosts(
    await postService.getUserLikes(req.userId, { limit, offset }), req.userId
  );

  res.json({
    success: true,
    likes: posts,
    count: posts.length,
    pagination: { page, limit, hasMore: posts.length === limit }
  });
}));

module.exports = router;
