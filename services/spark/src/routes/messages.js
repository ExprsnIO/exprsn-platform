/**
 * ═══════════════════════════════════════════════════════════
 * Message Routes
 * Message retrieval and management endpoints
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const { asyncHandler, AppError, validateCAToken, validatePagination } = require('@exprsn/shared');
const { Message, Participant, Reaction } = require('../models');
const messageModeration = require('../services/messageModeration');
const contactPolicy = require('../services/contactPolicy');

const router = express.Router();

// All message routes require authentication
router.use(validateCAToken({ requiredPermissions: ['read'] }));

/**
 * GET /api/messages/:conversationId
 * Get conversation messages
 */
router.get('/:conversationId', asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const { page, limit, offset } = validatePagination(req.query);
  const { before, after } = req.query; // Message ID for pagination

  // Check if user is participant
  const participant = await Participant.findOne({
    where: {
      conversationId,
      userId: req.userId,
      active: true
    }
  });

  if (!participant) {
    throw new AppError('Not a participant in this conversation', 403, 'FORBIDDEN');
  }

  const where = {
    conversationId,
    deleted: false
  };

  // FEAT-070 S5: filter messages from suppressed senders (blocked either way
  // ∪ viewer's unexpired mutes) — one set-returning façade call per request,
  // then [Op.notIn] (the ADR read-path shape; no per-message checks).
  const suppressed = await contactPolicy.getSuppressedIds(req.userId);
  if (suppressed.length > 0) {
    where.senderId = { [require('sequelize').Op.notIn]: suppressed };
  }

  // Cursor-based pagination
  if (before) {
    const beforeMessage = await Message.findByPk(before);
    if (beforeMessage) {
      where.createdAt = { [require('sequelize').Op.lt]: beforeMessage.createdAt };
    }
  } else if (after) {
    const afterMessage = await Message.findByPk(after);
    if (afterMessage) {
      where.createdAt = { [require('sequelize').Op.gt]: afterMessage.createdAt };
    }
  }

  const messages = await Message.findAll({
    where,
    include: [
      {
        model: Reaction,
        as: 'reactions'
      }
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset
  });

  res.json({
    messages,
    pagination: {
      page,
      limit,
      hasMore: messages.length === limit
    }
  });
}));

/**
 * GET /api/messages/:conversationId/search
 * Search messages in conversation
 *
 * BUG (found while building TASK-060): this MUST be registered before the
 * `/:conversationId/:messageId` routes below — Express matches routes in
 * REGISTRATION order, not by literal-vs-param specificity, so a two-segment
 * path like `/c1/search` would otherwise match `:messageId` first (treating
 * "search" as a message id) and this handler — along with its S5 filter —
 * would never run.
 */
router.get('/:conversationId/search', asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const { q, limit = 20 } = req.query;

  // Check if user is participant
  const participant = await Participant.findOne({
    where: {
      conversationId,
      userId: req.userId,
      active: true
    }
  });

  if (!participant) {
    throw new AppError('Not a participant in this conversation', 403, 'FORBIDDEN');
  }

  const where = {
    conversationId,
    content: {
      [require('sequelize').Op.iLike]: `%${q}%`
    },
    deleted: false
  };

  // TASK-060 (FEAT-070 S5 extension): same suppressed-sender filter as
  // GET /:conversationId — [Op.notIn], one façade call per request.
  const suppressed = await contactPolicy.getSuppressedIds(req.userId);
  if (suppressed.length > 0) {
    where.senderId = { [require('sequelize').Op.notIn]: suppressed };
  }

  const messages = await Message.findAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: parseInt(limit)
  });

  res.json({ messages });
}));

/**
 * GET /api/messages/:conversationId/:messageId
 * Get single message
 */
router.get('/:conversationId/:messageId', asyncHandler(async (req, res) => {
  const { conversationId, messageId } = req.params;

  // Check if user is participant
  const participant = await Participant.findOne({
    where: {
      conversationId,
      userId: req.userId,
      active: true
    }
  });

  if (!participant) {
    throw new AppError('Not a participant in this conversation', 403, 'FORBIDDEN');
  }

  const message = await Message.findOne({
    where: {
      id: messageId,
      conversationId
    },
    include: [
      {
        model: Reaction,
        as: 'reactions'
      },
      {
        model: Message,
        as: 'replies'
      }
    ]
  });

  if (!message) {
    throw new AppError('Message not found', 404, 'NOT_FOUND');
  }

  // FEAT-070 S5: a single suppressed-sender message reads as absent (404) —
  // same shape as timeline's R9 post-detail, and no oracle about why.
  const suppressedIds = await contactPolicy.getSuppressedIds(req.userId);
  if (suppressedIds.includes(message.senderId)) {
    throw new AppError('Message not found', 404, 'NOT_FOUND');
  }

  res.json({ message });
}));

/**
 * PUT /api/messages/:conversationId/:messageId
 * Edit message
 */
router.put('/:conversationId/:messageId', validateCAToken({ requiredPermissions: ['update'] }), asyncHandler(async (req, res) => {
  const { conversationId, messageId } = req.params;
  const { content } = req.body;

  const message = await Message.findOne({
    where: {
      id: messageId,
      conversationId,
      senderId: req.userId, // Can only edit own messages
      deleted: false
    }
  });

  if (!message) {
    throw new AppError('Message not found or cannot be edited', 404, 'NOT_FOUND');
  }

  message.content = content;
  message.edited = true;
  message.editedAt = new Date();
  await message.save();

  // FEAT-009: this REST edit is a live message-content ingress — the new bytes
  // MUST be re-scored. mode:'reset' re-establishes the side-row with a fresh
  // content_hash+cleared verdict AND removes the stale queue job (BUG-016/018),
  // matching the socket edit:message path. Fail-open: never throws into the
  // request, so delivery/response is unaffected.
  await messageModeration.moderateMessage(message, { mode: 'reset' });

  // Emit update via Socket.IO
  if (req.io) {
    req.io.to(`conversation:${conversationId}`).emit('message:edited', {
      messageId,
      content,
      editedAt: message.editedAt
    });
  }

  res.json({ message });
}));

/**
 * DELETE /api/messages/:conversationId/:messageId
 * Delete message
 */
router.delete('/:conversationId/:messageId', validateCAToken({ requiredPermissions: ['delete'] }), asyncHandler(async (req, res) => {
  const { conversationId, messageId } = req.params;

  const message = await Message.findOne({
    where: {
      id: messageId,
      conversationId,
      senderId: req.userId, // Can only delete own messages
      deleted: false
    }
  });

  if (!message) {
    throw new AppError('Message not found or cannot be deleted', 404, 'NOT_FOUND');
  }

  message.deleted = true;
  message.deletedAt = new Date();
  await message.save();

  // Emit deletion via Socket.IO
  if (req.io) {
    req.io.to(`conversation:${conversationId}`).emit('message:deleted', {
      messageId
    });
  }

  res.json({ message: 'Message deleted successfully' });
}));

/**
 * GET /api/messages/search/suggestions
 * Get autocomplete suggestions for message search
 *
 * INTENTIONALLY registered AFTER `/:conversationId/:messageId` above, so this
 * route stays SHADOWED (dead — `GET /search/suggestions` always matches
 * `:messageId` first, treating "search" as a conversationId and
 * "suggestions" as a messageId, and 404s) until BUG-060 is fixed. Do not
 * move this above `:messageId` without fixing BUG-060 first: as written,
 * this handler (a) calls `searchService.getSuggestions(q, { userId,
 * conversationId, limit })`, but the service's real signature is
 * `getSuggestions(query, conversationIds, limit)` — the options object lands
 * in the ES terms clause, throws, and every call falls into the DB fallback
 * below; and (b) that fallback, when `conversationId` is omitted, searches
 * message content across ALL conversations of ALL users with no participant
 * scoping and no FEAT-070 S5 suppressed-sender filter — a cross-conversation
 * content leak. See BUG-060 (sr review of TASK-060, 2026-07-28).
 */
router.get('/search/suggestions', asyncHandler(async (req, res) => {
  const { q, conversationId, limit = 10 } = req.query;

  if (!q || q.length < 2) {
    return res.json({ suggestions: [] });
  }

  // If conversationId provided, check participation
  if (conversationId) {
    const participant = await Participant.findOne({
      where: {
        conversationId,
        userId: req.userId,
        active: true
      }
    });

    if (!participant) {
      throw new AppError('Not a participant in this conversation', 403, 'FORBIDDEN');
    }
  }

  // Use search service if available
  try {
    const searchService = require('../services/searchService');

    const suggestions = await searchService.getSuggestions(q, {
      userId: req.userId,
      conversationId,
      limit: parseInt(limit)
    });

    res.json({ suggestions });
  } catch (error) {
    // Fallback to basic database search
    const where = {
      content: {
        [require('sequelize').Op.iLike]: `%${q}%`
      },
      deleted: false
    };

    if (conversationId) {
      where.conversationId = conversationId;
    }

    const messages = await Message.findAll({
      where,
      attributes: ['id', 'content', 'conversationId'],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      group: ['content']
    });

    const suggestions = messages.map(m => ({
      text: m.content.substring(0, 100),
      conversationId: m.conversationId
    }));

    res.json({ suggestions });
  }
}));

module.exports = router;
