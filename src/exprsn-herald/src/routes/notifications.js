/**
 * Exprsn Herald - Notifications Routes
 */

const express = require('express');
const router = express.Router();
const notificationService = require('../services/notificationService');
const preferenceService = require('../services/preferenceService');
const { emailQueue, pushQueue, smsQueue } = require('../jobs');
const { requireAuth } = require('../middleware/auth');
const { validateCreateNotification } = require('../middleware/validation');
const logger = require('../utils/logger');

/**
 * GET /api/notifications
 * Get user notifications with filters
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      status = null,
      channel = null,
      limit = 20,
      offset = 0,
      unreadOnly = false
    } = req.query;

    const result = await notificationService.getNotifications(userId, {
      status,
      channel,
      limit,
      offset,
      unreadOnly: unreadOnly === 'true'
    });

    res.json(result);
  } catch (error) {
    logger.error('Error getting notifications', {
      error: error.message,
      userId: req.user?.id
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/notifications/unread-count
 * Get unread notification count for user
 */
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await notificationService.getUnreadCount(userId);
    res.json(result);
  } catch (error) {
    logger.error('Error getting unread count', {
      error: error.message,
      userId: req.user?.id
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/notifications
 * Create and send notification
 */
router.post('/', requireAuth, validateCreateNotification, async (req, res) => {
  try {
    const { userId, type, channel, title, body, data, priority, expiresAt } = req.body;

    // Check user preferences before sending
    const shouldNotify = await preferenceService.checkShouldNotify(
      userId,
      type,
      channel
    );

    if (!shouldNotify.shouldNotify) {
      return res.status(200).json({
        success: false,
        reason: shouldNotify.reason || 'User preferences disabled',
        message: 'Notification not sent due to user preferences'
      });
    }

    // Create notification
    const notification = await notificationService.createNotification(userId, {
      type,
      channel,
      title,
      body,
      data,
      priority,
      expiresAt
    });

    // Queue notification for delivery based on channel
    switch (channel) {
      case 'email':
        await emailQueue.add({
          notificationId: notification.id,
          to: userId, // Should be user's email
          subject: title,
          body
        });
        break;

      case 'push':
        await pushQueue.add({
          notificationId: notification.id,
          userId,
          title,
          body,
          data,
          badge: data.badge || null
        });
        break;

      case 'sms':
        await smsQueue.add({
          notificationId: notification.id,
          to: data.phoneNumber, // Must be provided in data
          body: `${title}\n${body}`
        });
        break;

      case 'in-app':
        // Send immediately via Socket.IO
        const io = req.app.get('io');
        io.to(`user:${userId}`).emit('notification', {
          id: notification.id,
          type,
          title,
          body,
          data,
          priority,
          timestamp: notification.createdAt
        });
        await notificationService.sendNotification(notification.id);
        break;
    }

    res.status(201).json({
      success: true,
      notification: {
        id: notification.id,
        channel,
        status: notification.status
      }
    });
  } catch (error) {
    logger.error('Error creating notification', {
      error: error.message,
      userId: req.user?.id
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/notifications/:id/read
 * Mark notification as read
 */
router.put('/:id/read', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await notificationService.markAsRead(id, userId);

    res.json({
      success: true,
      notification: {
        id: notification.id,
        readAt: notification.readAt
      }
    });
  } catch (error) {
    logger.error('Error marking notification as read', {
      error: error.message,
      notificationId: req.params.id,
      userId: req.user?.id
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read
 */
router.put('/read-all', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await notificationService.markAllAsRead(userId);

    res.json({
      success: true,
      message: `${result.count} notifications marked as read`
    });
  } catch (error) {
    logger.error('Error marking all notifications as read', {
      error: error.message,
      userId: req.user?.id
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete notification
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await notificationService.deleteNotification(id, userId);

    res.json({
      success: true,
      message: 'Notification deleted'
    });
  } catch (error) {
    logger.error('Error deleting notification', {
      error: error.message,
      notificationId: req.params.id,
      userId: req.user?.id
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/notifications/:id
 * Get single notification
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notifications = await notificationService.getNotifications(userId, {
      limit: 1
    });

    const notification = notifications.notifications.find(n => n.id === id);

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ notification });
  } catch (error) {
    logger.error('Error getting notification', {
      error: error.message,
      notificationId: req.params.id,
      userId: req.user?.id
    });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
