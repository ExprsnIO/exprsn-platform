/**
 * Exprsn Spark - Message Service
 */

const { Message, Conversation, Participant, Reaction } = require('../models');
const { Op } = require('sequelize');
const sanitizeHtml = require('sanitize-html');
const logger = require('../utils/logger');
const messageModeration = require('./messageModeration');
const contactPolicy = require('./contactPolicy');

class MessageService {
  /**
   * Send a message
   */
  async sendMessage(conversationId, senderId, content, options = {}) {
    const {
      type = 'text',
      attachments = [],
      replyToId = null,
      metadata = {},
      encrypted = false,
      encryptedContent = null,
      senderKeyFingerprint = null
    } = options;

    // Verify sender is participant
    const participant = await Participant.findOne({
      where: { conversationId, userId: senderId }
    });

    if (!participant) {
      throw new Error('Not a participant');
    }

    // FEAT-070 S2: reject the send when the direct (1:1) counterpart is
    // blocked either way. Group conversations are exempt inside the guard
    // (ADR §3). Throws ContactForbiddenError (403) / ContactCheckError
    // (fail-closed on lookup failure).
    await contactPolicy.assertCanContact(senderId, conversationId);

    // Prepare message data
    const messageData = {
      conversationId,
      senderId,
      contentType: type,
      attachments,
      parentMessageId: replyToId,
      metadata,
      encrypted
    };

    // Handle encrypted vs plaintext content
    if (encrypted) {
      if (!encryptedContent || !senderKeyFingerprint) {
        throw new Error('Encrypted messages require encryptedContent and senderKeyFingerprint');
      }
      messageData.encryptedContent = encryptedContent;
      messageData.senderKeyFingerprint = senderKeyFingerprint;
      messageData.content = null; // No plaintext content for encrypted messages
    } else {
      // Sanitize plaintext content
      if (type === 'text') {
        messageData.content = this._sanitizeContent(content);
      } else {
        messageData.content = content;
      }
    }

    const message = await Message.create(messageData);

    // FEAT-009: message-content ingress — establish the moderation side-row so
    // this service layer is safe to wire from any route/worker. Fail-open: the
    // helper never throws into the send path (BUG-017 invariant).
    await messageModeration.moderateMessage(message, { mode: 'create' });

    // Update conversation last activity
    await Conversation.update(
      { lastActivityAt: new Date() },
      { where: { id: conversationId } }
    );

    logger.info('Message sent', {
      messageId: message.id,
      conversationId,
      senderId,
      encrypted
    });

    return message;
  }

  /**
   * Get messages for a conversation
   */
  async getMessages(conversationId, userId, options = {}) {
    const { limit = 50, before, after } = options;

    // Verify user is participant
    const participant = await Participant.findOne({
      where: { conversationId, userId }
    });

    if (!participant) {
      throw new Error('Access denied');
    }

    const where = { conversationId };

    // FEAT-070 S5: filter messages from suppressed senders (blocked either
    // way ∪ viewer's unexpired mutes) — one set-returning façade call per
    // request, then [Op.notIn] (the ADR's read-path shape). History is
    // frozen, not deleted: rows persist and reappear on unblock.
    const suppressed = await contactPolicy.getSuppressedIds(userId);
    if (suppressed.length > 0) {
      where.senderId = { [Op.notIn]: suppressed };
    }

    if (before) {
      where.createdAt = { [Op.lt]: before };
    }
    if (after) {
      where.createdAt = { [Op.gt]: after };
    }

    return Message.findAll({
      where,
      limit,
      order: [['createdAt', 'DESC']],
      include: [{ model: Reaction, as: 'reactions' }]
    });
  }

  /**
   * Edit a message
   */
  async editMessage(messageId, userId, newContent, options = {}) {
    const { encryptedContent = null } = options;

    const message = await Message.findByPk(messageId);

    if (!message) {
      throw new Error('Message not found');
    }

    if (message.senderId !== userId) {
      throw new Error('Cannot edit other user\'s message');
    }

    // Handle encrypted vs plaintext content
    if (message.encrypted) {
      if (!encryptedContent) {
        throw new Error('Encrypted messages require encryptedContent for editing');
      }
      message.encryptedContent = encryptedContent;
      message.content = null;
    } else {
      message.content = this._sanitizeContent(newContent);
    }

    message.edited = true;
    message.editedAt = new Date();
    await message.save();

    // FEAT-009: an EDIT re-moderates the new bytes. mode:'reset' clears the
    // stale verdict and removes the stale queue job (BUG-016). Fail-open.
    await messageModeration.moderateMessage(message, { mode: 'reset' });

    logger.info('Message edited', {
      messageId,
      userId,
      encrypted: message.encrypted
    });

    return message;
  }

  /**
   * Delete a message
   */
  async deleteMessage(messageId, userId) {
    const message = await Message.findByPk(messageId);

    if (!message) {
      throw new Error('Message not found');
    }

    if (message.senderId !== userId) {
      throw new Error('Cannot delete other user\'s message');
    }

    await message.destroy();
    return { success: true };
  }

  /**
   * Add reaction to message
   */
  async addReaction(messageId, userId, emoji) {
    const message = await Message.findByPk(messageId);

    if (!message) {
      throw new Error('Message not found');
    }

    const existing = await Reaction.findOne({
      where: { messageId, userId, emoji }
    });

    if (existing) {
      return existing;
    }

    return Reaction.create({
      messageId,
      userId,
      emoji
    });
  }

  /**
   * Remove reaction from message
   */
  async removeReaction(messageId, userId, emoji) {
    const reaction = await Reaction.findOne({
      where: { messageId, userId, emoji }
    });

    if (!reaction) {
      throw new Error('Reaction not found');
    }

    await reaction.destroy();
    return { success: true };
  }

  /**
   * Mark messages as read
   */
  async markAsRead(conversationId, userId, messageIds) {
    const participant = await Participant.findOne({
      where: { conversationId, userId }
    });

    if (!participant) {
      throw new Error('Not a participant');
    }

    participant.lastReadAt = new Date();
    await participant.save();

    return { success: true, readAt: participant.lastReadAt };
  }

  /**
   * Sanitize message content (for non-encrypted messages)
   * @private
   */
  _sanitizeContent(content) {
    if (!content) return content;

    return sanitizeHtml(content, {
      allowedTags: ['b', 'i', 'em', 'strong', 'a', 'code', 'pre', 'br'],
      allowedAttributes: {
        'a': ['href', 'target']
      },
      allowedSchemes: ['http', 'https', 'mailto']
    });
  }
}

module.exports = new MessageService();
