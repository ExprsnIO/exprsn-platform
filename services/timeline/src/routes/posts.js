/**
 * ═══════════════════════════════════════════════════════════
 * Post Routes
 * Complete post management with CA token validation
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const { asyncHandler, AppError, validateRequired, validatePagination, requireGroupMembership } = require('@exprsn/shared');
const { requireToken, requireWrite, requireUpdate, requireDelete, requireAdmin } = require('../middleware/auth');
const { validatePostCreation, validatePostUpdate, validateUUID } = require('../middleware/validation');
const postService = require('../services/postService');
const approvalService = require('../services/approvalService');
const heraldService = require('../services/heraldService');
const { Post, Like, Comment, Repost, Bookmark } = require('../models');
const { broadcastNewPost, broadcastPostLike, broadcastPostComment } = require('../socket');

const router = express.Router();

// All post routes require authentication
router.use(requireToken({ requiredPermissions: { read: true }, resourcePrefix: '/posts' }));

// Group membership guard, applied only when the request targets a group post.
// Any member may post; the guard reads groupId from req.body.groupId and sets
// req.groupMembership = { isMember, role, visibility, joinMode }.
const groupPostGuard = requireGroupMembership();
function conditionalGroupMembership(req, res, next) {
  if (req.body && req.body.groupId) {
    return groupPostGuard(req, res, next);
  }
  return next();
}

/**
 * POST /api/posts
 * Create new post. Optional `groupId` scopes the post to a nexus group; when
 * present the caller must be a member (any role) and posts in private/unlisted
 * groups are forced to member-only (visibility: 'private').
 */
router.post('/',
  requireWrite('/posts'),
  conditionalGroupMembership,
  validatePostCreation,
  asyncHandler(async (req, res) => {
    const { content, mediaIds, visibility, replyTo, quoteOf, groupId } = req.body;

    // For group posts, enforce visibility semantics from the group itself:
    // private/unlisted groups => member-only post regardless of requested value.
    let effectiveVisibility = visibility;
    if (groupId) {
      const groupVisibility = req.groupMembership && req.groupMembership.visibility;
      if (groupVisibility === 'private' || groupVisibility === 'unlisted') {
        effectiveVisibility = 'private';
      }
    }

    const post = await postService.createPost({
      userId: req.userId,
      content,
      mediaIds,
      visibility: effectiveVisibility,
      replyTo,
      quoteOf,
      groupId: groupId || null
    });

    // "Require Approval for New Posts": hold the post (forced private) and
    // route the approval request to the configured mechanism (manual admin,
    // lowcode workflow/app, or webhook). Policy read failures fall back to
    // the default (no approval) rather than blocking posting.
    let pendingApproval = false;
    try {
      const policy = await approvalService.getPolicy();
      if (policy.requireApproval) {
        await approvalService.holdForApproval(post, effectiveVisibility, policy.approvalMechanism);
        approvalService.dispatchApprovalRequest(post).catch(() => {});
        pendingApproval = true;
      }
    } catch (_) { /* fail open — treat as no approval required */ }

    // Broadcast via Socket.IO. Group posts are scoped to the group room;
    // non-group posts keep the existing global behavior. Held posts are not
    // announced until approved.
    if (req.io && !pendingApproval) {
      broadcastNewPost(req.io, post.toJSON());
    }

    // Emit onto the plugin hook bus (fire-and-forget, NEVER throws into this
    // request). Inert unless PLUGINS_ENABLED/LOWCODE_ENABLED; lazily required and
    // wrapped so a missing/erroring plugins module can't affect post creation.
    try {
      const pluginHost = require('../../../plugins/src/services/pluginHost');
      const json = post.toJSON ? post.toJSON() : post;
      pluginHost.emit('timeline.post.created', {
        module: 'timeline',
        userId: req.userId,
        post: { id: json.id, userId: json.userId, content: json.content, visibility: json.visibility, groupId: json.groupId },
      }).catch(() => {});
    } catch (_) { /* plugins module unavailable — ignore */ }

    res.status(201).json({
      success: true,
      message: pendingApproval ? 'Post created and held for approval' : 'Post created successfully',
      pendingApproval,
      post
    });
  })
);

/**
 * POST /api/posts/:id/approval
 * Manual approval decision for a held post (admin only).
 * Body: { decision: 'approved' | 'rejected', reason? }
 */
router.post('/:id/approval',
  validateUUID('id'),
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const { decision, reason } = req.body || {};
    try {
      const post = await approvalService.applyDecision(req.params.id, String(decision || ''), {
        decidedBy: req.userId,
        reason
      });
      if (req.io && post.visibility !== 'private') {
        broadcastNewPost(req.io, post.toJSON());
      }
      res.json({ success: true, post });
    } catch (error) {
      if (error.status) {
        throw new AppError(error.message, error.status, 'APPROVAL_ERROR');
      }
      throw error;
    }
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
router.post('/:id/like', requireWrite('/posts'), asyncHandler(async (req, res) => {
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

    // Broadcast via Socket.IO (scoped to the group room for group posts)
    if (req.io) {
      broadcastPostLike(req.io, id, req.userId, post.groupId);
    }

    // Notify the author (in-app bell). Fire-and-forget; self-likes are skipped
    // inside notifyInteraction. Never block or fail the like on a notify error.
    heraldService
      .notifyInteraction('like', post.userId, req.userId, post)
      .catch(() => {});
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
router.post('/:id/comments', requireWrite('/posts'), asyncHandler(async (req, res) => {
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

  // Broadcast via Socket.IO (scoped to the group room for group posts)
  if (req.io) {
    broadcastPostComment(req.io, id, comment.toJSON(), post.groupId);
  }

  // Notify the post author (in-app bell). Fire-and-forget; self-comments skipped.
  heraldService
    .notifyInteraction('comment', post.userId, req.userId, post, {
      commentText: content,
      commentId: comment.id
    })
    .catch(() => {});

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
