/**
 * Exprsn Herald - Push Notification Service
 * Handles push notifications via FCM (Firebase) and APNS (Apple)
 */

const { PushToken, DeliveryLog } = require('../models');
const config = require('../config');
const logger = require('../utils/logger');

// Firebase Admin SDK (for FCM)
let admin = null;
if (config.push.fcm.serverKey) {
  try {
    admin = require('firebase-admin');
    // Initialize Firebase Admin SDK
    // Note: In production, use service account JSON file
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(
          config.push.fcm.serviceAccount || {}
        )
      });
    }
  } catch (error) {
    logger.warn('Firebase Admin SDK not initialized', {
      error: error.message
    });
  }
}

// Apple Push Notification (APNS)
let apn = null;
if (config.push.apns.keyId) {
  try {
    apn = require('apn');
  } catch (error) {
    logger.warn('APNS not initialized', { error: error.message });
  }
}

class PushService {
  constructor() {
    this.apnProvider = null;
    this.initializeAPNS();
  }

  /**
   * Initialize APNS provider
   */
  initializeAPNS() {
    if (!apn || !config.push.apns.keyId) {
      return;
    }

    try {
      this.apnProvider = new apn.Provider({
        token: {
          key: config.push.apns.key,
          keyId: config.push.apns.keyId,
          teamId: config.push.apns.teamId
        },
        production: config.env === 'production'
      });

      logger.info('APNS provider initialized');
    } catch (error) {
      logger.error('Error initializing APNS', { error: error.message });
    }
  }

  /**
   * Send push notification to user
   */
  async sendPushNotification({
    userId,
    title,
    body,
    data = {},
    badge = null,
    sound = 'default',
    notificationId = null
  }) {
    try {
      // Get all active push tokens for user
      const tokens = await PushToken.findAll({
        where: {
          userId,
          active: true
        }
      });

      if (tokens.length === 0) {
        logger.warn('No push tokens found for user', { userId });
        return { success: false, reason: 'no_tokens' };
      }

      const results = [];

      // Send to each device
      for (const tokenRecord of tokens) {
        try {
          let result;

          if (tokenRecord.platform === 'ios') {
            result = await this.sendToAPNS({
              token: tokenRecord.token,
              title,
              body,
              data,
              badge,
              sound,
              notificationId
            });
          } else if (
            tokenRecord.platform === 'android' ||
            tokenRecord.platform === 'web'
          ) {
            result = await this.sendToFCM({
              token: tokenRecord.token,
              title,
              body,
              data,
              badge,
              sound,
              notificationId
            });
          }

          results.push({
            tokenId: tokenRecord.id,
            platform: tokenRecord.platform,
            success: result.success
          });

          // Update last used timestamp
          await tokenRecord.update({ lastUsedAt: new Date() });
        } catch (error) {
          logger.error('Error sending to device', {
            error: error.message,
            tokenId: tokenRecord.id,
            platform: tokenRecord.platform
          });

          results.push({
            tokenId: tokenRecord.id,
            platform: tokenRecord.platform,
            success: false,
            error: error.message
          });
        }
      }

      const successCount = results.filter(r => r.success).length;

      logger.info('Push notifications sent', {
        userId,
        total: results.length,
        success: successCount,
        failed: results.length - successCount
      });

      return {
        success: successCount > 0,
        results,
        sentCount: successCount
      };
    } catch (error) {
      logger.error('Error sending push notification', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Send to Firebase Cloud Messaging (Android/Web)
   */
  async sendToFCM({ token, title, body, data, badge, sound, notificationId }) {
    try {
      if (!admin) {
        throw new Error('Firebase Admin SDK not initialized');
      }

      const message = {
        notification: {
          title,
          body
        },
        data: {
          ...data,
          notificationId: notificationId || ''
        },
        token
      };

      if (badge !== null) {
        message.notification.badge = String(badge);
      }

      if (sound) {
        message.notification.sound = sound;
      }

      // Create delivery log
      let deliveryLog = null;
      if (notificationId) {
        deliveryLog = await DeliveryLog.create({
          notificationId,
          channel: 'push',
          provider: 'fcm',
          status: 'pending'
        });
      }

      const response = await admin.messaging().send(message);

      // Update delivery log
      if (deliveryLog) {
        await deliveryLog.update({
          status: 'sent',
          sentAt: new Date(),
          metadata: {
            messageId: response
          }
        });
      }

      logger.info('FCM notification sent', { messageId: response });

      return {
        success: true,
        messageId: response,
        deliveryLogId: deliveryLog?.id
      };
    } catch (error) {
      logger.error('Error sending FCM notification', {
        error: error.message
      });

      // Update delivery log on failure
      if (notificationId) {
        await DeliveryLog.update(
          {
            status: 'failed',
            error: error.message
          },
          {
            where: { notificationId, channel: 'push', provider: 'fcm' }
          }
        );
      }

      throw error;
    }
  }

  /**
   * Send to Apple Push Notification Service (iOS)
   */
  async sendToAPNS({ token, title, body, data, badge, sound, notificationId }) {
    try {
      if (!this.apnProvider) {
        throw new Error('APNS provider not initialized');
      }

      const notification = new apn.Notification();
      notification.alert = {
        title,
        body
      };
      notification.sound = sound || 'default';
      notification.badge = badge;
      notification.topic = config.push.apns.bundleId;
      notification.payload = {
        ...data,
        notificationId: notificationId || ''
      };

      // Create delivery log
      let deliveryLog = null;
      if (notificationId) {
        deliveryLog = await DeliveryLog.create({
          notificationId,
          channel: 'push',
          provider: 'apns',
          status: 'pending'
        });
      }

      const result = await this.apnProvider.send(notification, token);

      // Check for failures
      if (result.failed && result.failed.length > 0) {
        const error = result.failed[0].response;

        if (deliveryLog) {
          await deliveryLog.update({
            status: 'failed',
            error: error.reason
          });
        }

        throw new Error(`APNS error: ${error.reason}`);
      }

      // Update delivery log
      if (deliveryLog) {
        await deliveryLog.update({
          status: 'sent',
          sentAt: new Date()
        });
      }

      logger.info('APNS notification sent');

      return {
        success: true,
        deliveryLogId: deliveryLog?.id
      };
    } catch (error) {
      logger.error('Error sending APNS notification', {
        error: error.message
      });

      // Update delivery log on failure
      if (notificationId) {
        await DeliveryLog.update(
          {
            status: 'failed',
            error: error.message
          },
          {
            where: { notificationId, channel: 'push', provider: 'apns' }
          }
        );
      }

      throw error;
    }
  }

  /**
   * Register device token
   */
  async registerDevice({ userId, token, platform, deviceId = null }) {
    try {
      // Check if token already exists
      let pushToken = await PushToken.findOne({ where: { token } });

      if (pushToken) {
        // Update existing token
        await pushToken.update({
          userId,
          platform,
          deviceId,
          active: true,
          lastUsedAt: new Date()
        });

        logger.info('Push token updated', {
          tokenId: pushToken.id,
          userId
        });
      } else {
        // Create new token
        pushToken = await PushToken.create({
          userId,
          token,
          platform,
          deviceId,
          active: true,
          lastUsedAt: new Date()
        });

        logger.info('Push token registered', {
          tokenId: pushToken.id,
          userId,
          platform
        });
      }

      return pushToken;
    } catch (error) {
      logger.error('Error registering device', {
        error: error.message,
        userId,
        platform
      });
      throw error;
    }
  }

  /**
   * Unregister device token
   */
  async unregisterDevice(tokenId) {
    try {
      const pushToken = await PushToken.findByPk(tokenId);
      if (!pushToken) {
        throw new Error('Push token not found');
      }

      await pushToken.update({ active: false });

      logger.info('Push token unregistered', { tokenId });
      return { success: true };
    } catch (error) {
      logger.error('Error unregistering device', {
        error: error.message,
        tokenId
      });
      throw error;
    }
  }

  /**
   * Get user's registered devices
   */
  async getUserDevices(userId) {
    try {
      const tokens = await PushToken.findAll({
        where: { userId, active: true },
        order: [['lastUsedAt', 'DESC']]
      });

      return tokens;
    } catch (error) {
      logger.error('Error getting user devices', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Clean up inactive tokens (not used in 30+ days)
   */
  async cleanupInactiveTokens() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await PushToken.update(
        { active: false },
        {
          where: {
            active: true,
            lastUsedAt: { [require('sequelize').Op.lt]: thirtyDaysAgo }
          }
        }
      );

      logger.info('Inactive push tokens cleaned up', { count: result[0] });
      return { count: result[0] };
    } catch (error) {
      logger.error('Error cleaning up inactive tokens', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = new PushService();
