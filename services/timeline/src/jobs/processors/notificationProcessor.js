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
    // FEAT-011 N1b: producer-side suppression for the MENTION path. Mentions do
    // NOT flow through heraldService.notifyInteraction (N1a) — they are enqueued
    // as a batch-notification Bull job (postService.queuePostJobs) and consumed
    // HERE, in the standalone worker:timeline process. Drop any recipient who has
    // blocked/muted the mentioner: getSuppressedIds(recipient) ∋ actorId. The
    // recipient set is bounded by mentions-per-post (a handful), so one call per
    // recipient is not the feed N+1 the read-path binding guards against.
    // relationshipService is require-able + DB-attached here (worker.js boots the
    // same timeline Sequelize / same pool). Fail-CLOSED per recipient on error.
    //
    // getSuppressedIds requires the recipient's UUID, and the id used for the
    // suppression check MUST be the SAME id used to deliver — otherwise the guard
    // and the delivery can silently diverge. The current mention producer
    // (postService.queuePostJobs) emits `recipientUsername` and NOT a
    // `recipientId`, and timeline has no in-module username->userId resolver
    // (adding an auth hop is out of scope per the FEAT-011 ADR — no new
    // *_SERVICE_URL). So we resolve the delivery target ONCE into `recipientId`
    // and key both the filter and the herald mapping on it, and FAIL CLOSED: a
    // notification we cannot resolve to a recipient UUID is dropped rather than
    // delivered un-suppressed. This makes the guard non-vacuous and guarantees it
    // can never silently fail — any future repair that makes a mention deliverable
    // MUST populate `recipientId`, which is exactly the field the guard reads.
    // eslint-disable-next-line global-require
    const relationshipService = require('../../services/relationshipService');
    const deliverable = [];
    for (const notification of notifications) {
      const actorId = notification.actorId;
      const recipientId = notification.recipientId;
      if (!recipientId) {
        // Unresolved recipient (producer emitted only a username): not
        // deliverable and not suppression-checkable — drop (fail-closed).
        logger.debug('mention notification dropped: unresolved recipient (no recipientId)', {
          jobId: job.id,
          recipientUsername: notification.recipientUsername
        });
        continue;
      }
      if (actorId) {
        let suppressed;
        try {
          suppressed = (await relationshipService.getSuppressedIds(recipientId)) || [];
        } catch (err) {
          logger.warn('mention suppression check failed; dropping (fail-closed)', {
            jobId: job.id,
            recipientId,
            error: err.message
          });
          continue;
        }
        if (suppressed.includes(actorId)) {
          logger.debug('mention notification suppressed (block/mute)', { jobId: job.id, recipientId });
          continue;
        }
      }
      // Carry the resolved recipient id explicitly so the herald mapping below
      // delivers to the SAME id the suppression check ran against.
      deliverable.push({ ...notification, recipientId });
    }

    // Format notifications for Herald batch API
    const heraldNotifications = deliverable.map(notification => ({
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
