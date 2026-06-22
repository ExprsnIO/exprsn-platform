/**
 * Enhanced Message Routes
 * Threading, forwarding, pinning, and settings
 */

const express = require('express');
const { createLogger } = require('@exprsn/shared');
const { requireAuth } = require('../middleware/auth');
const db = require('../models');

const router = express.Router();
const logger = createLogger('exprsn-spark:enhanced');

const { Message, Conversation, Participant } = db;

/**
 * POST /api/messages/:id/forward
 * Forward message to other conversations
 */
router.post('/:id/forward',
  requireAuth,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { conversationIds, content } = req.body;
      const userId = req.user.id;

      if (!conversationIds || !Array.isArray(conversationIds) || conversationIds.length === 0) {
        return res.status(400).json({ error: 'Conversation IDs required' });
      }

      // Get original message
      const originalMessage = await Message.findByPk(id);
      if (!originalMessage) {
        return res.status(404).json({ error: 'Message not found' });
      }

      // Verify user has access to original message
      const originalParticipant = await Participant.findOne({
        where: {
          conversationId: originalMessage.conversationId,
          userId,
          active: true
        }
      });

      if (!originalParticipant) {
        return res.status(403).json({ error: 'Not authorized to forward this message' });
      }

      // Forward to each conversation
      const forwardedMessages = [];

      for (const conversationId of conversationIds) {
        // Verify user is participant in target conversation
        const participant = await Participant.findOne({
          where: {
            conversationId,
            userId,
            active: true
          }
        });

        if (!participant) {
          logger.warn('User not participant in target conversation', {
            userId,
            conversationId
          });
          continue;
        }

        // Create forwarded message
        const forwardedMessage = await Message.create({
          conversationId,
          senderId: userId,
          content: content || originalMessage.content,
          contentType: originalMessage.contentType,
          forwardedFrom: originalMessage.id,
          attachments: originalMessage.attachments,
          metadata: {
            ...originalMessage.metadata,
            forwarded: true,
            originalSender: originalMessage.senderId
          }
        });

        forwardedMessages.push(forwardedMessage);

        // Emit socket event
        if (req.io) {
          req.io.to(`conversation:${conversationId}`).emit('message:new', {
            message: forwardedMessage,
            conversationId
          });
        }
      }

      logger.info('Message forwarded', {
        originalMessageId: id,
        userId,
        targetCount: forwardedMessages.length
      });

      res.json({
        success: true,
        forwardedCount: forwardedMessages.length,
        messages: forwardedMessages
      });
    } catch (error) {
      logger.error('Failed to forward message', {
        messageId: req.params.id,
        error: error.message
      });
      res.status(500).json({ error: 'Failed to forward message' });
    }
  }
);

/**
 * POST /api/messages/:id/pin
 * Pin message in conversation
 */
router.post('/:id/pin',
  requireAuth,
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const message = await Message.findByPk(id);
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      // Verify user is admin or owner
      const participant = await Participant.findOne({
        where: {
          conversationId: message.conversationId,
          userId,
          active: true
        }
      });

      if (!participant || !['owner', 'admin'].includes(participant.role)) {
        return res.status(403).json({ error: 'Only admins can pin messages' });
      }

      // Pin message
      await message.update({
        isPinned: true,
        pinnedAt: new Date(),
        pinnedBy: userId
      });

      // Emit socket event
      if (req.io) {
        req.io.to(`conversation:${message.conversationId}`).emit('message:pinned', {
          messageId: id,
          conversationId: message.conversationId,
          pinnedBy: userId
        });
      }

      logger.info('Message pinned', {
        messageId: id,
        conversationId: message.conversationId,
        userId
      });

      res.json({
        success: true,
        message: {
          id: message.id,
          isPinned: true,
          pinnedAt: message.pinnedAt,
          pinnedBy: message.pinnedBy
        }
      });
    } catch (error) {
      logger.error('Failed to pin message', {
        messageId: req.params.id,
        error: error.message
      });
      res.status(500).json({ error: 'Failed to pin message' });
    }
  }
);

/**
 * POST /api/messages/:id/unpin
 * Unpin message
 */
router.post('/:id/unpin',
  requireAuth,
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const message = await Message.findByPk(id);
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      // Verify user is admin or owner
      const participant = await Participant.findOne({
        where: {
          conversationId: message.conversationId,
          userId,
          active: true
        }
      });

      if (!participant || !['owner', 'admin'].includes(participant.role)) {
        return res.status(403).json({ error: 'Only admins can unpin messages' });
      }

      // Unpin message
      await message.update({
        isPinned: false,
        pinnedAt: null,
        pinnedBy: null
      });

      // Emit socket event
      if (req.io) {
        req.io.to(`conversation:${message.conversationId}`).emit('message:unpinned', {
          messageId: id,
          conversationId: message.conversationId,
          unpinnedBy: userId
        });
      }

      logger.info('Message unpinned', {
        messageId: id,
        conversationId: message.conversationId,
        userId
      });

      res.json({
        success: true,
        message: {
          id: message.id,
          isPinned: false
        }
      });
    } catch (error) {
      logger.error('Failed to unpin message', {
        messageId: req.params.id,
        error: error.message
      });
      res.status(500).json({ error: 'Failed to unpin message' });
    }
  }
);

/**
 * GET /api/conversations/:id/pinned
 * Get pinned messages in conversation
 */
router.get('/conversations/:id/pinned',
  requireAuth,
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Verify user is participant
      const participant = await Participant.findOne({
        where: {
          conversationId: id,
          userId,
          active: true
        }
      });

      if (!participant) {
        return res.status(403).json({ error: 'Not a participant in this conversation' });
      }

      // Get pinned messages
      const pinnedMessages = await Message.findAll({
        where: {
          conversationId: id,
          isPinned: true,
          deleted: false
        },
        order: [['pinnedAt', 'DESC']]
      });

      res.json({
        messages: pinnedMessages,
        count: pinnedMessages.length
      });
    } catch (error) {
      logger.error('Failed to get pinned messages', {
        conversationId: req.params.id,
        error: error.message
      });
      res.status(500).json({ error: 'Failed to get pinned messages' });
    }
  }
);

/**
 * GET /api/messages/:id/thread
 * Get message thread (replies)
 */
router.get('/:id/thread',
  requireAuth,
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { limit = 50, offset = 0 } = req.query;

      const parentMessage = await Message.findByPk(id);
      if (!parentMessage) {
        return res.status(404).json({ error: 'Message not found' });
      }

      // Verify user is participant
      const participant = await Participant.findOne({
        where: {
          conversationId: parentMessage.conversationId,
          userId,
          active: true
        }
      });

      if (!participant) {
        return res.status(403).json({ error: 'Not authorized to view this thread' });
      }

      // Get thread replies
      const replies = await Message.findAll({
        where: {
          parentMessageId: id,
          deleted: false
        },
        order: [['createdAt', 'ASC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json({
        parentMessage: {
          id: parentMessage.id,
          content: parentMessage.content,
          senderId: parentMessage.senderId,
          replyCount: parentMessage.replyCount,
          createdAt: parentMessage.createdAt
        },
        replies,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: parentMessage.replyCount
        }
      });
    } catch (error) {
      logger.error('Failed to get message thread', {
        messageId: req.params.id,
        error: error.message
      });
      res.status(500).json({ error: 'Failed to get message thread' });
    }
  }
);

/**
 * POST /api/messages/:id/reply
 * Reply to message (create thread)
 */
router.post('/:id/reply',
  requireAuth,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { content, contentType = 'text' } = req.body;
      const userId = req.user.id;

      if (!content) {
        return res.status(400).json({ error: 'Content is required' });
      }

      const parentMessage = await Message.findByPk(id);
      if (!parentMessage) {
        return res.status(404).json({ error: 'Parent message not found' });
      }

      // Verify user is participant
      const participant = await Participant.findOne({
        where: {
          conversationId: parentMessage.conversationId,
          userId,
          active: true
        }
      });

      if (!participant) {
        return res.status(403).json({ error: 'Not a participant in this conversation' });
      }

      // Create reply
      const reply = await Message.create({
        conversationId: parentMessage.conversationId,
        senderId: userId,
        content,
        contentType,
        parentMessageId: id,
        threadId: parentMessage.threadId || id
      });

      // Update parent message reply count
      await parentMessage.increment('replyCount');

      // Emit socket event
      if (req.io) {
        req.io.to(`conversation:${parentMessage.conversationId}`).emit('message:reply', {
          message: reply,
          parentMessageId: id,
          conversationId: parentMessage.conversationId
        });
      }

      logger.info('Thread reply created', {
        replyId: reply.id,
        parentMessageId: id,
        userId
      });

      res.status(201).json({
        message: reply
      });
    } catch (error) {
      logger.error('Failed to create thread reply', {
        parentMessageId: req.params.id,
        error: error.message
      });
      res.status(500).json({ error: 'Failed to create reply' });
    }
  }
);

/**
 * PUT /api/conversations/:id/settings
 * Update conversation settings for user
 */
router.put('/conversations/:id/settings',
  requireAuth,
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { muted, muteUntil, notificationsEnabled } = req.body;

      // Get participant
      const participant = await Participant.findOne({
        where: {
          conversationId: id,
          userId,
          active: true
        }
      });

      if (!participant) {
        return res.status(404).json({ error: 'Not a participant in this conversation' });
      }

      // Update settings
      const updates = {};
      if (muted !== undefined) updates.muted = muted;
      if (muteUntil !== undefined) updates.muteUntil = muteUntil;
      if (notificationsEnabled !== undefined) {
        updates.metadata = {
          ...participant.metadata,
          notificationsEnabled
        };
      }

      await participant.update(updates);

      logger.info('Conversation settings updated', {
        conversationId: id,
        userId,
        updates
      });

      res.json({
        success: true,
        settings: {
          muted: participant.muted,
          muteUntil: participant.muteUntil,
          notificationsEnabled: participant.metadata.notificationsEnabled
        }
      });
    } catch (error) {
      logger.error('Failed to update conversation settings', {
        conversationId: req.params.id,
        error: error.message
      });
      res.status(500).json({ error: 'Failed to update settings' });
    }
  }
);

/**
 * GET /api/conversations/:id/settings
 * Get conversation settings for user
 */
router.get('/conversations/:id/settings',
  requireAuth,
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const participant = await Participant.findOne({
        where: {
          conversationId: id,
          userId,
          active: true
        }
      });

      if (!participant) {
        return res.status(404).json({ error: 'Not a participant in this conversation' });
      }

      res.json({
        settings: {
          muted: participant.muted,
          muteUntil: participant.muteUntil,
          notificationsEnabled: participant.metadata.notificationsEnabled !== false,
          lastReadAt: participant.lastReadAt,
          lastReadMessageId: participant.lastReadMessageId
        }
      });
    } catch (error) {
      logger.error('Failed to get conversation settings', {
        conversationId: req.params.id,
        error: error.message
      });
      res.status(500).json({ error: 'Failed to get settings' });
    }
  }
);

/**
 * POST /api/conversations/:id/mute
 * Mute conversation
 */
router.post('/conversations/:id/mute',
  requireAuth,
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { until } = req.body; // Optional timestamp

      const participant = await Participant.findOne({
        where: {
          conversationId: id,
          userId,
          active: true
        }
      });

      if (!participant) {
        return res.status(404).json({ error: 'Not a participant in this conversation' });
      }

      await participant.update({
        muted: true,
        muteUntil: until || null
      });

      logger.info('Conversation muted', {
        conversationId: id,
        userId,
        until
      });

      res.json({
        success: true,
        muted: true,
        muteUntil: until || null
      });
    } catch (error) {
      logger.error('Failed to mute conversation', {
        conversationId: req.params.id,
        error: error.message
      });
      res.status(500).json({ error: 'Failed to mute conversation' });
    }
  }
);

/**
 * POST /api/conversations/:id/unmute
 * Unmute conversation
 */
router.post('/conversations/:id/unmute',
  requireAuth,
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const participant = await Participant.findOne({
        where: {
          conversationId: id,
          userId,
          active: true
        }
      });

      if (!participant) {
        return res.status(404).json({ error: 'Not a participant in this conversation' });
      }

      await participant.update({
        muted: false,
        muteUntil: null
      });

      logger.info('Conversation unmuted', {
        conversationId: id,
        userId
      });

      res.json({
        success: true,
        muted: false
      });
    } catch (error) {
      logger.error('Failed to unmute conversation', {
        conversationId: req.params.id,
        error: error.message
      });
      res.status(500).json({ error: 'Failed to unmute conversation' });
    }
  }
);

module.exports = router;
