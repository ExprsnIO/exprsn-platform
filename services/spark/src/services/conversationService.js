/**
 * Exprsn Spark - Conversation Service
 */

const { Conversation, Participant, Message } = require('../models');
const { Op } = require('sequelize');
const contactPolicy = require('./contactPolicy');

class ConversationService {
  /**
   * Create a new conversation
   */
  async createConversation(creatorId, participantIds, options = {}) {
    const { name, type = 'direct', metadata = {} } = options;

    // Ensure creator is in participants
    const allParticipants = [...new Set([creatorId, ...participantIds])];

    // FEAT-070 S1: a direct (1:1) conversation is contact initiation — reject
    // when the pair is blocked either way. Group creation is exempt (ADR §3).
    if (type === 'direct') {
      await contactPolicy.assertCanContactUsers(creatorId, participantIds);
    }

    const conversation = await Conversation.create({
      name,
      type,
      creatorId,
      metadata
    });

    // Add participants
    await Promise.all(
      allParticipants.map(userId =>
        Participant.create({
          conversationId: conversation.id,
          userId,
          role: userId === creatorId ? 'admin' : 'member'
        })
      )
    );

    return conversation;
  }

  /**
   * Get conversations for a user
   */
  async getUserConversations(userId, options = {}) {
    const { limit = 20, offset = 0 } = options;

    const participations = await Participant.findAll({
      where: { userId },
      include: [{
        model: Conversation,
        include: [{
          model: Message,
          limit: 1,
          order: [['createdAt', 'DESC']]
        }]
      }],
      limit,
      offset,
      order: [['updatedAt', 'DESC']]
    });

    const conversations = participations.map(p => p.Conversation).filter(Boolean);

    // FEAT-070 S4: hide frozen direct conversations (counterpart in the
    // viewer's suppression set). Frozen, not deleted — reappears on unblock.
    const hidden = await contactPolicy.getHiddenConversationIds(userId, conversations);
    return conversations.filter(c => !hidden.has(c.id));
  }

  /**
   * Get conversation by ID
   */
  async getConversationById(conversationId, userId) {
    const participant = await Participant.findOne({
      where: { conversationId, userId }
    });

    if (!participant) {
      throw new Error('Access denied');
    }

    return Conversation.findByPk(conversationId, {
      include: [Participant]
    });
  }

  /**
   * Add participant to conversation
   */
  async addParticipant(conversationId, userId, addedBy) {
    const conversation = await this.getConversationById(conversationId, addedBy);

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const existing = await Participant.findOne({
      where: { conversationId, userId }
    });

    if (existing) {
      throw new Error('User already in conversation');
    }

    // FEAT-070 S3: adding a user you're in a blocked pair with is contact
    // initiation by the adder — reject (403).
    await contactPolicy.assertCanContactUsers(addedBy, [userId]);

    return Participant.create({
      conversationId,
      userId,
      role: 'member'
    });
  }

  /**
   * Remove participant from conversation
   */
  async removeParticipant(conversationId, userId, removedBy) {
    const conversation = await this.getConversationById(conversationId, removedBy);

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const participant = await Participant.findOne({
      where: { conversationId, userId }
    });

    if (!participant) {
      throw new Error('User not in conversation');
    }

    await participant.destroy();
    return { success: true };
  }
}

module.exports = new ConversationService();
