/**
 * Exprsn Herald - Push Notification Job Processor
 */

const pushService = require('../services/pushService');
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');

/**
 * Process push notification job
 */
async function process(job) {
  const { notificationId, userId, title, body, data, badge, sound } = job.data;

  try {
    logger.info('Processing push job', { jobId: job.id, notificationId });

    // Send push notification
    const result = await pushService.sendPushNotification({
      userId,
      title,
      body,
      data,
      badge,
      sound,
      notificationId
    });

    // Update notification status
    if (notificationId && result.success) {
      await notificationService.sendNotification(notificationId);
    } else if (notificationId && !result.success) {
      await notificationService.markAsFailed(
        notificationId,
        result.reason || 'Push notification failed'
      );
    }

    logger.info('Push job completed', {
      jobId: job.id,
      notificationId,
      sentCount: result.sentCount
    });

    return result;
  } catch (error) {
    logger.error('Push job failed', {
      jobId: job.id,
      notificationId,
      error: error.message
    });

    // Mark notification as failed
    if (notificationId) {
      await notificationService.markAsFailed(notificationId, error.message);
    }

    throw error;
  }
}

module.exports = { process };
