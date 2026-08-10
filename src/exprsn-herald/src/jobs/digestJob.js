/**
 * Exprsn Herald - Digest Notification Job Processor
 * Groups notifications by user and sends digest emails
 */

const { Notification, NotificationPreference } = require('../models');
const emailService = require('../services/emailService');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * Process digest notification job
 */
async function process(job) {
  const { frequency = 'daily' } = job.data;

  try {
    logger.info('Processing digest job', { jobId: job.id, frequency });

    // Determine time range based on frequency
    const now = new Date();
    const startTime = new Date();

    if (frequency === 'daily') {
      startTime.setDate(startTime.getDate() - 1);
    } else if (frequency === 'weekly') {
      startTime.setDate(startTime.getDate() - 7);
    } else {
      throw new Error(`Unsupported frequency: ${frequency}`);
    }

    // Find users with digest preferences
    const preferences = await NotificationPreference.findAll({
      where: {
        channel: 'email',
        frequency,
        enabled: true
      }
    });

    logger.info(`Found ${preferences.length} users with ${frequency} digest preference`);

    let digestsSent = 0;

    // Process each user
    for (const pref of preferences) {
      try {
        // Get unread notifications for this user in the time range
        const notifications = await Notification.findAll({
          where: {
            userId: pref.userId,
            status: 'sent',
            readAt: null,
            createdAt: {
              [Op.between]: [startTime, now]
            },
            channel: 'in-app' // Only include in-app notifications in digest
          },
          order: [['createdAt', 'DESC']],
          limit: 50 // Limit to 50 notifications per digest
        });

        if (notifications.length === 0) {
          continue; // No notifications to send
        }

        // Build digest email
        const subject = `Your ${frequency} notification digest (${notifications.length} updates)`;
        const body = buildDigestEmail(notifications, frequency);

        // Send digest email
        await emailService.sendEmail({
          to: pref.userId, // This should be user's email - needs user lookup
          subject,
          body,
          html: body
        });

        digestsSent++;

        logger.info('Digest sent', {
          userId: pref.userId,
          frequency,
          notificationCount: notifications.length
        });
      } catch (error) {
        logger.error('Error sending digest to user', {
          userId: pref.userId,
          error: error.message
        });
        // Continue with next user
      }
    }

    logger.info('Digest job completed', {
      jobId: job.id,
      frequency,
      digestsSent
    });

    return { digestsSent };
  } catch (error) {
    logger.error('Digest job failed', {
      jobId: job.id,
      frequency,
      error: error.message
    });
    throw error;
  }
}

/**
 * Build digest email HTML
 */
function buildDigestEmail(notifications, frequency) {
  let html = `
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .notification { padding: 15px; margin: 10px 0; border-left: 4px solid #007bff; background: #f8f9fa; }
        .notification.success { border-color: #28a745; }
        .notification.warning { border-color: #ffc107; }
        .notification.error { border-color: #dc3545; }
        .notification-title { font-weight: bold; margin-bottom: 5px; }
        .notification-body { color: #6c757d; }
        .notification-time { font-size: 12px; color: #999; margin-top: 5px; }
      </style>
    </head>
    <body>
      <h2>Your ${frequency.charAt(0).toUpperCase() + frequency.slice(1)} Notification Digest</h2>
      <p>Here's what happened while you were away:</p>
  `;

  for (const notification of notifications) {
    const timeAgo = getTimeAgo(notification.createdAt);

    html += `
      <div class="notification ${notification.type}">
        <div class="notification-title">${escapeHtml(notification.title)}</div>
        <div class="notification-body">${escapeHtml(notification.body)}</div>
        <div class="notification-time">${timeAgo}</div>
      </div>
    `;
  }

  html += `
      <p style="margin-top: 30px; color: #6c757d;">
        To change your notification preferences, visit your account settings.
      </p>
    </body>
    </html>
  `;

  return html;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Get human-readable time ago
 */
function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);

  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60
  };

  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
    }
  }

  return 'just now';
}

module.exports = { process };
