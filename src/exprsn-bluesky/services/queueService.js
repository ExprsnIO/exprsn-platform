const Queue = require('bull');
const { logger } = require('@exprsn/shared');
const timelineIntegration = require('./integrations/timelineIntegration');
const heraldIntegration = require('./integrations/heraldIntegration');
const workflowIntegration = require('./integrations/workflowIntegration');
const moderatorIntegration = require('./integrations/moderatorIntegration');
const syncController = require('../controllers/syncController');

// Queue configurations
const redisConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined
  }
};

// Create queues
const syncQueue = new Queue('bluesky-sync', redisConfig);
const moderationQueue = new Queue('bluesky-moderation', redisConfig);
const notificationQueue = new Queue('bluesky-notifications', redisConfig);
const workflowQueue = new Queue('bluesky-workflows', redisConfig);

// Sync queue processor
syncQueue.process(async (job) => {
  const { type, data } = job.data;

  logger.info('Processing sync job', { type, jobId: job.id });

  try {
    switch (type) {
      case 'sync_post_to_timeline':
        await syncController.syncBlueskyPostToTimeline(data.record);
        break;

      case 'sync_post_to_bluesky':
        if (data.type === 'create') {
          await syncController.syncTimelinePostToBluesky(data.post);
        } else if (data.type === 'update') {
          await syncController.syncTimelineUpdateToBluesky(data.post);
        } else if (data.type === 'delete') {
          await syncController.syncTimelineDeletionToBluesky(data.post);
        } else if (data.type === 'like') {
          await syncController.syncTimelineLikeToBluesky(data.post, data.userId);
        }
        break;

      case 'sync_post_update':
        if (data.exprsnPostId) {
          await timelineIntegration.updatePost(data.exprsnPostId, {
            content: data.text,
            metadata: {
              blueskyUri: data.uri,
              lastSyncedAt: new Date()
            }
          });
        }
        break;

      case 'sync_post_delete':
        if (data.exprsnPostId) {
          await timelineIntegration.deletePost(data.exprsnPostId);
        }
        break;

      default:
        logger.warn('Unknown sync job type', { type });
    }

    logger.info('Sync job completed', { type, jobId: job.id });
  } catch (error) {
    logger.error('Sync job failed', {
      type,
      jobId: job.id,
      error: error.message
    });
    throw error;
  }
});

// Moderation queue processor
moderationQueue.process(async (job) => {
  const { type, data } = job.data;

  logger.info('Processing moderation job', { type, jobId: job.id });

  try {
    switch (type) {
      case 'moderate_post':
        const result = await moderatorIntegration.moderateContent(
          data.text,
          'text'
        );

        if (result.flagged) {
          logger.warn('Content flagged by moderator', {
            uri: data.uri,
            reasons: result.reasons
          });
          // Take action based on moderation result
        }
        break;

      case 'moderate_image':
        await moderatorIntegration.moderateContent(
          data.imageUrl,
          'image'
        );
        break;

      default:
        logger.warn('Unknown moderation job type', { type });
    }

    logger.info('Moderation job completed', { type, jobId: job.id });
  } catch (error) {
    logger.error('Moderation job failed', {
      type,
      jobId: job.id,
      error: error.message
    });
    throw error;
  }
});

// Notification queue processor
notificationQueue.process(async (job) => {
  const { type, data } = job.data;

  logger.info('Processing notification job', { type, jobId: job.id });

  try {
    switch (type) {
      case 'notify_mention':
        await heraldIntegration.notifyMention(data.userId, {
          author: data.author,
          text: data.text,
          uri: data.uri
        });
        break;

      case 'notify_follow':
        await heraldIntegration.notifyFollow(data.userId, {
          handle: data.followerHandle,
          did: data.followerDid
        });
        break;

      case 'notify_like':
        await heraldIntegration.sendNotification({
          userId: data.userId,
          type: 'bluesky_like',
          title: 'New Like',
          message: `${data.likerHandle} liked your post`,
          data: data
        });
        break;

      case 'notify_repost':
        await heraldIntegration.sendNotification({
          userId: data.userId,
          type: 'bluesky_repost',
          title: 'New Repost',
          message: `${data.reposterHandle} reposted your post`,
          data: data
        });
        break;

      default:
        logger.warn('Unknown notification job type', { type });
    }

    logger.info('Notification job completed', { type, jobId: job.id });
  } catch (error) {
    logger.error('Notification job failed', {
      type,
      jobId: job.id,
      error: error.message
    });
    throw error;
  }
});

// Workflow queue processor
workflowQueue.process(async (job) => {
  const { type, data } = job.data;

  logger.info('Processing workflow job', { type, jobId: job.id });

  try {
    switch (type) {
      case 'post_created':
        await workflowIntegration.onPostCreated(data);
        break;

      case 'follow_created':
        await workflowIntegration.onFollowCreated(data);
        break;

      case 'account_created':
        await workflowIntegration.onAccountCreated(data);
        break;

      default:
        logger.warn('Unknown workflow job type', { type });
    }

    logger.info('Workflow job completed', { type, jobId: job.id });
  } catch (error) {
    logger.error('Workflow job failed', {
      type,
      jobId: job.id,
      error: error.message
    });
    // Don't throw - workflows are optional
  }
});

// Queue helpers
const QueueService = {
  // Add sync job
  async syncPost(action, data) {
    return syncQueue.add({
      type: `sync_post_${action}`,
      data
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    });
  },

  // Add moderation job
  async moderateContent(type, data) {
    return moderationQueue.add({
      type: `moderate_${type}`,
      data
    }, {
      attempts: 2,
      backoff: {
        type: 'fixed',
        delay: 5000
      }
    });
  },

  // Add notification job
  async sendNotification(type, data) {
    return notificationQueue.add({
      type: `notify_${type}`,
      data
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000
      }
    });
  },

  // Add workflow job
  async triggerWorkflow(type, data) {
    return workflowQueue.add({
      type,
      data
    }, {
      attempts: 1
    });
  },

  // Get queue stats
  async getStats() {
    const [syncStats, moderationStats, notificationStats, workflowStats] = await Promise.all([
      syncQueue.getJobCounts(),
      moderationQueue.getJobCounts(),
      notificationQueue.getJobCounts(),
      workflowQueue.getJobCounts()
    ]);

    return {
      sync: syncStats,
      moderation: moderationStats,
      notifications: notificationStats,
      workflows: workflowStats
    };
  },

  // Clean completed jobs
  async cleanQueues(grace = 24 * 60 * 60 * 1000) {
    await Promise.all([
      syncQueue.clean(grace, 'completed'),
      moderationQueue.clean(grace, 'completed'),
      notificationQueue.clean(grace, 'completed'),
      workflowQueue.clean(grace, 'completed')
    ]);

    logger.info('Queues cleaned', { grace });
  }
};

module.exports = QueueService;
