/**
 * ═══════════════════════════════════════════════════════════
 * Socket.IO Handler
 * Real-time messaging with CA token authentication
 * ═══════════════════════════════════════════════════════════
 */

const { logger } = require('@exprsn/shared');
const { deriveServiceToken } = require('@exprsn/shared/utils/serviceToken');
const { getInternalHttpsAgent } = require('@exprsn/shared/utils/httpAgent');
const axios = require('axios');
const { Message, Conversation, Participant, MessageKey } = require('../models');
const config = require('../config');
const encryptionService = require('../services/encryptionService');
const messageModeration = require('../services/messageModeration');
const {
  authorizeConversationAccess,
  ensureParticipant
} = require('../services/groupChannelService');
const contactPolicy = require('../services/contactPolicy');

/**
 * Identity-bound service headers for CA calls. The CA's /api/tokens/validate
 * is guarded by requireSessionOrService, so the socket handshake must present
 * X-Service-ID/X-Service-Token (there is no browser session on the WS upgrade).
 * Returns {} when no service identity is configured so the CA still decides.
 */
function buildServiceHeaders() {
  const serviceId = process.env.SERVICE_ID || process.env.SERVICE_NAME;
  if (!serviceId) return {};
  try {
    return {
      'X-Service-ID': serviceId,
      'X-Service-Token': deriveServiceToken(serviceId)
    };
  } catch (error) {
    logger.warn('Service identity not available for CA socket auth', { error: error.message });
    return {};
  }
}

// In-platform notification ingest (HERALD_SERVICE_URL -> /moderator), which
// emits onto the moderator /notifications socket the SPA bell listens to.
const HERALD_URL = process.env.HERALD_SERVICE_URL || 'http://localhost:3014';

/**
 * Deliver one in-app notification via the moderator ingest endpoint. The moderator
 * route is `POST /api/notifications` (single `channel`, not `channels`) and is
 * guarded by the per-service HMAC token. Best-effort: never throws.
 */
async function notifyUser(userId, payload) {
  try {
    await axios.post(
      `${HERALD_URL}/api/notifications`,
      { userId, channel: 'in-app', ...payload },
      {
        timeout: 5000,
        httpsAgent: getInternalHttpsAgent(),
        headers: { 'Content-Type': 'application/json', ...buildServiceHeaders() }
      }
    );
  } catch (err) {
    logger.debug('notifyUser failed', { userId, error: err.message });
  }
}

/**
 * Notify a conversation's other active participants of a new message. Skips the
 * sender and muted participants; encrypted message text is never included in the
 * body (the recipient decrypts the real message in-app).
 */
async function notifyNewMessage({ conversationId, senderId, senderName, message }) {
  try {
    const conversation = await Conversation.findByPk(conversationId);
    const participants = await Participant.findAll({ where: { conversationId, active: true } });
    const title =
      conversation && conversation.type === 'group'
        ? `New message in ${conversation.name || 'group'}`
        : `New message from ${senderName || 'someone'}`;
    const body = message.encrypted
      ? 'Sent you an encrypted message'
      : (message.content || '').slice(0, 120);

    // FEAT-070 N2: beyond the sender + per-conversation mute filter, drop any
    // recipient whose relationship suppression set contains the sender
    // (blocked either way, or the recipient user-muted the sender). Fail-closed
    // inside the helper: a failed lookup drops the notification.
    const candidates = participants
      .filter((p) => p.userId !== senderId && !p.muted)
      .map((p) => p.userId);
    const notifiable = await contactPolicy.filterNotifiableRecipients(senderId, candidates);

    await Promise.all(
      notifiable.map((userId) =>
        notifyUser(userId, {
          type: 'message',
          title,
          body,
          data: { conversationId, messageId: message.id, senderId, type: 'message' }
        })
      )
    );
  } catch (err) {
    logger.debug('notifyNewMessage failed', { conversationId, error: err.message });
  }
}

// Active connections map (userId -> socket)
const activeConnections = new Map();

// Typing indicators map (conversationId -> Set of userIds)
const typingIndicators = new Map();

/**
 * Validate CA token via Socket.IO handshake
 */
async function validateSocketToken(socket) {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.substring(7);

    if (!token) {
      logger.warn('Socket connection attempted without token');
      return null;
    }

    // Validate with CA
    const response = await axios.post(
      `${config.ca.url}/api/tokens/validate`,
      {
        token,
        requiredPermissions: { read: true }
      },
      { timeout: 5000, headers: buildServiceHeaders() }
    );

    if (!response.data.valid) {
      logger.warn('Invalid socket token', { reason: response.data.reason });
      return null;
    }

    return {
      userId: response.data.userId,
      permissions: response.data.permissions,
      tokenData: response.data.tokenData
    };
  } catch (error) {
    logger.error('Socket token validation error', { error: error.message });
    return null;
  }
}

/**
 * Main Socket.IO handler
 */
module.exports = function(io) {
  /**
   * Middleware: Authenticate socket connections
   */
  io.use(async (socket, next) => {
    const auth = await validateSocketToken(socket);

    if (!auth) {
      return next(new Error('Authentication failed'));
    }

    socket.userId = auth.userId;
    socket.permissions = auth.permissions;
    socket.tokenData = auth.tokenData;

    next();
  });

  /**
   * Connection handler
   */
  io.on('connection', (socket) => {
    logger.info('Socket connected', {
      socketId: socket.id,
      userId: socket.userId
    });

    // Track active connection
    activeConnections.set(socket.userId, socket);

    // Emit online status to user's conversations
    emitUserOnlineStatus(socket.userId, true);

    /**
     * Join conversation rooms
     */
    socket.on('join:conversation', async (conversationId) => {
      try {
        const conversation = await Conversation.findByPk(conversationId);

        if (!conversation) {
          socket.emit('error', {
            event: 'join:conversation',
            message: 'Conversation not found'
          });
          return;
        }

        if (conversation.groupId) {
          // Group-bound: authorize LIVE against nexus membership so a stale
          // local Participant row can't grant access after removal.
          const access = await authorizeConversationAccess(conversation, socket.userId);
          if (!access.ok) {
            socket.emit('error', { event: 'join:conversation', message: access.message });
            return;
          }
          // Keep the local Participant row in sync (sync-on-access).
          await ensureParticipant(conversationId, socket.userId, access.role);
        } else {
          // Non-group: local Participant row governs.
          const participant = await Participant.findOne({
            where: { conversationId, userId: socket.userId, active: true }
          });
          if (!participant) {
            socket.emit('error', {
              event: 'join:conversation',
              message: 'Not a participant in this conversation'
            });
            return;
          }
        }

        // Join the room
        socket.join(`conversation:${conversationId}`);

        logger.info('User joined conversation', {
          userId: socket.userId,
          conversationId
        });

        socket.emit('joined:conversation', { conversationId });
      } catch (error) {
        logger.error('Error joining conversation', { error: error.message });
        socket.emit('error', {
          event: 'join:conversation',
          message: 'Failed to join conversation'
        });
      }
    });

    /**
     * Leave conversation rooms
     */
    socket.on('leave:conversation', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);

      logger.info('User left conversation', {
        userId: socket.userId,
        conversationId
      });

      socket.emit('left:conversation', { conversationId });
    });

    /**
     * Send message
     */
    socket.on('send:message', async (data) => {
      try {
        const {
          conversationId, content, contentType, parentMessageId, attachments, mentions,
          encrypted, encryptedContent, senderKeyFingerprint, recipientKeys
        } = data;

        // Verify write permission
        if (!socket.permissions.write) {
          socket.emit('error', {
            event: 'send:message',
            message: 'Insufficient permissions'
          });
          return;
        }

        const conversation = await Conversation.findByPk(conversationId);

        if (!conversation) {
          socket.emit('error', {
            event: 'send:message',
            message: 'Conversation not found'
          });
          return;
        }

        if (conversation.groupId) {
          // Group-bound: authorize LIVE against nexus membership and enforce the
          // announcement write restriction (admins/owners only).
          const access = await authorizeConversationAccess(
            conversation, socket.userId, { write: true }
          );
          if (!access.ok) {
            socket.emit('error', { event: 'send:message', message: access.message });
            return;
          }
          await ensureParticipant(conversationId, socket.userId, access.role);
        } else {
          // Non-group: local Participant row governs.
          const participant = await Participant.findOne({
            where: { conversationId, userId: socket.userId, active: true }
          });
          if (!participant) {
            socket.emit('error', {
              event: 'send:message',
              message: 'Not a participant in this conversation'
            });
            return;
          }
        }

        // FEAT-070 S2: block enforcement on the primary live send path. Direct
        // (1:1) only — group/group-bound conversations are exempt inside the
        // guard (ADR §3). Fail-closed: a failed relationship lookup rejects
        // the send with the generic failure, not the 403 contact message.
        try {
          await contactPolicy.assertCanContact(socket.userId, conversation);
        } catch (policyError) {
          socket.emit('error', {
            event: 'send:message',
            message: policyError instanceof contactPolicy.ContactForbiddenError
              ? policyError.message
              : 'Failed to send message'
          });
          return;
        }

        // Create message. For E2EE sends the client supplies encryptedContent +
        // senderKeyFingerprint and the model hook nulls out `content`.
        const message = await Message.create({
          conversationId,
          senderId: socket.userId,
          content: encrypted ? null : content,
          contentType: contentType || 'text',
          encrypted: !!encrypted,
          encryptedContent: encrypted ? encryptedContent : null,
          senderKeyFingerprint: encrypted ? senderKeyFingerprint : null,
          parentMessageId,
          attachments: attachments || [],
          mentions: mentions || []
        });

        // FEAT-009: pre-create the moderation side-row (pending for scannable
        // plaintext, skipped for E2EE/empty) BEFORE broadcasting, then
        // fire-and-forget the scoring job. Never blocks delivery (fail-open);
        // an adverse verdict retracts later via the sink.
        await messageModeration.moderateMessage(message, { mode: 'create' });

        // Emit onto the plugin hook bus (fire-and-forget, best-effort). Inert
        // unless PLUGINS_ENABLED/LOWCODE_ENABLED; lazily required + guarded so a
        // missing/erroring plugins module can't affect message delivery.
        try {
          const pluginHost = require('../../../plugins/src/services/pluginHost');
          pluginHost.emit('spark.message.created', {
            module: 'spark', userId: socket.userId,
            message: { id: message.id, conversationId, senderId: socket.userId, contentType: message.contentType, encrypted: !!message.encrypted },
          }).catch(() => {});
        } catch (_) { /* plugins module unavailable — ignore */ }

        // Persist per-recipient message keys BEFORE broadcasting new:message, so
        // recipients can fetch their key the instant the broadcast lands.
        if (encrypted && Array.isArray(recipientKeys) && recipientKeys.length > 0) {
          await encryptionService.storeMessageKeys(message.id, recipientKeys);
        }

        // Update conversation last message timestamp
        await Conversation.update(
          { lastMessageAt: new Date() },
          { where: { id: conversationId } }
        );

        // Clear typing indicator
        clearTypingIndicator(conversationId, socket.userId);

        // Emit to conversation room
        io.to(`conversation:${conversationId}`).emit('new:message', {
          ...message.toJSON(),
          sender: {
            id: socket.userId,
            displayName: socket.tokenData?.displayName || 'User'
          }
        });

        // In-app notification to the other participants' bells (fire-and-forget).
        notifyNewMessage({
          conversationId,
          senderId: socket.userId,
          senderName: socket.tokenData?.displayName,
          message
        });

        logger.info('Message sent', {
          messageId: message.id,
          conversationId,
          senderId: socket.userId
        });
      } catch (error) {
        logger.error('Error sending message', { error: error.message });
        socket.emit('error', {
          event: 'send:message',
          message: 'Failed to send message'
        });
      }
    });

    /**
     * Typing indicator
     */
    socket.on('typing:start', async (conversationId) => {
      try {
        // Verify participant
        const participant = await Participant.findOne({
          where: {
            conversationId,
            userId: socket.userId,
            active: true
          }
        });

        if (!participant) return;

        // FEAT-070: don't leak typing presence across a frozen 1:1 — in a
        // blocked pair the counterpart would otherwise see "typing" for a
        // message that can never arrive. Silent no-op (never an error) so
        // nothing reveals who blocked whom; false on lookup failure too.
        if (!(await contactPolicy.canContactInConversation(socket.userId, conversationId))) {
          return;
        }

        // Add to typing indicators
        if (!typingIndicators.has(conversationId)) {
          typingIndicators.set(conversationId, new Set());
        }
        typingIndicators.get(conversationId).add(socket.userId);

        // Broadcast to others in conversation
        socket.to(`conversation:${conversationId}`).emit('typing:start', {
          conversationId,
          userId: socket.userId,
          displayName: socket.tokenData?.displayName || 'User'
        });

        // Auto-clear after timeout
        setTimeout(() => {
          clearTypingIndicator(conversationId, socket.userId);
        }, config.messaging.typingIndicatorTimeout);
      } catch (error) {
        logger.error('Error with typing indicator', { error: error.message });
      }
    });

    socket.on('typing:stop', (conversationId) => {
      clearTypingIndicator(conversationId, socket.userId);
    });

    /**
     * Mark message as read
     */
    socket.on('mark:read', async (data) => {
      try {
        const { conversationId, messageId } = data;

        // Verify participant
        const participant = await Participant.findOne({
          where: {
            conversationId,
            userId: socket.userId,
            active: true
          }
        });

        if (!participant) return;

        // Update message read status
        const message = await Message.findByPk(messageId);

        if (message && !message.readBy.includes(socket.userId)) {
          message.readBy = [...message.readBy, socket.userId];
          await message.save();

          // Update participant last read
          participant.lastReadMessageId = messageId;
          participant.lastReadAt = new Date();
          await participant.save();

          // Emit read receipt to conversation
          io.to(`conversation:${conversationId}`).emit('read:receipt', {
            conversationId,
            messageId,
            userId: socket.userId
          });

          logger.info('Message marked as read', {
            messageId,
            userId: socket.userId
          });
        }
      } catch (error) {
        logger.error('Error marking message as read', { error: error.message });
      }
    });

    /**
     * React to message
     */
    socket.on('add:reaction', async (data) => {
      try {
        const { messageId, emoji } = data;

        const Reaction = require('../models').Reaction;

        // Create or update reaction
        const [reaction, created] = await Reaction.findOrCreate({
          where: { messageId, userId: socket.userId, emoji },
          defaults: { messageId, userId: socket.userId, emoji }
        });

        // Get message to find conversation
        const message = await Message.findByPk(messageId);

        if (message) {
          // Emit to conversation
          io.to(`conversation:${message.conversationId}`).emit('new:reaction', {
            messageId,
            userId: socket.userId,
            emoji,
            created
          });
        }
      } catch (error) {
        logger.error('Error adding reaction', { error: error.message });
      }
    });

    /**
     * Edit message
     */
    socket.on('edit:message', async (data) => {
      try {
        const { messageId, content, encryptedContent, senderKeyFingerprint, recipientKeys } = data;
        const isEncrypted = !!encryptedContent;

        // Verify write permission
        if (!socket.permissions.write) {
          socket.emit('error', {
            event: 'edit:message',
            message: 'Insufficient permissions'
          });
          return;
        }

        // Get message
        const message = await Message.findByPk(messageId);

        if (!message) {
          socket.emit('error', {
            event: 'edit:message',
            message: 'Message not found'
          });
          return;
        }

        // Verify ownership
        if (message.senderId !== socket.userId) {
          socket.emit('error', {
            event: 'edit:message',
            message: 'Can only edit your own messages'
          });
          return;
        }

        // Update message. For E2EE edits the client re-encrypts the content and
        // re-wraps the content key for every recipient; we replace the stored
        // per-recipient keys so stale keys for the previous ciphertext are gone.
        if (isEncrypted) {
          message.encrypted = true;
          message.encryptedContent = encryptedContent;
          message.senderKeyFingerprint = senderKeyFingerprint;
        } else {
          message.content = content;
        }
        message.edited = true;
        message.editedAt = new Date();
        await message.save();

        // FEAT-009: an EDIT re-moderates. mode:'reset' clears the stale verdict
        // AND removes the stale queue job (BUG-016) so the new text's verdict
        // cannot be pre-empted by the old one. Encrypted edits re-skip.
        await messageModeration.moderateMessage(message, { mode: 'reset' });

        if (isEncrypted && Array.isArray(recipientKeys) && recipientKeys.length > 0) {
          await MessageKey.destroy({ where: { messageId } });
          await encryptionService.storeMessageKeys(messageId, recipientKeys);
        }

        // Emit to conversation
        io.to(`conversation:${message.conversationId}`).emit('message:edited', {
          messageId,
          content: isEncrypted ? null : content,
          encrypted: isEncrypted,
          encryptedContent: isEncrypted ? encryptedContent : null,
          senderKeyFingerprint: isEncrypted ? senderKeyFingerprint : null,
          editedAt: message.editedAt
        });

        logger.info('Message edited', {
          messageId,
          userId: socket.userId
        });
      } catch (error) {
        logger.error('Error editing message', { error: error.message });
        socket.emit('error', {
          event: 'edit:message',
          message: 'Failed to edit message'
        });
      }
    });

    /**
     * Delete message
     */
    socket.on('delete:message', async (data) => {
      try {
        const { messageId } = data;

        // Verify delete permission
        if (!socket.permissions.delete) {
          socket.emit('error', {
            event: 'delete:message',
            message: 'Insufficient permissions'
          });
          return;
        }

        // Get message
        const message = await Message.findByPk(messageId);

        if (!message) {
          socket.emit('error', {
            event: 'delete:message',
            message: 'Message not found'
          });
          return;
        }

        // Verify ownership
        if (message.senderId !== socket.userId) {
          socket.emit('error', {
            event: 'delete:message',
            message: 'Can only delete your own messages'
          });
          return;
        }

        // Soft delete
        message.deleted = true;
        message.deletedAt = new Date();
        message.content = '[deleted]';
        await message.save();

        // Emit to conversation
        io.to(`conversation:${message.conversationId}`).emit('message:deleted', {
          messageId,
          deletedAt: message.deletedAt
        });

        logger.info('Message deleted', {
          messageId,
          userId: socket.userId
        });
      } catch (error) {
        logger.error('Error deleting message', { error: error.message });
        socket.emit('error', {
          event: 'delete:message',
          message: 'Failed to delete message'
        });
      }
    });

    /**
     * Update presence/status
     */
    socket.on('presence:update', async (data) => {
      try {
        const { status } = data; // online, away, busy, offline

        if (!['online', 'away', 'busy', 'offline'].includes(status)) {
          socket.emit('error', {
            event: 'presence:update',
            message: 'Invalid status'
          });
          return;
        }

        const presenceService = require('../services/presenceService');

        // Update presence
        await presenceService.setStatus(socket.userId, status);

        // Get user's conversations
        const participants = await Participant.findAll({
          where: { userId: socket.userId, active: true },
          attributes: ['conversationId']
        });

        const conversationIds = participants.map(p => p.conversationId);

        // Emit to all user's conversations
        conversationIds.forEach(convId => {
          io.to(`conversation:${convId}`).emit('user:status', {
            userId: socket.userId,
            status,
            updatedAt: new Date()
          });
        });

        logger.info('User presence updated', {
          userId: socket.userId,
          status
        });
      } catch (error) {
        logger.error('Error updating presence', { error: error.message });
        socket.emit('error', {
          event: 'presence:update',
          message: 'Failed to update presence'
        });
      }
    });

    /**
     * Disconnect handler
     */
    socket.on('disconnect', () => {
      logger.info('Socket disconnected', {
        socketId: socket.id,
        userId: socket.userId
      });

      // Remove from active connections
      activeConnections.delete(socket.userId);

      // Clear typing indicators
      typingIndicators.forEach((users, conversationId) => {
        if (users.has(socket.userId)) {
          clearTypingIndicator(conversationId, socket.userId);
        }
      });

      // Emit offline status
      emitUserOnlineStatus(socket.userId, false);
    });
  });

  /**
   * Helper: Clear typing indicator
   */
  function clearTypingIndicator(conversationId, userId) {
    if (typingIndicators.has(conversationId)) {
      typingIndicators.get(conversationId).delete(userId);

      io.to(`conversation:${conversationId}`).emit('typing:stop', {
        conversationId,
        userId
      });

      if (typingIndicators.get(conversationId).size === 0) {
        typingIndicators.delete(conversationId);
      }
    }
  }

  /**
   * Helper: Emit user online/offline status
   */
  async function emitUserOnlineStatus(userId, isOnline) {
    try {
      // Get user's conversations
      const participants = await Participant.findAll({
        where: { userId, active: true },
        attributes: ['conversationId']
      });

      const conversationIds = participants.map(p => p.conversationId);

      // Emit to each conversation
      conversationIds.forEach(convId => {
        io.to(`conversation:${convId}`).emit('user:status', {
          userId,
          status: isOnline ? 'online' : 'offline'
        });
      });
    } catch (error) {
      logger.error('Error emitting user status', { error: error.message });
    }
  }

  logger.info('Socket.IO handlers initialized');
};
