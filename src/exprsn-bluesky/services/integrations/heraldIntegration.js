const { serviceRequest } = require('@exprsn/shared');
const { logger } = require('@exprsn/shared');

const HERALD_SERVICE_URL = process.env.HERALD_SERVICE_URL || 'http://localhost:3014';

class HeraldIntegration {
  async sendNotification(notificationData) {
    try {
      const response = await serviceRequest({
        method: 'POST',
        url: `${HERALD_SERVICE_URL}/api/notifications`,
        data: {
          ...notificationData,
          source: 'bluesky'
        },
        serviceName: 'exprsn-bluesky',
        resource: `${HERALD_SERVICE_URL}/api/notifications/*`,
        permissions: { write: true }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to send notification via Herald', {
        error: error.message
      });
      throw error;
    }
  }

  async sendBulkNotifications(notifications) {
    try {
      const response = await serviceRequest({
        method: 'POST',
        url: `${HERALD_SERVICE_URL}/api/notifications/bulk`,
        data: {
          notifications: notifications.map(n => ({
            ...n,
            source: 'bluesky'
          }))
        },
        serviceName: 'exprsn-bluesky',
        resource: `${HERALD_SERVICE_URL}/api/notifications/*`,
        permissions: { write: true }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to send bulk notifications', {
        error: error.message,
        count: notifications.length
      });
      throw error;
    }
  }

  async notifyNewPost(userId, postData) {
    return this.sendNotification({
      userId,
      type: 'bluesky_post',
      title: 'New Bluesky Post',
      message: `${postData.author} posted: ${postData.text?.substring(0, 100)}`,
      data: postData,
      channels: ['push', 'inapp']
    });
  }

  async notifyMention(userId, mentionData) {
    return this.sendNotification({
      userId,
      type: 'bluesky_mention',
      title: 'You were mentioned',
      message: `${mentionData.author} mentioned you`,
      data: mentionData,
      channels: ['push', 'inapp', 'email']
    });
  }

  async notifyFollow(userId, followerData) {
    return this.sendNotification({
      userId,
      type: 'bluesky_follow',
      title: 'New Follower',
      message: `${followerData.handle} followed you`,
      data: followerData,
      channels: ['push', 'inapp']
    });
  }
}

module.exports = new HeraldIntegration();
