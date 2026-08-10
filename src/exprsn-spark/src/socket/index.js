/**
 * ═══════════════════════════════════════════════════════════
 * Socket.IO Handler
 * Real-time messaging with CA token authentication
 * ═══════════════════════════════════════════════════════════
 */

const { logger } = require('@exprsn/shared');
const axios = require('axios');
const { Message, Conversation, Participant } = require('../models');
const config = require('../config');

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
      { timeout: 5000 }
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
        // Check if user is participant
        const participant = await Participant.findOne({
          where: {
            conversationId,
            userId: socket.userId,
            active: true
          }
        });

        if (!participant) {
          socket.emit('error', {
            event: 'join:conversation',
            message: 'Not a participant in this conversation'
          });
          return;
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
        const { conversationId, content, contentType, parentMessageId, attachments, mentions } = data;

        // Verify write permission
        if (!socket.permissions.write) {
          socket.emit('error', {
            event: 'send:message',
            message: 'Insufficient permissions'
          });
          return;
        }

        // Verify participant
        const participant = await Participant.findOne({
          where: {
            conversationId,
            userId: socket.userId,
            active: true
          }
        });

        if (!participant) {
          socket.emit('error', {
            event: 'send:message',
            message: 'Not a participant in this conversation'
          });
          return;
        }

        // Create message
        const message = await Message.create({
          conversationId,
          senderId: socket.userId,
          content,
          contentType: contentType || 'text',
          parentMessageId,
          attachments: attachments || [],
          mentions: mentions || []
        });

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
        const { messageId, content } = data;

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

        // Update message
        message.content = content;
        message.edited = true;
        message.editedAt = new Date();
        await message.save();

        // Emit to conversation
        io.to(`conversation:${message.conversationId}`).emit('message:edited', {
          messageId,
          content,
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
