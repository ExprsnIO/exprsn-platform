/**
 * ═══════════════════════════════════════════════════════════
 * Group Channel Routes (Phase 4)
 *
 * REST surface for nexus group-bound messaging. Channels are auto-provisioned
 * on first access (one 'chat' + one 'announcement' per group). Membership and
 * write authorization are resolved LIVE from nexus via requireGroupMembership /
 * the group channel service — not from local Participant rows.
 *
 * Mounted by src/index.js at: /spark/api/groups
 *
 * Real-time send/edit/typing/read still flow over the existing `/spark`
 * Socket.IO namespace; these REST endpoints are for listing channels and a
 * non-realtime (plaintext) post path that enforces the same rules. Group
 * channels are NOT E2E-encrypted (group key management is out of scope here).
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const {
  asyncHandler,
  AppError,
  validateCAToken,
  requireGroupMembership
} = require('@exprsn/shared');
const { Conversation, Message } = require('../models');
const messageModeration = require('../services/messageModeration');
const {
  CHANNEL_KINDS,
  ensureGroupChannels,
  ensureParticipant,
  canWriteChannel
} = require('../services/groupChannelService');

const router = express.Router();

// All group-channel routes require an authenticated user (sets req.userId).
router.use(validateCAToken({ requiredPermissions: ['read'] }));

/**
 * GET /spark/api/groups/:groupId/channels
 *
 * List (auto-provisioning if missing) the group's two channels and ensure the
 * requesting member has a Participant row in each.
 * Guard: CA token (read) + requireGroupMembership() (any active member).
 * Response: { groupId, channels: { chat, announcement } } where each channel is
 *   a Conversation augmented with `userRole` (the caller's nexus role).
 */
router.get(
  '/:groupId/channels',
  requireGroupMembership(),
  asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const nexusRole = req.groupMembership.role;

    const channels = await ensureGroupChannels(groupId, req.userId);

    await Promise.all(
      CHANNEL_KINDS.map((kind) =>
        ensureParticipant(channels[kind].id, req.userId, nexusRole)
      )
    );

    const shaped = {};
    for (const kind of CHANNEL_KINDS) {
      shaped[kind] = { ...channels[kind].toJSON(), userRole: nexusRole };
    }

    res.json({ groupId, channels: shaped });
  })
);

/**
 * POST /spark/api/groups/:groupId/channels/:channelKind/messages
 *
 * Post a (plaintext) message to a group channel.
 * Guard: CA token (write) + requireGroupMembership() (member). For the
 * 'announcement' channel, only admins/owners may post (enforced below).
 * Body: { content, contentType?, mentions? }
 * Response: 201 { message }
 */
router.post(
  '/:groupId/channels/:channelKind/messages',
  validateCAToken({ requiredPermissions: ['write'] }),
  requireGroupMembership(),
  asyncHandler(async (req, res) => {
    const { groupId, channelKind } = req.params;
    const { content, contentType, mentions } = req.body;

    if (!CHANNEL_KINDS.includes(channelKind)) {
      throw new AppError('Unknown channel kind', 404, 'NOT_FOUND');
    }
    if (!content || typeof content !== 'string' || !content.trim()) {
      throw new AppError('content is required', 400, 'VALIDATION_ERROR');
    }

    // Announcement write restriction — admins/owners only.
    if (!canWriteChannel(channelKind, req.groupMembership.role)) {
      throw new AppError(
        'Only group admins can post to the announcement channel',
        403,
        'ANNOUNCEMENT_ADMIN_ONLY'
      );
    }

    const channels = await ensureGroupChannels(groupId, req.userId);
    const conversation = channels[channelKind];

    await ensureParticipant(conversation.id, req.userId, req.groupMembership.role);

    const message = await Message.create({
      conversationId: conversation.id,
      senderId: req.userId,
      content,
      contentType: contentType || 'text',
      mentions: mentions || []
    });

    // FEAT-009: group-channel posts are PLAINTEXT — they get scanned. Pre-create
    // the moderation row + enqueue before broadcasting (fail-open delivery).
    await messageModeration.moderateMessage(message, { mode: 'create' });

    await Conversation.update(
      { lastMessageAt: new Date() },
      { where: { id: conversation.id } }
    );

    if (req.io) {
      req.io.of('/spark').to(`conversation:${conversation.id}`).emit('new:message', {
        ...message.toJSON(),
        sender: { id: req.userId }
      });
    }

    res.status(201).json({ message });
  })
);

module.exports = router;
