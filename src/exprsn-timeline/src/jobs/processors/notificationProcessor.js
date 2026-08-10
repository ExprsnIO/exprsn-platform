/**
 * ═══════════════════════════════════════════════════════════
 * Notification Job Processor
 * Process notification jobs for likes, comments, etc.
 * ═══════════════════════════════════════════════════════════
 */

const logger = require('../../utils/logger');
const heraldService = require('../../services/heraldService');

/**
 * Process notification job
 * Send notification to user about an interaction
 */
async function processNotificationJob(job) {
  const { type, recipientId, actorId, postId, data } = job.data;

  logger.info('Processing notification job', {
    jobId: job.id,
    type,
    recipientId,
    actorId
  });

  try {
    // Send notification via Herald service
    const result = await heraldService.notifyInteraction(
      type,
      recipientId,
      actorId,
      { id: postId },
      data
    );

    if (result.success) {
      logger.info('Notification sent successfully', {
        jobId: job.id,
        type,
        recipientId,
        notificationId: result.notificationId
      });
    } else {
      logger.warn('Notification not sent', {
        jobId: job.id,
        type,
        recipientId,
        reason: result.reason || result.error
      });
    }

    // Return success even if Herald failed - we don't want to retry indefinitely
    return {
      success: result.success,
      type,
      recipientId,
      notificationId: result.notificationId,
      reason: result.reason || result.error
    };
  } catch (error) {
    logger.error('Notification job failed', {
      jobId: job.id,
      type,
      recipientId,
      error: error.message
    });

    throw error;
  }
}

/**
 * Process batch notification job
 * Send multiple notifications at once
 */
async function processBatchNotificationJob(job) {
  const { notifications } = job.data;

  logger.info('Processing batch notification job', {
    jobId: job.id,
    count: notifications.length
  });

  try {
    // Format notifications for Herald batch API
    const heraldNotifications = notifications.map(notification => ({
      userId: notification.recipientId,
      type: notification.type,
      title: getNotificationTitle(notification.type),
      body: getNotificationBody(notification.type, notification.data),
      data: {
        postId: notification.postId,
        actorId: notification.actorId,
        type: notification.type,
        ...notification.data
      }
    }));

    // Send batch notifications via Herald
    const result = await heraldService.sendBatchNotifications(heraldNotifications);

    logger.info('Batch notification completed', {
      jobId: job.id,
      total: result.total,
      succeeded: result.succeeded,
      failed: result.failed
    });

    return {
      success: true,
      total: result.total,
      succeeded: result.succeeded,
      failed: result.failed
    };
  } catch (error) {
    logger.error('Batch notification failed', {
      jobId: job.id,
      error: error.message
    });

    throw error;
  }
}

/**
 * Get notification title based on type
 */
function getNotificationTitle(type) {
  const titles = {
    like: 'New Like',
    repost: 'New Repost',
    comment: 'New Comment',
    reply: 'New Reply',
    mention: 'You were mentioned',
    follow: 'New Follower'
  };
  return titles[type] || 'New Notification';
}

/**
 * Get notification body based on type
 */
function getNotificationBody(type, data = {}) {
  const bodies = {
    like: 'Someone liked your post',
    repost: 'Someone reposted your post',
    comment: data.commentText
      ? `Someone commented: "${data.commentText.substring(0, 50)}${data.commentText.length > 50 ? '...' : ''}"`
      : 'Someone commented on your post',
    reply: data.replyText
      ? `Someone replied: "${data.replyText.substring(0, 50)}${data.replyText.length > 50 ? '...' : ''}"`
      : 'Someone replied to your post',
    mention: 'Someone mentioned you in a post',
    follow: 'Someone started following you'
  };
  return bodies[type] || 'You have a new notification';
}

module.exports = {
  processNotificationJob,
  processBatchNotificationJob
};
