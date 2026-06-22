/**
 * Exprsn Spark - Conversation Service
 */

const { Conversation, Participant, Message } = require('../models');
const { Op } = require('sequelize');

class ConversationService {
  /**
   * Create a new conversation
   */
  async createConversation(creatorId, participantIds, options = {}) {
    const { name, type = 'direct', metadata = {} } = options;

    // Ensure creator is in participants
    const allParticipants = [...new Set([creatorId, ...participantIds])];

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

    return participations.map(p => p.Conversation);
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
