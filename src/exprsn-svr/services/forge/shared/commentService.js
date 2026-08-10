const { Op } = require('sequelize');
const { Comment } = require('../../../models/forge');
const logger = require('../../../utils/logger');
const workflowService = require('../workflowIntegrationService');

/**
 * Comment Service
 *
 * Handles comments for wiki pages, documents, tasks, and other entities
 */

/**
 * Create a comment
 */
async function createComment({
  entityType,
  entityId,
  content,
  contentFormat = 'markdown',
  authorId,
  parentCommentId = null,
  mentions = [],
  attachments = [],
  metadata = {}
}) {
  try {
    // Calculate depth if this is a reply
    let depth = 0;
    if (parentCommentId) {
      const parentComment = await Comment.findByPk(parentCommentId);
      if (!parentComment) {
        throw new Error('Parent comment not found');
      }
      depth = parentComment.depth + 1;
    }

    const comment = await Comment.create({
      entityType,
      entityId,
      content,
      contentFormat,
      authorId,
      parentCommentId,
      depth,
      mentions,
      attachments,
      metadata
    });

    logger.info('Comment created', {
      commentId: comment.id,
      entityType,
      entityId,
      authorId
    });

    return comment;
  } catch (error) {
    logger.error('Failed to create comment', {
      error: error.message,
      entityType,
      entityId
    });
    throw error;
  }
}

/**
 * Get comments for an entity
 */
async function getComments(entityType, entityId, options = {}) {
  try {
    const {
      parentCommentId = null,
      includeReplies = true,
      sortBy = 'createdAt',
      sortOrder = 'ASC',
      limit,
      offset = 0
    } = options;

    const where = {
      entityType,
      entityId,
      status: 'active'
    };

    // Get top-level comments or replies to specific comment
    if (!includeReplies) {
      where.parentCommentId = parentCommentId;
    }

    const queryOptions = {
      where,
      order: [[sortBy, sortOrder]],
      offset
    };

    if (limit) {
      queryOptions.limit = limit;
    }

    const comments = await Comment.findAll(queryOptions);

    // If including replies, build threaded structure
    if (includeReplies && !parentCommentId) {
      return buildCommentTree(comments);
    }

    logger.info('Comments retrieved', {
      entityType,
      entityId,
      count: comments.length
    });

    return comments;
  } catch (error) {
    logger.error('Failed to get comments', {
      error: error.message,
      entityType,
      entityId
    });
    throw error;
  }
}

/**
 * Get comment by ID
 */
async function getCommentById(commentId) {
  try {
    const comment = await Comment.findByPk(commentId);

    if (!comment) {
      throw new Error('Comment not found');
    }

    return comment;
  } catch (error) {
    logger.error('Failed to get comment', {
      error: error.message,
      commentId
    });
    throw error;
  }
}

/**
 * Update a comment
 */
async function updateComment(commentId, updates, userId) {
  try {
    const comment = await Comment.findByPk(commentId);

    if (!comment) {
      throw new Error('Comment not found');
    }

    // Only author can update
    if (comment.authorId !== userId) {
      throw new Error('Only the comment author can edit this comment');
    }

    // Deleted comments cannot be edited
    if (comment.status === 'deleted') {
      throw new Error('Cannot edit deleted comment');
    }

    const updateData = { ...updates };

    // Track edit history if content changed
    if (updates.content && updates.content !== comment.content) {
      const editHistory = comment.editHistory || [];
      editHistory.push({
        content: comment.content,
        editedAt: new Date()
      });

      updateData.editHistory = editHistory;
      updateData.isEdited = true;
      updateData.lastEditedAt = new Date();
    }

    await comment.update(updateData);

    logger.info('Comment updated', {
      commentId,
      userId
    });

    return comment;
  } catch (error) {
    logger.error('Failed to update comment', {
      error: error.message,
      commentId
    });
    throw error;
  }
}

/**
 * Delete a comment
 */
async function deleteComment(commentId, userId, hardDelete = false) {
  try {
    const comment = await Comment.findByPk(commentId);

    if (!comment) {
      throw new Error('Comment not found');
    }

    // Only author can delete
    if (comment.authorId !== userId) {
      throw new Error('Only the comment author can delete this comment');
    }

    if (hardDelete) {
      await comment.destroy();
    } else {
      await comment.softDelete(userId);
    }

    logger.info('Comment deleted', {
      commentId,
      userId,
      hardDelete
    });

    return { success: true };
  } catch (error) {
    logger.error('Failed to delete comment', {
      error: error.message,
      commentId
    });
    throw error;
  }
}

/**
 * Add reaction to comment
 */
async function addReaction(commentId, emoji, userId) {
  try {
    const comment = await Comment.findByPk(commentId);

    if (!comment) {
      throw new Error('Comment not found');
    }

    if (comment.status !== 'active') {
      throw new Error('Cannot react to this comment');
    }

    await comment.addReaction(emoji, userId);

    logger.info('Reaction added to comment', {
      commentId,
      emoji,
      userId
    });

    return comment;
  } catch (error) {
    logger.error('Failed to add reaction', {
      error: error.message,
      commentId
    });
    throw error;
  }
}

/**
 * Remove reaction from comment
 */
async function removeReaction(commentId, emoji, userId) {
  try {
    const comment = await Comment.findByPk(commentId);

    if (!comment) {
      throw new Error('Comment not found');
    }

    await comment.removeReaction(emoji, userId);

    logger.info('Reaction removed from comment', {
      commentId,
      emoji,
      userId
    });

    return comment;
  } catch (error) {
    logger.error('Failed to remove reaction', {
      error: error.message,
      commentId
    });
    throw error;
  }
}

/**
 * Flag comment for moderation
 */
async function flagComment(commentId, reason, userId) {
  try {
    const comment = await Comment.findByPk(commentId);

    if (!comment) {
      throw new Error('Comment not found');
    }

    if (comment.status === 'deleted') {
      throw new Error('Cannot flag deleted comment');
    }

    await comment.flag(reason, userId);

    // Trigger moderation workflow
    await workflowService.triggerCommentFlaggedWorkflow(comment, userId);

    logger.warn('Comment flagged', {
      commentId,
      reason,
      flaggedBy: userId
    });

    return comment;
  } catch (error) {
    logger.error('Failed to flag comment', {
      error: error.message,
      commentId
    });
    throw error;
  }
}

/**
 * Unflag comment (moderator action)
 */
async function unflagComment(commentId, moderatorId) {
  try {
    const comment = await Comment.findByPk(commentId);

    if (!comment) {
      throw new Error('Comment not found');
    }

    await comment.update({
      isFlagged: false,
      flagReason: null,
      flaggedById: null,
      flaggedAt: null,
      status: 'active'
    });

    logger.info('Comment unflagged', {
      commentId,
      moderatorId
    });

    return comment;
  } catch (error) {
    logger.error('Failed to unflag comment', {
      error: error.message,
      commentId
    });
    throw error;
  }
}

/**
 * Get flagged comments for moderation
 */
async function getFlaggedComments(options = {}) {
  try {
    const {
      limit = 50,
      offset = 0,
      sortBy = 'flaggedAt',
      sortOrder = 'DESC'
    } = options;

    const comments = await Comment.findAll({
      where: {
        isFlagged: true,
        status: 'flagged'
      },
      order: [[sortBy, sortOrder]],
      limit,
      offset
    });

    logger.info('Flagged comments retrieved', {
      count: comments.length
    });

    return comments;
  } catch (error) {
    logger.error('Failed to get flagged comments', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Get comment count for an entity
 */
async function getCommentCount(entityType, entityId) {
  try {
    const count = await Comment.count({
      where: {
        entityType,
        entityId,
        status: 'active'
      }
    });

    return count;
  } catch (error) {
    logger.error('Failed to get comment count', {
      error: error.message,
      entityType,
      entityId
    });
    throw error;
  }
}

/**
 * Get user's comments
 */
async function getUserComments(userId, options = {}) {
  try {
    const {
      entityType,
      limit = 50,
      offset = 0,
      includeDeleted = false
    } = options;

    const where = {
      authorId: userId
    };

    if (entityType) {
      where.entityType = entityType;
    }

    if (!includeDeleted) {
      where.status = 'active';
    }

    const comments = await Comment.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    logger.info('User comments retrieved', {
      userId,
      count: comments.length
    });

    return comments;
  } catch (error) {
    logger.error('Failed to get user comments', {
      error: error.message,
      userId
    });
    throw error;
  }
}

/**
 * Get comment thread (parent + all descendants)
 */
async function getCommentThread(commentId) {
  try {
    const rootComment = await Comment.findByPk(commentId);

    if (!rootComment) {
      throw new Error('Comment not found');
    }

    const thread = [rootComment];
    const descendants = await getCommentDescendants(commentId);
    thread.push(...descendants);

    return thread;
  } catch (error) {
    logger.error('Failed to get comment thread', {
      error: error.message,
      commentId
    });
    throw error;
  }
}

// Helper functions

/**
 * Build threaded comment tree structure
 */
function buildCommentTree(comments) {
  const commentMap = new Map();
  const rootComments = [];

  // First pass: create map
  comments.forEach(comment => {
    commentMap.set(comment.id, {
      ...comment.toJSON(),
      replies: []
    });
  });

  // Second pass: build tree
  comments.forEach(comment => {
    const commentNode = commentMap.get(comment.id);
    if (comment.parentCommentId) {
      const parent = commentMap.get(comment.parentCommentId);
      if (parent) {
        parent.replies.push(commentNode);
      }
    } else {
      rootComments.push(commentNode);
    }
  });

  return rootComments;
}

/**
 * Get all descendant comments recursively
 */
async function getCommentDescendants(commentId) {
  const children = await Comment.findAll({
    where: {
      parentCommentId: commentId,
      status: 'active'
    },
    order: [['createdAt', 'ASC']]
  });

  const descendants = [...children];

  for (const child of children) {
    const childDescendants = await getCommentDescendants(child.id);
    descendants.push(...childDescendants);
  }

  return descendants;
}

module.exports = {
  createComment,
  getComments,
  getCommentById,
  updateComment,
  deleteComment,
  addReaction,
  removeReaction,
  flagComment,
  unflagComment,
  getFlaggedComments,
  getCommentCount,
  getUserComments,
  getCommentThread
};
