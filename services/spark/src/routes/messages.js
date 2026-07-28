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
 * GET /api/messages/search/suggestions
 * Get autocomplete suggestions for message search
 *
 * BUG-060: registered here (BEFORE `/:conversationId/:messageId` below) now
 * that the handler is scoped/filtered and safe — see the route's own doc
 * comment for the two fixes. Express matches by REGISTRATION order, so this
 * MUST stay ahead of `:messageId` or a two-segment `/search/suggestions`
 * path resolves as conversationId="search", messageId="suggestions" instead.
 */
router.get('/search/suggestions', asyncHandler(async (req, res) => {
  const { q, conversationId, limit = 10 } = req.query;

  if (!q || q.length < 2) {
    return res.json({ suggestions: [] });
  }

  // FEAT-070/BUG-060: scope to conversations the caller actually participates
  // in — never search across other users' conversations. A supplied
  // conversationId is verified and narrowed to just that one (matching every
  // other route above); omitted, it's every conversation the caller is an
  // active participant of.
  let scopedConversationIds;
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
    scopedConversationIds = [conversationId];
  } else {
    const participantRows = await Participant.findAll({
      where: { userId: req.userId, active: true },
      attributes: ['conversationId']
    });
    scopedConversationIds = [...new Set(participantRows.map((p) => p.conversationId))];
  }

  if (scopedConversationIds.length === 0) {
    return res.json({ suggestions: [] });
  }

  // FEAT-070 S5: same suppressed-sender filter (blocked either way ∪ viewer's
  // unexpired mutes) as every other message route — one façade call per
  // request.
  const suppressed = await contactPolicy.getSuppressedIds(req.userId);

  // Use search service if available
  try {
    const searchService = require('../services/searchService');

    // BUG-060: the real signature is (query, conversationIds, limit) — an
    // array, not an options object (the options object silently landed in
    // the ES `terms` clause where an array is expected, threw, and every call
    // fell into the DB fallback below).
    const rawSuggestions = await searchService.getSuggestions(
      q,
      scopedConversationIds,
      parseInt(limit)
    );

    const suggestions = suppressed.length > 0
      ? rawSuggestions.filter((s) => !suppressed.includes(s.senderId))
      : rawSuggestions;

    res.json({ suggestions });
  } catch (error) {
    // Fallback to basic database search — same conversation scoping + S5
    // filter as the ES path above (never unscoped, never unfiltered).
    const { Op } = require('sequelize');
    const where = {
      conversationId: { [Op.in]: scopedConversationIds },
      content: {
        [Op.iLike]: `%${q}%`
      },
      deleted: false
    };

    if (suppressed.length > 0) {
      where.senderId = { [Op.notIn]: suppressed };
    }

    const messages = await Message.findAll({
      where,
      attributes: ['id', 'content', 'conversationId'],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit)
    });

    const suggestions = messages.map(m => ({
      text: m.content.substring(0, 100),
      conversationId: m.conversationId
    }));

    res.json({ suggestions });
  }
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

module.exports = router;
