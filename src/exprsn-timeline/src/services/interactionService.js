/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Timeline - Interaction Service
 * ═══════════════════════════════════════════════════════════════════════
 */

const { Post, Like, Repost, Bookmark, Follow } = require('../models');
const logger = require('../utils/logger');

/**
 * Like a post
 */
async function likePost(userId, postId) {
  try {
    // Check if already liked
    const existing = await Like.findOne({
      where: { userId, postId }
    });

    if (existing) {
      throw new Error('Post already liked');
    }

    // Create like
    const like = await Like.create({ userId, postId });

    // Increment post like count
    await Post.increment('likeCount', { where: { id: postId } });

    logger.info('Post liked', { userId, postId });

    return like;
  } catch (error) {
    logger.error('Error liking post:', error);
    throw error;
  }
}

/**
 * Unlike a post
 */
async function unlikePost(userId, postId) {
  try {
    const like = await Like.findOne({
      where: { userId, postId }
    });

    if (!like) {
      throw new Error('Like not found');
    }

    await like.destroy();

    // Decrement post like count
    await Post.decrement('likeCount', { where: { id: postId } });

    logger.info('Post unliked', { userId, postId });

    return { success: true };
  } catch (error) {
    logger.error('Error unliking post:', error);
    throw error;
  }
}

/**
 * Repost a post
 */
async function repostPost(userId, postId) {
  try {
    // Check if already reposted
    const existing = await Repost.findOne({
      where: { userId, postId }
    });

    if (existing) {
      throw new Error('Post already reposted');
    }

    // Create repost
    const repost = await Repost.create({ userId, postId });

    // Increment post repost count
    await Post.increment('repostCount', { where: { id: postId } });

    logger.info('Post reposted', { userId, postId });

    return repost;
  } catch (error) {
    logger.error('Error reposting post:', error);
    throw error;
  }
}

/**
 * Undo repost
 */
async function undoRepost(userId, postId) {
  try {
    const repost = await Repost.findOne({
      where: { userId, postId }
    });

    if (!repost) {
      throw new Error('Repost not found');
    }

    await repost.destroy();

    // Decrement post repost count
    await Post.decrement('repostCount', { where: { id: postId } });

    logger.info('Repost undone', { userId, postId });

    return { success: true };
  } catch (error) {
    logger.error('Error undoing repost:', error);
    throw error;
  }
}

/**
 * Bookmark a post
 */
async function bookmarkPost(userId, postId) {
  try {
    // Check if already bookmarked
    const existing = await Bookmark.findOne({
      where: { userId, postId }
    });

    if (existing) {
      throw new Error('Post already bookmarked');
    }

    // Create bookmark
    const bookmark = await Bookmark.create({ userId, postId });

    logger.info('Post bookmarked', { userId, postId });

    return bookmark;
  } catch (error) {
    logger.error('Error bookmarking post:', error);
    throw error;
  }
}

/**
 * Remove bookmark
 */
async function removeBookmark(userId, postId) {
  try {
    const bookmark = await Bookmark.findOne({
      where: { userId, postId }
    });

    if (!bookmark) {
      throw new Error('Bookmark not found');
    }

    await bookmark.destroy();

    logger.info('Bookmark removed', { userId, postId });

    return { success: true };
  } catch (error) {
    logger.error('Error removing bookmark:', error);
    throw error;
  }
}

/**
 * Follow a user
 */
async function followUser(followerId, followingId) {
  try {
    if (followerId === followingId) {
      throw new Error('Cannot follow yourself');
    }

    // Check if already following
    const existing = await Follow.findOne({
      where: { followerId, followingId }
    });

    if (existing) {
      throw new Error('Already following this user');
    }

    // Create follow
    const follow = await Follow.create({ followerId, followingId });

    logger.info('User followed', { followerId, followingId });

    return follow;
  } catch (error) {
    logger.error('Error following user:', error);
    throw error;
  }
}

/**
 * Unfollow a user
 */
async function unfollowUser(followerId, followingId) {
  try {
    const follow = await Follow.findOne({
      where: { followerId, followingId }
    });

    if (!follow) {
      throw new Error('Not following this user');
    }

    await follow.destroy();

    logger.info('User unfollowed', { followerId, followingId });

    return { success: true };
  } catch (error) {
    logger.error('Error unfollowing user:', error);
    throw error;
  }
}

/**
 * Get user's bookmarks
 */
async function getUserBookmarks(userId, { limit = 20, offset = 0 } = {}) {
  try {
    const bookmarks = await Bookmark.findAll({
      where: { userId },
      include: [{ model: Post, as: 'post' }],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    return bookmarks.map(b => b.post);
  } catch (error) {
    logger.error('Error fetching bookmarks:', error);
    throw error;
  }
}

module.exports = {
  likePost,
  unlikePost,
  repostPost,
  undoRepost,
  bookmarkPost,
  removeBookmark,
  followUser,
  unfollowUser,
  getUserBookmarks
};
