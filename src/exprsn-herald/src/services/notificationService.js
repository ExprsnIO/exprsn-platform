/**
 * Exprsn Herald - Notification Service
 * Core service for creating and managing notifications
 */

const { Notification, DeliveryLog } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

class NotificationService {
  /**
   * Create a new notification
   */
  async createNotification(userId, {
    type = 'info',
    channel = 'in-app',
    title,
    body,
    data = {},
    priority = 'normal',
    expiresAt = null
  }) {
    try {
      if (!userId) {
        throw new Error('userId is required');
      }
      if (!title || !body) {
        throw new Error('title and body are required');
      }

      const notification = await Notification.create({
        userId,
        type,
        channel,
        title,
        body,
        data,
        priority,
        expiresAt,
        status: 'pending'
      });

      logger.info('Notification created', {
        notificationId: notification.id,
        userId,
        type,
        channel
      });

      return notification;
    } catch (error) {
      logger.error('Error creating notification', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Send notification (mark as sent and update timestamp)
   */
  async sendNotification(notificationId) {
    try {
      const notification = await Notification.findByPk(notificationId);
      if (!notification) {
        throw new Error('Notification not found');
      }

      await notification.update({
        status: 'sent',
        deliveredAt: new Date()
      });

      logger.info('Notification sent', { notificationId });
      return notification;
    } catch (error) {
      logger.error('Error sending notification', {
        error: error.message,
        notificationId
      });
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId, userId) {
    try {
      const notification = await Notification.findOne({
        where: { id: notificationId, userId }
      });

      if (!notification) {
        throw new Error('Notification not found');
      }

      if (notification.readAt) {
        return notification; // Already read
      }

      await notification.update({
        status: 'read',
        readAt: new Date()
      });

      logger.info('Notification marked as read', { notificationId, userId });
      return notification;
    } catch (error) {
      logger.error('Error marking notification as read', {
        error: error.message,
        notificationId,
        userId
      });
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId) {
    try {
      const result = await Notification.update(
        {
          status: 'read',
          readAt: new Date()
        },
        {
          where: {
            userId,
            status: { [Op.ne]: 'read' },
            readAt: null
          }
        }
      );

      logger.info('All notifications marked as read', {
        userId,
        count: result[0]
      });

      return { count: result[0] };
    } catch (error) {
      logger.error('Error marking all notifications as read', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Get notifications for a user
   */
  async getNotifications(userId, {
    status = null,
    channel = null,
    limit = 20,
    offset = 0,
    unreadOnly = false
  } = {}) {
    try {
      const where = { userId };

      if (status) {
        where.status = status;
      }

      if (channel) {
        where.channel = channel;
      }

      if (unreadOnly) {
        where.readAt = null;
        where.status = { [Op.ne]: 'read' };
      }

      // Exclude expired notifications
      where[Op.or] = [
        { expiresAt: null },
        { expiresAt: { [Op.gt]: new Date() } }
      ];

      const { rows: notifications, count } = await Notification.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']],
        include: [
          {
            model: DeliveryLog,
            as: 'deliveryLogs',
            required: false
          }
        ]
      });

      return {
        notifications,
        pagination: {
          total: count,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(count / limit)
        }
      };
    } catch (error) {
      logger.error('Error getting notifications', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(userId) {
    try {
      const count = await Notification.count({
        where: {
          userId,
          readAt: null,
          status: { [Op.ne]: 'read' },
          [Op.or]: [
            { expiresAt: null },
            { expiresAt: { [Op.gt]: new Date() } }
          ]
        }
      });

      return { count };
    } catch (error) {
      logger.error('Error getting unread count', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Delete a notification
   */
  async deleteNotification(notificationId, userId) {
    try {
      const notification = await Notification.findOne({
        where: { id: notificationId, userId }
      });

      if (!notification) {
        throw new Error('Notification not found');
      }

      await notification.destroy();

      logger.info('Notification deleted', { notificationId, userId });
      return { success: true };
    } catch (error) {
      logger.error('Error deleting notification', {
        error: error.message,
        notificationId,
        userId
      });
      throw error;
    }
  }

  /**
   * Mark notification as failed
   */
  async markAsFailed(notificationId, errorMessage) {
    try {
      const notification = await Notification.findByPk(notificationId);
      if (!notification) {
        throw new Error('Notification not found');
      }

      await notification.update({
        status: 'failed'
      });

      logger.warn('Notification marked as failed', {
        notificationId,
        error: errorMessage
      });

      return notification;
    } catch (error) {
      logger.error('Error marking notification as failed', {
        error: error.message,
        notificationId
      });
      throw error;
    }
  }

  /**
   * Clean up expired notifications
   */
  async cleanupExpired() {
    try {
      const result = await Notification.destroy({
        where: {
          expiresAt: { [Op.lt]: new Date() }
        }
      });

      logger.info('Expired notifications cleaned up', { count: result });
      return { count: result };
    } catch (error) {
      logger.error('Error cleaning up expired notifications', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = new NotificationService();
