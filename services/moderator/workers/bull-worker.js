/**
 * ═══════════════════════════════════════════════════════════
 * Bull Queue Worker
 * Background job processing for moderation tasks
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();
const Bull = require('bull');
const logger = require('../utils/logger');
const config = require('../config');

// Import services
const moderationService = require('../services/moderationService');
const moderationActions = require('../services/moderationActions');
const { ModerationCase, UserAction, Report } = require('../models/sequelize-index');

// ═══════════════════════════════════════════════════════════
// Queue Configuration
// ═══════════════════════════════════════════════════════════

const redisConfig = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
  maxRetriesPerRequest: null,
  enableReadyCheck: false
};

// Create queues
const moderationQueue = new Bull('moderation', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: {
      age: 86400 // Keep completed jobs for 1 day
    },
    removeOnFail: {
      age: 604800 // Keep failed jobs for 7 days
    }
  }
});

const reportQueue = new Bull('reports', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: {
      age: 86400
    },
    removeOnFail: {
      age: 604800
    }
  }
});

const expirationQueue = new Bull('expirations', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    removeOnComplete: {
      age: 86400
    }
  }
});

const statsQueue = new Bull('stats', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 2,
    removeOnComplete: {
      age: 3600
    }
  }
});

const notificationQueue = new Bull('notifications', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    removeOnComplete: {
      age: 3600
    },
    removeOnFail: {
      age: 86400
    }
  }
});

// ═══════════════════════════════════════════════════════════
// Job Processors
// ═══════════════════════════════════════════════════════════

/**
 * Process content moderation requests
 */
moderationQueue.process('moderate-content', async (job) => {
  const { contentType, contentId, content, sourceService, userId } = job.data;

  logger.info('Processing moderation job', {
    jobId: job.id,
    contentType,
    contentId,
    sourceService
  });

  try {
    // Run moderation analysis
    const result = await moderationService.moderateContent({
      contentType,
      contentId,
      sourceService,
      userId,
      content
    });

    logger.info('Moderation job completed', {
      jobId: job.id,
      contentId,
      decision: result.decision,
      riskScore: result.riskScore
    });

    // Update job progress
    await job.progress(100);

    return result;
  } catch (error) {
    logger.error('Moderation job failed', {
      jobId: job.id,
      error: error.message,
      contentId
    });
    throw error;
  }
});

/**
 * Process user reports
 */
reportQueue.process('process-report', async (job) => {
  const { reportId } = job.data;

  logger.info('Processing report job', {
    jobId: job.id,
    reportId
  });

  try {
    // Get report details
    const report = await Report.findByPk(reportId);
    if (!report) {
      throw new Error('Report not found');
    }

    // Check if content already has a moderation case
    let moderationCase = await ModerationCase.findOne({
      where: {
        contentId: report.contentId,
        contentType: report.contentType,
        status: ['pending', 'reviewing']
      }
    });

    // If no existing case, create moderation request
    if (!moderationCase) {
      const moderationResult = await moderationService.moderateContent({
        contentType: report.contentType,
        contentId: report.contentId,
        sourceService: report.sourceService,
        userId: report.reportedUserId,
        content: report.contentSnapshot || {},
        reason: `User report: ${report.reason}`
      });

      moderationCase = moderationResult.moderationCase;
    }

    // Update report status
    await report.update({
      status: 'reviewed',
      moderationCaseId: moderationCase.id,
      processedAt: Date.now()
    });

    logger.info('Report processed', {
      jobId: job.id,
      reportId,
      moderationCaseId: moderationCase.id
    });

    await job.progress(100);

    return { reportId, moderationCaseId: moderationCase.id };
  } catch (error) {
    logger.error('Report processing failed', {
      jobId: job.id,
      reportId,
      error: error.message
    });
    throw error;
  }
});

/**
 * Expire temporary user actions
 */
expirationQueue.process('expire-actions', async (job) => {
  logger.info('Processing action expiration job', { jobId: job.id });

  try {
    const { Op } = require('sequelize');
    const now = Date.now();

    // Find expired actions
    const expiredActions = await UserAction.findAll({
      where: {
        active: true,
        expiresAt: {
          [Op.lte]: now,
          [Op.ne]: null
        }
      }
    });

    logger.info('Found expired actions', {
      jobId: job.id,
      count: expiredActions.length
    });

    // Expire each action
    for (const action of expiredActions) {
      await action.update({
        active: false,
        expiredAt: now
      });

      logger.info('Action expired', {
        actionId: action.id,
        userId: action.userId,
        actionType: action.actionType
      });
    }

    await job.progress(100);

    return {
      expiredCount: expiredActions.length,
      timestamp: now
    };
  } catch (error) {
    logger.error('Expiration job failed', {
      jobId: job.id,
      error: error.message
    });
    throw error;
  }
});

/**
 * Calculate moderation statistics
 */
statsQueue.process('calculate-stats', async (job) => {
  logger.info('Processing stats calculation job', { jobId: job.id });

  try {
    const { Op } = require('sequelize');
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    // Calculate various statistics
    const [
      totalCases,
      pendingCases,
      reviewingCases,
      resolvedCases,
      cases24h,
      cases7d,
      autoApproved24h,
      autoRejected24h,
      manualReview24h
    ] = await Promise.all([
      ModerationCase.count(),
      ModerationCase.count({ where: { status: 'pending' } }),
      ModerationCase.count({ where: { status: 'reviewing' } }),
      ModerationCase.count({ where: { status: ['approved', 'rejected'] } }),
      ModerationCase.count({ where: { createdAt: { [Op.gte]: oneDayAgo } } }),
      ModerationCase.count({ where: { createdAt: { [Op.gte]: oneWeekAgo } } }),
      ModerationCase.count({
        where: {
          decision: 'approved',
          automated: true,
          createdAt: { [Op.gte]: oneDayAgo }
        }
      }),
      ModerationCase.count({
        where: {
          decision: 'rejected',
          automated: true,
          createdAt: { [Op.gte]: oneDayAgo }
        }
      }),
      ModerationCase.count({
        where: {
          status: 'reviewing',
          automated: false,
          createdAt: { [Op.gte]: oneDayAgo }
        }
      })
    ]);

    const stats = {
      total: totalCases,
      pending: pendingCases,
      reviewing: reviewingCases,
      resolved: resolvedCases,
      last24h: cases24h,
      last7d: cases7d,
      automation: {
        autoApproved24h,
        autoRejected24h,
        manualReview24h,
        automationRate: cases24h > 0
          ? Math.round(((autoApproved24h + autoRejected24h) / cases24h) * 100)
          : 0
      },
      timestamp: Date.now()
    };

    logger.info('Statistics calculated', {
      jobId: job.id,
      stats
    });

    await job.progress(100);

    return stats;
  } catch (error) {
    logger.error('Stats calculation failed', {
      jobId: job.id,
      error: error.message
    });
    throw error;
  }
});

/**
 * Send notifications via Herald service
 */
notificationQueue.process('send-notification', async (job) => {
  const { type, userId, data } = job.data;

  logger.info('Processing notification job', {
    jobId: job.id,
    type,
    userId
  });

  try {
    // Import Herald client (will be created next)
    const heraldClient = require('../services/heraldClient');

    // Send notification
    await heraldClient.notifyUser(userId, type, data);

    logger.info('Notification sent', {
      jobId: job.id,
      type,
      userId
    });

    await job.progress(100);

    return { type, userId, sent: true };
  } catch (error) {
    logger.error('Notification job failed', {
      jobId: job.id,
      type,
      userId,
      error: error.message
    });
    // Don't throw - notifications are non-critical
    return { type, userId, sent: false, error: error.message };
  }
});

// ═══════════════════════════════════════════════════════════
// Event Handlers
// ═══════════════════════════════════════════════════════════

// Job completed handlers
moderationQueue.on('completed', (job, result) => {
  logger.debug('Moderation job completed', {
    jobId: job.id,
    result
  });
});

reportQueue.on('completed', (job, result) => {
  logger.debug('Report job completed', {
    jobId: job.id,
    result
  });
});

expirationQueue.on('completed', (job, result) => {
  logger.debug('Expiration job completed', {
    jobId: job.id,
    result
  });
});

statsQueue.on('completed', (job, result) => {
  logger.debug('Stats job completed', {
    jobId: job.id
  });
});

notificationQueue.on('completed', (job, result) => {
  logger.debug('Notification job completed', {
    jobId: job.id
  });
});

// Job failed handlers
moderationQueue.on('failed', (job, err) => {
  logger.error('Moderation job failed', {
    jobId: job.id,
    error: err.message,
    attemptsMade: job.attemptsMade
  });
});

reportQueue.on('failed', (job, err) => {
  logger.error('Report job failed', {
    jobId: job.id,
    error: err.message,
    attemptsMade: job.attemptsMade
  });
});

expirationQueue.on('failed', (job, err) => {
  logger.error('Expiration job failed', {
    jobId: job.id,
    error: err.message
  });
});

statsQueue.on('failed', (job, err) => {
  logger.error('Stats job failed', {
    jobId: job.id,
    error: err.message
  });
});

notificationQueue.on('failed', (job, err) => {
  logger.error('Notification job failed', {
    jobId: job.id,
    error: err.message
  });
});

// ═══════════════════════════════════════════════════════════
// Scheduled Jobs
// ═══════════════════════════════════════════════════════════

// Schedule expiration check every 5 minutes
expirationQueue.add('expire-actions', {}, {
  repeat: {
    every: 5 * 60 * 1000 // 5 minutes
  },
  jobId: 'expiration-check'
});

// Schedule stats calculation every 15 minutes
statsQueue.add('calculate-stats', {}, {
  repeat: {
    every: 15 * 60 * 1000 // 15 minutes
  },
  jobId: 'stats-calculation'
});

logger.info('Scheduled jobs configured', {
  expirationCheck: '5 minutes',
  statsCalculation: '15 minutes'
});

// ═══════════════════════════════════════════════════════════
// Graceful Shutdown
// ═══════════════════════════════════════════════════════════

const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received, shutting down Bull worker gracefully`);

  try {
    await Promise.all([
      moderationQueue.close(),
      reportQueue.close(),
      expirationQueue.close(),
      statsQueue.close(),
      notificationQueue.close()
    ]);

    logger.info('All queues closed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception in worker', {
    error: err.message,
    stack: err.stack
  });
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection in worker', {
    error: err.message,
    stack: err.stack
  });
  process.exit(1);
});

// ═══════════════════════════════════════════════════════════
// Export Queues
// ═══════════════════════════════════════════════════════════

module.exports = {
  moderationQueue,
  reportQueue,
  expirationQueue,
  statsQueue,
  notificationQueue
};

logger.info('Bull worker started successfully', {
  queues: ['moderation', 'reports', 'expirations', 'stats', 'notifications'],
  redis: `${config.redis.host}:${config.redis.port}`
});
