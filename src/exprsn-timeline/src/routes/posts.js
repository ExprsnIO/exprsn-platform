/**
 * ═══════════════════════════════════════════════════════════
 * Post Routes
 * Complete post management with CA token validation
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const { asyncHandler, AppError, validateRequired, validatePagination } = require('@exprsn/shared');
const { requireToken, requireWrite, requireUpdate, requireDelete } = require('../middleware/auth');
const { validatePostCreation, validatePostUpdate, validateUUID } = require('../middleware/validation');
const postService = require('../services/postService');
const { Post, Like, Comment, Repost, Bookmark } = require('../models');
const { broadcastNewPost, broadcastPostLike, broadcastPostComment } = require('../socket');

const router = express.Router();

// All post routes require authentication
router.use(requireToken({ requiredPermissions: { read: true }, resourcePrefix: '/posts' }));

/**
 * POST /api/posts
 * Create new post
 */
router.post('/',
  requireWrite('/posts'),
  validatePostCreation,
  asyncHandler(async (req, res) => {
    const { content, mediaIds, visibility, replyTo, quoteOf } = req.body;

    const post = await postService.createPost({
      userId: req.userId,
      content,
      mediaIds,
      visibility,
      replyTo,
      quoteOf
    });

    // Broadcast via Socket.IO
    if (req.io) {
      broadcastNewPost(req.io, post.toJSON());
    }

    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      post
    });
  })
);

/**
 * GET /api/posts/:id
 * Get single post
 */
router.get('/:id',
  validateUUID('id'),
  asyncHandler(async (req, res) => {
    const post = await postService.getPostById(req.params.id, {
      includeLikes: true
    });

    // Check visibility
    if (post.visibility === 'private' && post.userId !== req.userId) {
      throw new AppError('This post is private', 403, 'FORBIDDEN');
    }

    res.json({
      success: true,
      post
    });
  })
);

/**
 * PUT /api/posts/:id
 * Update post
 */
router.put('/:id',
  validateUUID('id'),
  requireUpdate('/posts'),
  validatePostUpdate,
  asyncHandler(async (req, res) => {
    const { content } = req.body;

    const post = await postService.updatePost(
      req.params.id,
      req.userId,
      { content }
    );

    res.json({
      success: true,
      message: 'Post updated successfully',
      post
    });
  })
);

/**
 * DELETE /api/posts/:id
 * Delete post
 */
router.delete('/:id',
  validateUUID('id'),
  requireDelete('/posts'),
  asyncHandler(async (req, res) => {
    const result = await postService.deletePost(
      req.params.id,
      req.userId
    );

    res.json(result);
  })
);

/**
 * POST /api/posts/:id/like
 * Like a post
 */
router.post('/:id/like', requireWrite, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const post = await Post.findOne({
    where: { id, deleted: false }
  });

  if (!post) {
    throw new AppError('Post not found', 404, 'NOT_FOUND');
  }

  const [like, created] = await Like.findOrCreate({
    where: { postId: id, userId: req.userId },
    defaults: { postId: id, userId: req.userId }
  });

  if (created) {
    post.likeCount += 1;
    await post.save();

    // Broadcast via Socket.IO
    if (req.io) {
      broadcastPostLike(req.io, id, req.userId);
    }
  }

  res.json({
    message: created ? 'Post liked' : 'Already liked',
    liked: true
  });
}));

/**
 * DELETE /api/posts/:id/like
 * Unlike a post
 */
router.delete('/:id/like', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const like = await Like.findOne({
    where: { postId: id, userId: req.userId }
  });

  if (like) {
    await like.destroy();

    const post = await Post.findByPk(id);
    if (post) {
      post.likeCount = Math.max(0, post.likeCount - 1);
      await post.save();
    }
  }

  res.json({ message: 'Post unliked', liked: false });
}));

/**
 * POST /api/posts/:id/comments
 * Comment on a post
 */
router.post('/:id/comments', requireWrite, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;

  validateRequired({ content }, ['content']);

  const post = await Post.findOne({
    where: { id, deleted: false }
  });

  if (!post) {
    throw new AppError('Post not found', 404, 'NOT_FOUND');
  }

  const comment = await Comment.create({
    postId: id,
    userId: req.userId,
    content
  });

  post.commentCount += 1;
  await post.save();

  // Broadcast via Socket.IO
  if (req.io) {
    broadcastPostComment(req.io, id, comment.toJSON());
  }

  res.status(201).json({
    message: 'Comment added',
    comment
  });
}));

/**
 * GET /api/posts/:id/comments
 * Get post comments
 */
router.get('/:id/comments', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page, limit, offset } = validatePagination(req.query);

  const comments = await Comment.findAll({
    where: { postId: id, deleted: false },
    order: [['createdAt', 'DESC']],
    limit,
    offset
  });

  res.json({
    comments,
    pagination: { page, limit, hasMore: comments.length === limit }
  });
}));

/**
 * GET /api/posts/:id/thread
 * Get post thread (conversation)
 */
router.get('/:id/thread',
  validateUUID('id'),
  asyncHandler(async (req, res) => {
    const thread = await postService.getPostThread(req.params.id);

    res.json({
      success: true,
      ...thread
    });
  })
);

/**
 * GET /api/posts/:id/quotes
 * Get quote posts
 */
router.get('/:id/quotes',
  validateUUID('id'),
  asyncHandler(async (req, res) => {
    const quotes = await postService.getQuotePosts(req.params.id);

    res.json({
      success: true,
      quotes,
      count: quotes.length
    });
  })
);

/**
 * GET /api/posts/:id/analytics
 * Get post engagement analytics (owner only)
 */
router.get('/:id/analytics',
  validateUUID('id'),
  asyncHandler(async (req, res) => {
    const post = await postService.getPostById(req.params.id);

    // Only post owner can view analytics
    if (post.userId !== req.userId) {
      throw new AppError('Only post owner can view analytics', 403, 'FORBIDDEN');
    }

    const stats = await postService.getPostStats(req.params.id);

    res.json({
      success: true,
      postId: req.params.id,
      analytics: stats
    });
  })
);

/**
 * POST /api/posts/:id/repost
 * Repost a post
 */
router.post('/:id/repost',
  validateUUID('id'),
  requireWrite('/posts'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { comment } = req.body;

    const post = await Post.findOne({
      where: { id, deleted: false }
    });

    if (!post) {
      throw new AppError('Post not found', 404, 'NOT_FOUND');
    }

    const [repost, created] = await Repost.findOrCreate({
      where: { postId: id, userId: req.userId },
      defaults: { postId: id, userId: req.userId, comment }
    });

    if (created) {
      post.repostCount += 1;
      await post.save();
    }

    res.json({
      success: true,
      message: created ? 'Post reposted' : 'Already reposted',
      reposted: true
    });
  })
);

/**
 * DELETE /api/posts/:id/repost
 * Undo repost
 */
router.delete('/:id/repost',
  validateUUID('id'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const repost = await Repost.findOne({
      where: { postId: id, userId: req.userId }
    });

    if (repost) {
      await repost.destroy();

      const post = await Post.findByPk(id);
      if (post) {
        post.repostCount = Math.max(0, post.repostCount - 1);
        await post.save();
      }
    }

    res.json({
      success: true,
      message: 'Repost removed',
      reposted: false
    });
  })
);

/**
 * POST /api/posts/:id/bookmark
 * Bookmark a post
 */
router.post('/:id/bookmark',
  validateUUID('id'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const post = await Post.findOne({
      where: { id, deleted: false }
    });

    if (!post) {
      throw new AppError('Post not found', 404, 'NOT_FOUND');
    }

    const [bookmark, created] = await Bookmark.findOrCreate({
      where: { postId: id, userId: req.userId },
      defaults: { postId: id, userId: req.userId }
    });

    res.json({
      success: true,
      message: created ? 'Post bookmarked' : 'Already bookmarked',
      bookmarked: true
    });
  })
);

/**
 * DELETE /api/posts/:id/bookmark
 * Remove bookmark
 */
router.delete('/:id/bookmark',
  validateUUID('id'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const bookmark = await Bookmark.findOne({
      where: { postId: id, userId: req.userId }
    });

    if (bookmark) {
      await bookmark.destroy();
    }

    res.json({
      success: true,
      message: 'Bookmark removed',
      bookmarked: false
    });
  })
);

/**
 * GET /api/posts/:id/likes
 * Get users who liked a post
 */
router.get('/:id/likes',
  validateUUID('id'),
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = validatePagination(req.query);

    const likes = await Like.findAll({
      where: { postId: req.params.id },
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    res.json({
      success: true,
      likes,
      count: likes.length,
      pagination: { page, limit, hasMore: likes.length === limit }
    });
  })
);

/**
 * GET /api/posts/:id/reposts
 * Get users who reposted a post
 */
router.get('/:id/reposts',
  validateUUID('id'),
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = validatePagination(req.query);

    const reposts = await Repost.findAll({
      where: { postId: req.params.id },
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    res.json({
      success: true,
      reposts,
      count: reposts.length,
      pagination: { page, limit, hasMore: reposts.length === limit }
    });
  })
);

module.exports = router;
