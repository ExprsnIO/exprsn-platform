/**
 * Notification Service
 * Sends notifications via Herald service
 */

const axios = require('axios');
const { createLogger } = require('@exprsn/shared');

const logger = createLogger('exprsn-spark:notification');

// Herald service URL (notification service)
const HERALD_URL = process.env.HERALD_SERVICE_URL || 'http://localhost:3014';

/**
 * Send message notification
 */
async function sendMessageNotification({ messageId, conversationId, senderId, content, recipientIds }) {
  try {
    // Get conversation and sender details from database
    const db = require('../models');
    const { Conversation, Participant } = db;

    const conversation = await Conversation.findByPk(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Check notification preferences for each recipient
    const participants = await Participant.findAll({
      where: {
        conversationId,
        userId: recipientIds
      }
    });

    const notificationsToSend = [];

    for (const participant of participants) {
      // Skip if muted or notifications disabled
      if (participant.muted || participant.notificationsEnabled === false) {
        logger.debug('Skipping notification for muted/disabled user', {
          userId: participant.userId,
          conversationId
        });
        continue;
      }

      // Check if mute expires
      if (participant.muteUntil && new Date(participant.muteUntil) > new Date()) {
        logger.debug('Skipping notification for temporarily muted user', {
          userId: participant.userId,
          muteUntil: participant.muteUntil
        });
        continue;
      }

      notificationsToSend.push({
        userId: participant.userId,
        type: 'message',
        title: conversation.type === 'direct'
          ? 'New message'
          : `New message in ${conversation.name || 'group'}`,
        body: content.substring(0, 100), // Truncate for notification
        data: {
          messageId,
          conversationId,
          senderId,
          conversationType: conversation.type
        },
        channels: ['push', 'in-app'] // Could be configurable per user
      });
    }

    // Send notifications via Herald
    if (notificationsToSend.length > 0) {
      await axios.post(`${HERALD_URL}/api/notifications/batch`, {
        notifications: notificationsToSend
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.SERVICE_CA_TOKEN}`
        }
      });

      logger.info('Notifications sent', {
        messageId,
        count: notificationsToSend.length
      });
    } else {
      logger.debug('No notifications to send', { messageId });
    }

    return {
      success: true,
      sent: notificationsToSend.length
    };
  } catch (error) {
    logger.error('Failed to send message notification', {
      messageId,
      error: error.message,
      stack: error.stack
    });

    // Don't throw - notifications are not critical
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Send mention notification
 */
async function sendMentionNotification({ messageId, conversationId, senderId, mentionedUserId, content }) {
  try {
    const db = require('../models');
    const { Conversation } = db;

    const conversation = await Conversation.findByPk(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    await axios.post(`${HERALD_URL}/api/notifications/send`, {
      userId: mentionedUserId,
      type: 'mention',
      title: 'You were mentioned',
      body: content.substring(0, 100),
      data: {
        messageId,
        conversationId,
        senderId,
        conversationType: conversation.type
      },
      channels: ['push', 'in-app', 'email'],
      priority: 'high'
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.SERVICE_CA_TOKEN}`
      }
    });

    logger.info('Mention notification sent', {
      messageId,
      mentionedUserId
    });

    return { success: true };
  } catch (error) {
    logger.error('Failed to send mention notification', {
      messageId,
      mentionedUserId,
      error: error.message
    });

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Send typing indicator notification (real-time via Socket.IO)
 */
function sendTypingNotification(io, conversationId, userId, isTyping) {
  try {
    io.to(`conversation:${conversationId}`).emit('user:typing', {
      conversationId,
      userId,
      isTyping,
      timestamp: new Date()
    });

    logger.debug('Typing notification sent', {
      conversationId,
      userId,
      isTyping
    });
  } catch (error) {
    logger.error('Failed to send typing notification', {
      conversationId,
      userId,
      error: error.message
    });
  }
}

/**
 * Send read receipt notification (real-time via Socket.IO)
 */
function sendReadReceiptNotification(io, conversationId, messageId, userId) {
  try {
    io.to(`conversation:${conversationId}`).emit('message:read', {
      conversationId,
      messageId,
      userId,
      timestamp: new Date()
    });

    logger.debug('Read receipt sent', {
      conversationId,
      messageId,
      userId
    });
  } catch (error) {
    logger.error('Failed to send read receipt', {
      conversationId,
      messageId,
      error: error.message
    });
  }
}

/**
 * Send unread digest (scheduled job)
 */
async function sendUnreadDigest(userId) {
  try {
    const db = require('../models');
    const { Message, Conversation, Participant } = db;

    // Get user's conversations with unread messages
    const participants = await Participant.findAll({
      where: { userId },
      include: [{
        model: Conversation,
        as: 'conversation'
      }]
    });

    let totalUnread = 0;
    const unreadByConversation = [];

    for (const participant of participants) {
      const unreadCount = await Message.count({
        where: {
          conversationId: participant.conversationId,
          deleted: false,
          createdAt: {
            [db.Sequelize.Op.gt]: participant.lastReadAt || participant.joinedAt
          }
        }
      });

      if (unreadCount > 0) {
        totalUnread += unreadCount;
        unreadByConversation.push({
          conversationId: participant.conversationId,
          conversationName: participant.conversation.name || 'Direct Message',
          unreadCount
        });
      }
    }

    if (totalUnread > 0) {
      await axios.post(`${HERALD_URL}/api/notifications/send`, {
        userId,
        type: 'unread-digest',
        title: `You have ${totalUnread} unread messages`,
        body: `Unread messages in ${unreadByConversation.length} conversations`,
        data: {
          totalUnread,
          conversations: unreadByConversation
        },
        channels: ['email'],
        priority: 'low'
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.SERVICE_CA_TOKEN}`
        }
      });

      logger.info('Unread digest sent', {
        userId,
        totalUnread,
        conversations: unreadByConversation.length
      });
    }

    return { success: true, totalUnread };
  } catch (error) {
    logger.error('Failed to send unread digest', {
      userId,
      error: error.message
    });

    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  sendMessageNotification,
  sendMentionNotification,
  sendTypingNotification,
  sendReadReceiptNotification,
  sendUnreadDigest
};
