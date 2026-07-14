/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Timeline - Post Service
 * ═══════════════════════════════════════════════════════════════════════
 */

const { Post, Like, Repost, Comment, Bookmark } = require('../models');
const { processContent, generatePreview } = require('../utils/contentProcessor');
const { AppError } = require('@exprsn/shared');
const logger = require('../utils/logger');
const { Op } = require('sequelize');
const { queues } = require('../config/queue');
const blueskyWebhook = require('./blueskyWebhook');
const moderationSink = require('./moderationSink');
// FEAT-011 block/mute enforcement (intra-module; relationshipService depends
// only on models, so there is no require cycle).
const relationshipService = require('./relationshipService');

/**
 * Create a new post
 */
async function createPost({ userId, content, mediaIds = [], visibility = 'public', replyTo = null, quoteOf = null, groupId = null }) {
  try {
    // Process content (sanitize and extract entities)
    const processed = processContent(content);

    // Determine content type
    let contentType = 'text';
    if (mediaIds && mediaIds.length > 0) {
      contentType = 'media';
    } else if (processed.entities.urls.length > 0) {
      contentType = 'link';
    }

    // Build metadata
    const metadata = {
      ...processed.metadata,
      entities: processed.entities,
      preview: generatePreview(processed.content),
      replyTo,
      quoteOf
    };

    // Create post
    const post = await Post.create({
      userId,
      content: processed.content,
      contentType,
      media: mediaIds ? mediaIds.map(id => ({ id, type: 'image' })) : [],
      visibility,
      groupId,
      metadata,
      likeCount: 0,
      repostCount: 0,
      commentCount: 0,
      deleted: false
    });

    logger.info('Post created', { postId: post.id, userId, contentType });

    // UGC moderation invariant (FEAT-009 / ADR 0004 §4.1): PRE-CREATE the
    // post_moderation row (pending), then enqueue. Best-effort — never fails the
    // post (text is fail-open). Awaits only the row write, not the enqueue.
    await moderationSink.establishPostModerationState({ post, mode: 'create' }).catch((err) =>
      logger.error('establishPostModerationState (create) failed; post still served', { postId: post.id, error: err.message })
    );

    // Queue background jobs
    await queuePostJobs(post, processed);

    // Notify Bluesky service (don't await - fire and forget)
    blueskyWebhook.notifyPostCreated(post).catch(err =>
      logger.error('Failed to notify Bluesky of post creation', { error: err.message })
    );

    return post;
  } catch (error) {
    logger.error('Error creating post:', error);
    throw new AppError('Failed to create post', 500, 'POST_CREATE_FAILED');
  }
}

/**
 * Get post by ID
 */
async function getPostById(postId, options = {}) {
  try {
    const post = await Post.findByPk(postId, {
      include: options.includeLikes ? [{ model: Like, as: 'likes' }] : [],
      ...options
    });

    if (!post) {
      throw new Error('Post not found');
    }

    // FEAT-011 QUOTE-EMBED GUARD-RAIL (ADR finding 11): this function does NOT
    // inline-hydrate the quoted post (metadata.quoteOf) — the SPA re-fetches it,
    // which hits the R9 post-detail block 404 (posts.js GET /:id). If any future
    // change starts attaching the quoted author/body into this payload, it MUST
    // filter the embedded author through relationshipService.getSuppressedIds
    // (or isBlockedEitherWay) for the viewer and drop/redact the embed when
    // suppressed, or the block leaks past R9.

    return post;
  } catch (error) {
    logger.error('Error fetching post:', error);
    throw error;
  }
}

/**
 * Get user's posts
 */
async function getUserPosts(userId, { limit = 20, offset = 0 } = {}) {
  try {
    const posts = await Post.findAll({
      where: { userId, deleted: false },
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    return posts;
  } catch (error) {
    logger.error('Error fetching user posts:', error);
    throw error;
  }
}

/**
 * Update post
 */
async function updatePost(postId, userId, { content }) {
  try {
    const post = await Post.findByPk(postId);

    if (!post) {
      throw new AppError('Post not found', 404, 'POST_NOT_FOUND');
    }

    if (post.userId !== userId) {
      throw new AppError('Not authorized to edit this post', 403, 'FORBIDDEN');
    }

    if (post.deleted) {
      throw new AppError('Cannot edit deleted post', 400, 'POST_DELETED');
    }

    // Process new content
    const processed = processContent(content);

    // Update post
    await post.update({
      content: processed.content,
      metadata: {
        ...post.metadata,
        ...processed.metadata,
        entities: processed.entities,
        preview: generatePreview(processed.content),
        edited: true,
        editedAt: Date.now()
      }
    });

    logger.info('Post updated', { postId, userId });

    // Content bytes changed → RE-MODERATE (FEAT-009 / ADR 0004 §4.1). mode
    // 'reset' removes the stale job (BUG-016) and clears the prior verdict —
    // an old verdict does not describe the edited content.
    await moderationSink.establishPostModerationState({ post, mode: 'reset' }).catch((err) =>
      logger.error('establishPostModerationState (reset) failed on edit', { postId, error: err.message })
    );

    // Re-index in search
    if (queues.indexing) {
      await queues.indexing.add('post-index', {
        postId: post.id,
        operation: 'index'
      });
    }

    // Notify Bluesky service (don't await - fire and forget)
    blueskyWebhook.notifyPostUpdated(post).catch(err =>
      logger.error('Failed to notify Bluesky of post update', { error: err.message })
    );

    return post;
  } catch (error) {
    if (error.isOperational) throw error;
    logger.error('Error updating post:', error);
    throw new AppError('Failed to update post', 500, 'POST_UPDATE_FAILED');
  }
}

/**
 * Delete post
 */
async function deletePost(postId, userId) {
  try {
    const post = await Post.findByPk(postId);

    if (!post) {
      throw new AppError('Post not found', 404, 'POST_NOT_FOUND');
    }

    if (post.userId !== userId) {
      throw new AppError('Not authorized to delete this post', 403, 'FORBIDDEN');
    }

    await post.update({
      deleted: true,
      deletedAt: Date.now()
    });

    logger.info('Post deleted', { postId, userId });

    // Queue removal jobs
    if (queues.fanout) {
      await queues.fanout.add('post-removal', {
        postId: post.id,
        authorId: userId
      });
    }

    if (queues.indexing) {
      await queues.indexing.add('post-index', {
        postId: post.id,
        operation: 'delete'
      });
    }

    // Notify Bluesky service (don't await - fire and forget)
    blueskyWebhook.notifyPostDeleted(post).catch(err =>
      logger.error('Failed to notify Bluesky of post deletion', { error: err.message })
    );

    return { success: true, message: 'Post deleted successfully' };
  } catch (error) {
    if (error.isOperational) throw error;
    logger.error('Error deleting post:', error);
    throw new AppError('Failed to delete post', 500, 'POST_DELETE_FAILED');
  }
}

/**
 * Get post engagement stats
 */
async function getPostStats(postId) {
  try {
    const post = await Post.findByPk(postId);

    if (!post) {
      throw new Error('Post not found');
    }

    const [likesCount, repostsCount, commentsCount, bookmarksCount] = await Promise.all([
      Like.count({ where: { postId } }),
      Repost.count({ where: { postId } }),
      Comment.count({ where: { postId } }),
      Bookmark.count({ where: { postId } })
    ]);

    return {
      likesCount,
      repostsCount,
      commentsCount,
      bookmarksCount,
      impressionsCount: post.metadata?.impressionsCount || 0
    };
  } catch (error) {
    logger.error('Error fetching post stats:', error);
    throw error;
  }
}

/**
 * Get post thread (replies)
 */
async function getPostThread(postId, { viewerId = null } = {}) {
  try {
    const rootPost = await Post.findByPk(postId);

    if (!rootPost) {
      throw new AppError('Post not found', 404, 'POST_NOT_FOUND');
    }

    // FEAT-011 R11: a thread rooted on a post whose author is blocked either way
    // is not-found to the viewer (mirrors the R9 post-detail 404; block only).
    if (viewerId && rootPost.userId !== viewerId
        && await relationshipService.isBlockedEitherWay(viewerId, rootPost.userId)) {
      throw new AppError('Post not found', 404, 'POST_NOT_FOUND');
    }

    // Suppress replies from blocked/muted authors (one set-returning query).
    const suppressed = viewerId ? ((await relationshipService.getSuppressedIds(viewerId)) || []) : [];
    const replyWhere = {
      'metadata.replyTo': postId,
      deleted: false
    };
    if (suppressed.length) {
      replyWhere.userId = { [Op.notIn]: suppressed };
    }

    // Get all replies to this post
    const replies = await Post.findAll({
      where: replyWhere,
      order: [['createdAt', 'ASC']],
      include: [
        { model: Like, as: 'likes' },
        { model: Comment, as: 'comments' }
      ]
    });

    return {
      rootPost,
      replies,
      replyCount: replies.length
    };
  } catch (error) {
    if (error.isOperational) throw error;
    logger.error('Error fetching post thread:', error);
    throw new AppError('Failed to fetch thread', 500, 'THREAD_FETCH_FAILED');
  }
}

/**
 * Get quote posts
 */
async function getQuotePosts(postId, { viewerId = null } = {}) {
  try {
    // FEAT-011 R12: suppress quotes authored by blocked/muted users (one query).
    const suppressed = viewerId ? ((await relationshipService.getSuppressedIds(viewerId)) || []) : [];
    const where = {
      'metadata.quoteOf': postId,
      deleted: false
    };
    if (suppressed.length) {
      where.userId = { [Op.notIn]: suppressed };
    }

    const quotes = await Post.findAll({
      where,
      order: [['createdAt', 'DESC']],
      include: [
        { model: Like, as: 'likes' }
      ]
    });

    return quotes;
  } catch (error) {
    logger.error('Error fetching quote posts:', error);
    throw new AppError('Failed to fetch quotes', 500, 'QUOTES_FETCH_FAILED');
  }
}

/**
 * Get user's liked posts
 */
async function getUserLikes(userId, { limit = 20, offset = 0, viewerId = null } = {}) {
  try {
    // FEAT-011 R8: exclude liked posts whose author is blocked/muted for the
    // viewer (defaults to the list owner). One set-returning query per request.
    const effectiveViewer = viewerId || userId;
    const suppressed = (await relationshipService.getSuppressedIds(effectiveViewer)) || [];
    const postWhere = { deleted: false };
    if (suppressed.length) {
      postWhere.userId = { [Op.notIn]: suppressed };
    }

    const likes = await Like.findAll({
      where: { userId },
      include: [{
        model: Post,
        as: 'post',
        where: postWhere
      }],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    return likes.map(like => like.post);
  } catch (error) {
    logger.error('Error fetching user likes:', error);
    throw new AppError('Failed to fetch likes', 500, 'LIKES_FETCH_FAILED');
  }
}

/**
 * Get user's bookmarked posts
 */
async function getUserBookmarks(userId, { limit = 20, offset = 0, viewerId = null } = {}) {
  try {
    // FEAT-011 R8: exclude bookmarked posts whose author is blocked/muted for
    // the viewer (defaults to the list owner). One set-returning query.
    const effectiveViewer = viewerId || userId;
    const suppressed = (await relationshipService.getSuppressedIds(effectiveViewer)) || [];
    const postWhere = { deleted: false };
    if (suppressed.length) {
      postWhere.userId = { [Op.notIn]: suppressed };
    }

    const bookmarks = await Bookmark.findAll({
      where: { userId },
      include: [{
        model: Post,
        as: 'post',
        where: postWhere
      }],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    return bookmarks.map(bookmark => bookmark.post);
  } catch (error) {
    logger.error('Error fetching user bookmarks:', error);
    throw new AppError('Failed to fetch bookmarks', 500, 'BOOKMARKS_FETCH_FAILED');
  }
}

/**
 * Queue background jobs for a new post
 */
async function queuePostJobs(post, processedContent) {
  try {
    // 1. Queue fan-out job (distribute to followers' timelines)
    if (queues.fanout) {
      await queues.fanout.add('post-fanout', {
        postId: post.id,
        authorId: post.userId,
        postData: {
          postId: post.id,
          content: post.content,
          contentType: post.contentType,
          visibility: post.visibility,
          createdAt: post.createdAt
        }
      });

      logger.debug('Fan-out job queued', { postId: post.id });
    }

    // 2. Queue hashtag processing (trending)
    if (queues.trending && processedContent.entities.hashtags.length > 0) {
      await queues.trending.add('hashtag-extraction', {
        postId: post.id,
        hashtags: processedContent.entities.hashtags,
        postData: {
          postId: post.id,
          authorId: post.userId,
          createdAt: post.createdAt
        }
      });

      logger.debug('Hashtag job queued', {
        postId: post.id,
        hashtagCount: processedContent.entities.hashtags.length
      });
    }

    // 3. Queue indexing job (search)
    if (queues.indexing) {
      await queues.indexing.add('post-index', {
        postId: post.id,
        operation: 'index'
      });

      logger.debug('Indexing job queued', { postId: post.id });
    }

    // 4. Queue notification jobs (mentions)
    if (queues.notifications && processedContent.entities.mentions.length > 0) {
      const mentionNotifications = processedContent.entities.mentions.map(mention => ({
        type: 'mention',
        recipientUsername: mention.username,
        actorId: post.userId,
        postId: post.id,
        data: {
          postPreview: processedContent.metadata.preview
        }
      }));

      await queues.notifications.add('batch-notification', {
        notifications: mentionNotifications
      });

      logger.debug('Mention notifications queued', {
        postId: post.id,
        mentions: mentionNotifications.length
      });
    }

  } catch (error) {
    logger.error('Failed to queue post jobs:', {
      postId: post.id,
      error: error.message
    });
    // Don't throw - background jobs failing shouldn't fail post creation
  }
}

module.exports = {
  createPost,
  getPostById,
  getUserPosts,
  updatePost,
  deletePost,
  getPostStats,
  getPostThread,
  getQuotePosts,
  getUserLikes,
  getUserBookmarks
};
