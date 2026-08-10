const { Op } = require('sequelize');
const { Comment } = require('../../../models/forge');
const logger = require('../../../utils/logger');

/**
 * Comment Service
 *
 * Universal commenting system for all groupware entities
 * Supports threading, reactions, mentions, and moderation
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
  attachments = []
}) {
  try {
    // Validate entity type
    const validTypes = ['wiki_page', 'document', 'task', 'board_card', 'note'];
    if (!validTypes.includes(entityType)) {
      throw new Error(`Invalid entity type: ${entityType}`);
    }

    // Calculate depth for threading
    let depth = 0;
    if (parentCommentId) {
      const parentComment = await Comment.findByPk(parentCommentId);
      if (!parentComment) {
        throw new Error(`Parent comment not found: ${parentCommentId}`);
      }
      depth = parentComment.depth + 1;

      // Limit nesting depth to 5 levels
      if (depth > 5) {
        throw new Error('Maximum comment nesting depth (5) exceeded');
      }
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
      attachments
    });

    logger.info('Comment created', {
      commentId: comment.id,
      entityType,
      entityId,
      authorId,
      depth
    });

    return comment;
  } catch (error) {
    logger.error('Failed to create comment', {
      entityType,
      entityId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get comments for an entity
 */
async function getComments({
  entityType,
  entityId,
  includeDeleted = false,
  limit = 50,
  offset = 0,
  sortBy = 'createdAt',
  sortOrder = 'ASC'
}) {
  try {
    const where = {
      entityType,
      entityId
    };

    if (!includeDeleted) {
      where.status = {
        [Op.in]: ['active', 'flagged']
      };
    }

    const { count, rows } = await Comment.findAndCountAll({
      where,
      limit,
      offset,
      order: [[sortBy, sortOrder]]
    });

    // Build threaded structure
    const comments = buildCommentTree(rows);

    return {
      comments,
      total: count,
      limit,
      offset
    };
  } catch (error) {
    logger.error('Failed to get comments', {
      entityType,
      entityId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Build threaded comment tree
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
    const commentObj = commentMap.get(comment.id);
    if (comment.parentCommentId) {
      const parent = commentMap.get(comment.parentCommentId);
      if (parent) {
        parent.replies.push(commentObj);
      } else {
        // Parent not in this batch, treat as root
        rootComments.push(commentObj);
      }
    } else {
      rootComments.push(commentObj);
    }
  });

  return rootComments;
}

/**
 * Update a comment
 */
async function updateComment(commentId, { content, contentFormat }, userId) {
  try {
    const comment = await Comment.findByPk(commentId);
    if (!comment) {
      throw new Error(`Comment not found: ${commentId}`);
    }

    // Check ownership
    if (comment.authorId !== userId) {
      throw new Error('Only comment author can edit comment');
    }

    // Save edit history
    const editHistory = comment.editHistory || [];
    editHistory.push({
      content: comment.content,
      editedAt: new Date()
    });

    await comment.update({
      content,
      contentFormat: contentFormat || comment.contentFormat,
      isEdited: true,
      lastEditedAt: new Date(),
      editHistory
    });

    logger.info('Comment updated', {
      commentId,
      userId
    });

    return comment;
  } catch (error) {
    logger.error('Failed to update comment', {
      commentId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Delete a comment (soft delete)
 */
async function deleteComment(commentId, userId) {
  try {
    const comment = await Comment.findByPk(commentId);
    if (!comment) {
      throw new Error(`Comment not found: ${commentId}`);
    }

    // Check ownership (or admin permission would be checked in route)
    if (comment.authorId !== userId) {
      throw new Error('Only comment author can delete comment');
    }

    await comment.softDelete(userId);

    logger.info('Comment deleted', {
      commentId,
      userId
    });

    return comment;
  } catch (error) {
    logger.error('Failed to delete comment', {
      commentId,
      error: error.message
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
      throw new Error(`Comment not found: ${commentId}`);
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
      commentId,
      error: error.message
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
      throw new Error(`Comment not found: ${commentId}`);
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
      commentId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Flag comment for moderation
 */
async function flagComment(commentId, reason, flaggedBy) {
  try {
    const comment = await Comment.findByPk(commentId);
    if (!comment) {
      throw new Error(`Comment not found: ${commentId}`);
    }

    await comment.flag(reason, flaggedBy);

    logger.info('Comment flagged', {
      commentId,
      reason,
      flaggedBy
    });

    return comment;
  } catch (error) {
    logger.error('Failed to flag comment', {
      commentId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get comment statistics for an entity
 */
async function getCommentStats(entityType, entityId) {
  try {
    const stats = await Comment.findOne({
      where: {
        entityType,
        entityId,
        status: {
          [Op.in]: ['active', 'flagged']
        }
      },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalComments'],
        [sequelize.fn('COUNT', sequelize.literal("CASE WHEN depth = 0 THEN 1 END")), 'topLevelComments'],
        [sequelize.fn('SUM', sequelize.col('reaction_count')), 'totalReactions']
      ],
      raw: true
    });

    return {
      totalComments: parseInt(stats.totalComments) || 0,
      topLevelComments: parseInt(stats.topLevelComments) || 0,
      totalReactions: parseInt(stats.totalReactions) || 0
    };
  } catch (error) {
    logger.error('Failed to get comment stats', {
      entityType,
      entityId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get recent comments for multiple entities
 */
async function getRecentComments({
  entityType,
  entityIds,
  limit = 10,
  includeDeleted = false
}) {
  try {
    const where = {
      entityType,
      entityId: {
        [Op.in]: entityIds
      }
    };

    if (!includeDeleted) {
      where.status = {
        [Op.in]: ['active', 'flagged']
      };
    }

    const comments = await Comment.findAll({
      where,
      limit,
      order: [['createdAt', 'DESC']]
    });

    return comments;
  } catch (error) {
    logger.error('Failed to get recent comments', {
      entityType,
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  createComment,
  getComments,
  updateComment,
  deleteComment,
  addReaction,
  removeReaction,
  flagComment,
  getCommentStats,
  getRecentComments
};
