/**
 * ═══════════════════════════════════════════════════════════════════════
 * Herald Service Integration
 * Send notifications via the Herald notification service
 * ═══════════════════════════════════════════════════════════════════════
 */

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Create Herald service client
 */
const heraldClient = axios.create({
  baseURL: process.env.HERALD_SERVICE_URL || 'http://localhost:3014',
  timeout: parseInt(process.env.HERALD_SERVICE_TIMEOUT) || 5000,
  headers: {
    'Content-Type': 'application/json'
  }
});

/**
 * Send notification via Herald service
 *
 * @param {string} userId - Recipient user ID
 * @param {Object} notification - Notification details
 * @param {string} notification.type - Notification type
 * @param {string} notification.title - Notification title
 * @param {string} notification.body - Notification body
 * @param {Object} [notification.data] - Additional notification data
 * @param {string} [notification.channel='in-app'] - Delivery channel
 * @param {string} [notification.priority='normal'] - Priority
 * @returns {Promise<Object>} - Created notification
 */
async function sendNotification(userId, notification) {
  const heraldEnabled = process.env.HERALD_SERVICE_ENABLED !== 'false';

  if (!heraldEnabled) {
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
  const heraldEnabled = process.env.HERALD_SERVICE_ENABLED !== 'false';

  if (!heraldEnabled) {
    logger.debug('Herald service disabled, skipping batch notifications');
    return { success: false, reason: 'Herald service disabled' };
  }

  try {
    const response = await heraldClient.post('/api/notifications/batch', {
      notifications
    });

    logger.info('Batch notifications sent via Herald', {
      count: notifications.length,
      successful: response.data.successful,
      failed: response.data.failed
    });

    return {
      success: true,
      successful: response.data.successful,
      failed: response.data.failed,
      results: response.data.results
    };
  } catch (error) {
    logger.error('Failed to send batch notifications via Herald', {
      count: notifications.length,
      error: error.message
    });

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Send contributor added notification
 *
 * @param {string} userId - User who was added as contributor
 * @param {Object} album - Album details
 * @param {string} addedBy - User who added the contributor
 * @param {string} role - Contributor role
 * @returns {Promise<Object>}
 */
async function notifyContributorAdded(userId, album, addedBy, role) {
  return sendNotification(userId, {
    type: 'album_contributor_added',
    title: 'Added to Album',
    body: `You were added as a ${role} to the album "${album.name}"`,
    data: {
      albumId: album.id,
      albumName: album.name,
      role,
      addedBy
    },
    channel: 'in-app',
    priority: 'normal'
  });
}

/**
 * Send contributor removed notification
 *
 * @param {string} userId - User who was removed
 * @param {Object} album - Album details
 * @param {string} removedBy - User who removed the contributor
 * @returns {Promise<Object>}
 */
async function notifyContributorRemoved(userId, album, removedBy) {
  return sendNotification(userId, {
    type: 'album_contributor_removed',
    title: 'Removed from Album',
    body: `You were removed from the album "${album.name}"`,
    data: {
      albumId: album.id,
      albumName: album.name,
      removedBy
    },
    channel: 'in-app',
    priority: 'normal'
  });
}

/**
 * Send media processing complete notification
 *
 * @param {string} userId - Media owner
 * @param {Object} media - Media details
 * @returns {Promise<Object>}
 */
async function notifyMediaProcessed(userId, media) {
  return sendNotification(userId, {
    type: 'media_processed',
    title: 'Media Processing Complete',
    body: `Your ${media.mediaType} "${media.filename}" has been processed`,
    data: {
      mediaId: media.id,
      albumId: media.albumId,
      mediaType: media.mediaType,
      filename: media.filename
    },
    channel: 'in-app',
    priority: 'low'
  });
}

/**
 * Send share link created notification
 *
 * @param {string} userId - Album owner
 * @param {Object} shareLink - Share link details
 * @param {Object} album - Album details
 * @returns {Promise<Object>}
 */
async function notifyShareLinkCreated(userId, shareLink, album) {
  return sendNotification(userId, {
    type: 'share_link_created',
    title: 'Share Link Created',
    body: `A share link was created for album "${album.name}"`,
    data: {
      shareLinkId: shareLink.id,
      albumId: album.id,
      albumName: album.name,
      shareCode: shareLink.code
    },
    channel: 'in-app',
    priority: 'low'
  });
}

module.exports = {
  sendNotification,
  sendBatchNotifications,
  notifyContributorAdded,
  notifyContributorRemoved,
  notifyMediaProcessed,
  notifyShareLinkCreated
};
