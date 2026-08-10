/**
 * ═══════════════════════════════════════════════════════════
 * Herald Service Integration
 * Send notifications via the Herald notification service
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Create Herald service client
 */
const heraldClient = axios.create({
  baseURL: config.herald.url,
  timeout: config.herald.timeout,
  headers: {
    'Content-Type': 'application/json'
  }
});

/**
 * Send notification via Herald service
 *
 * @param {string} userId - Recipient user ID
 * @param {Object} notification - Notification details
 * @param {string} notification.type - Notification type (like, comment, repost, mention, follow, reply)
 * @param {string} notification.title - Notification title
 * @param {string} notification.body - Notification body
 * @param {Object} [notification.data] - Additional notification data
 * @param {string} [notification.channel='in-app'] - Delivery channel (push, email, sms, in-app)
 * @param {string} [notification.priority='normal'] - Priority (low, normal, high, urgent)
 * @returns {Promise<Object>} - Created notification
 */
async function sendNotification(userId, notification) {
  if (!config.herald.enabled) {
    logger.debug('Herald service disabled, skipping notification', {
      userId,
      type: notification.type
    });
    return { success: false, reason: 'Herald service disabled' };
  }

  try {
    const payload = {
      userId,
      type: notification.type || 'info',
      channel: notification.channel || 'in-app',
      title: notification.title,
      body: notification.body,
      data: notification.data || {},
      priority: notification.priority || 'normal'
    };

    logger.debug('Sending notification to Herald', {
      userId,
      type: payload.type,
      channel: payload.channel,
      title: payload.title
    });

    const response = await heraldClient.post('/api/notifications', payload);

    logger.info('Notification sent via Herald', {
      userId,
      type: payload.type,
      notificationId: response.data.notification?.id
    });

    return {
      success: true,
      notificationId: response.data.notification?.id,
      channel: response.data.notification?.channel,
      status: response.data.notification?.status
    };
  } catch (error) {
    logger.error('Failed to send notification via Herald', {
      userId,
      type: notification.type,
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    });

    // Don't throw - notification failures shouldn't break the main flow
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Send batch notifications via Herald service
 *
 * @param {Array<Object>} notifications - Array of notification objects
 * @returns {Promise<Object>} - Batch send results
 */
async function sendBatchNotifications(notifications) {
  if (!config.herald.enabled) {
    logger.debug('Herald service disabled, skipping batch notifications', {
      count: notifications.length
    });
    return { success: false, reason: 'Herald service disabled' };
  }

  logger.info('Sending batch notifications to Herald', {
    count: notifications.length
  });

  const results = await Promise.allSettled(
    notifications.map(notification =>
      sendNotification(notification.userId, notification)
    )
  );

  const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const failed = results.filter(r => r.status === 'rejected' || !r.value.success).length;

  logger.info('Batch notifications completed', {
    total: notifications.length,
    succeeded,
    failed
  });

  return {
    success: true,
    total: notifications.length,
    succeeded,
    failed,
    results
  };
}

/**
 * Create notification for post interaction
 *
 * @param {string} type - Interaction type (like, comment, repost, mention, reply)
 * @param {string} recipientId - User receiving the notification
 * @param {string} actorId - User who performed the action
 * @param {Object} post - Post object
 * @param {Object} [additionalData] - Additional data (e.g., comment text)
 * @returns {Promise<Object>} - Notification result
 */
async function notifyInteraction(type, recipientId, actorId, post, additionalData = {}) {
  // Don't notify if user is interacting with their own post
  if (recipientId === actorId) {
    return { success: false, reason: 'Self-interaction' };
  }

  const notificationMap = {
    like: {
      title: 'New Like',
      body: `Someone liked your post`,
      data: { postId: post.id, actorId, type: 'like' }
    },
    repost: {
      title: 'New Repost',
      body: `Someone reposted your post`,
      data: { postId: post.id, actorId, type: 'repost' }
    },
    comment: {
      title: 'New Comment',
      body: additionalData.commentText
        ? `Someone commented: "${additionalData.commentText.substring(0, 50)}${additionalData.commentText.length > 50 ? '...' : ''}"`
        : 'Someone commented on your post',
      data: { postId: post.id, actorId, commentId: additionalData.commentId, type: 'comment' }
    },
    reply: {
      title: 'New Reply',
      body: additionalData.replyText
        ? `Someone replied: "${additionalData.replyText.substring(0, 50)}${additionalData.replyText.length > 50 ? '...' : ''}"`
        : 'Someone replied to your post',
      data: { postId: post.id, actorId, replyId: additionalData.replyId, type: 'reply' }
    },
    mention: {
      title: 'You were mentioned',
      body: `Someone mentioned you in a post`,
      data: { postId: post.id, actorId, type: 'mention' }
    },
    follow: {
      title: 'New Follower',
      body: `Someone started following you`,
      data: { actorId, type: 'follow' }
    }
  };

  const notification = notificationMap[type];

  if (!notification) {
    logger.warn('Unknown notification type', { type });
    return { success: false, reason: 'Unknown notification type' };
  }

  return sendNotification(recipientId, {
    type: 'info',
    channel: 'in-app',
    title: notification.title,
    body: notification.body,
    data: notification.data,
    priority: type === 'mention' ? 'high' : 'normal'
  });
}

/**
 * Check Herald service health
 *
 * @returns {Promise<Object>} - Health check result
 */
async function checkHealth() {
  try {
    const response = await heraldClient.get('/health', {
      timeout: 3000
    });

    return {
      status: 'connected',
      healthy: response.status === 200,
      data: response.data
    };
  } catch (error) {
    return {
      status: 'disconnected',
      healthy: false,
      error: error.message
    };
  }
}

module.exports = {
  sendNotification,
  sendBatchNotifications,
  notifyInteraction,
  checkHealth
};
