/**
 * ═══════════════════════════════════════════════════════════
 * Job Queue Service
 * High-level interface for adding jobs to Bull queues
 * ═══════════════════════════════════════════════════════════
 */

const Bull = require('bull');
const logger = require('../utils/logger');
const config = require('../config');

class JobQueueService {
  constructor() {
    this.queues = {};
    this._initializeQueues();
  }

  /**
   * Initialize all queues
   * @private
   */
  _initializeQueues() {
    const redisConfig = {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      maxRetriesPerRequest: null,
      enableReadyCheck: false
    };

    // Create queue instances
    this.queues.moderation = new Bull('moderation', { redis: redisConfig });
    this.queues.reports = new Bull('reports', { redis: redisConfig });
    this.queues.expirations = new Bull('expirations', { redis: redisConfig });
    this.queues.stats = new Bull('stats', { redis: redisConfig });
    this.queues.notifications = new Bull('notifications', { redis: redisConfig });

    logger.info('Job queues initialized', {
      queues: Object.keys(this.queues)
    });
  }

  /**
   * Add content moderation job
   * @param {Object} params - Moderation parameters
   * @param {Object} options - Job options
   * @returns {Promise<Object>} Job
   */
  async addModerationJob(params, options = {}) {
    try {
      const {
        contentType,
        contentId,
        content,
        sourceService,
        userId
      } = params;

      const job = await this.queues.moderation.add('moderate-content', {
        contentType,
        contentId,
        content,
        sourceService,
        userId
      }, {
        priority: options.priority || 5,
        attempts: options.attempts || 3,
        ...options
      });

      logger.info('Moderation job added', {
        jobId: job.id,
        contentType,
        contentId,
        sourceService
      });

      return job;
    } catch (error) {
      logger.error('Failed to add moderation job', {
        error: error.message,
        params
      });
      throw error;
    }
  }

  /**
   * Add report processing job
   * @param {string} reportId - Report ID
   * @param {Object} options - Job options
   * @returns {Promise<Object>} Job
   */
  async addReportJob(reportId, options = {}) {
    try {
      const job = await this.queues.reports.add('process-report', {
        reportId
      }, {
        priority: options.priority || 7, // Reports get higher priority
        attempts: options.attempts || 3,
        ...options
      });

      logger.info('Report job added', {
        jobId: job.id,
        reportId
      });

      return job;
    } catch (error) {
      logger.error('Failed to add report job', {
        error: error.message,
        reportId
      });
      throw error;
    }
  }

  /**
   * Add action expiration job
   * @param {Object} options - Job options
   * @returns {Promise<Object>} Job
   */
  async addExpirationJob(options = {}) {
    try {
      const job = await this.queues.expirations.add('expire-actions', {}, {
        attempts: options.attempts || 2,
        ...options
      });

      logger.debug('Expiration job added', {
        jobId: job.id
      });

      return job;
    } catch (error) {
      logger.error('Failed to add expiration job', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Add statistics calculation job
   * @param {Object} options - Job options
   * @returns {Promise<Object>} Job
   */
  async addStatsJob(options = {}) {
    try {
      const job = await this.queues.stats.add('calculate-stats', {}, {
        attempts: options.attempts || 2,
        ...options
      });

      logger.debug('Stats job added', {
        jobId: job.id
      });

      return job;
    } catch (error) {
      logger.error('Failed to add stats job', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Add notification job
   * @param {Object} params - Notification parameters
   * @param {Object} options - Job options
   * @returns {Promise<Object>} Job
   */
  async addNotificationJob(params, options = {}) {
    try {
      const { type, userId, data } = params;

      const job = await this.queues.notifications.add('send-notification', {
        type,
        userId,
        data
      }, {
        priority: options.priority || 5,
        attempts: options.attempts || 3,
        ...options
      });

      logger.debug('Notification job added', {
        jobId: job.id,
        type,
        userId
      });

      return job;
    } catch (error) {
      logger.error('Failed to add notification job', {
        error: error.message,
        params
      });
      // Don't throw - notifications are non-critical
      return null;
    }
  }

  /**
   * Get job by ID
   * @param {string} queueName - Queue name
   * @param {string} jobId - Job ID
   * @returns {Promise<Object>} Job
   */
  async getJob(queueName, jobId) {
    try {
      const queue = this.queues[queueName];
      if (!queue) {
        throw new Error(`Queue not found: ${queueName}`);
      }

      const job = await queue.getJob(jobId);
      return job;
    } catch (error) {
      logger.error('Failed to get job', {
        error: error.message,
        queueName,
        jobId
      });
      throw error;
    }
  }

  /**
   * Get job status
   * @param {string} queueName - Queue name
   * @param {string} jobId - Job ID
   * @returns {Promise<Object>} Job status
   */
  async getJobStatus(queueName, jobId) {
    try {
      const job = await this.getJob(queueName, jobId);
      if (!job) {
        return null;
      }

      const state = await job.getState();
      const progress = job._progress;
      const result = job.returnvalue;
      const failedReason = job.failedReason;

      return {
        jobId: job.id,
        state,
        progress,
        result,
        failedReason,
        attemptsMade: job.attemptsMade,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn
      };
    } catch (error) {
      logger.error('Failed to get job status', {
        error: error.message,
        queueName,
        jobId
      });
      throw error;
    }
  }

  /**
   * Pause queue
   * @param {string} queueName - Queue name
   * @returns {Promise<void>}
   */
  async pauseQueue(queueName) {
    try {
      const queue = this.queues[queueName];
      if (!queue) {
        throw new Error(`Queue not found: ${queueName}`);
      }

      await queue.pause();
      logger.info('Queue paused', { queueName });
    } catch (error) {
      logger.error('Failed to pause queue', {
        error: error.message,
        queueName
      });
      throw error;
    }
  }

  /**
   * Resume queue
   * @param {string} queueName - Queue name
   * @returns {Promise<void>}
   */
  async resumeQueue(queueName) {
    try {
      const queue = this.queues[queueName];
      if (!queue) {
        throw new Error(`Queue not found: ${queueName}`);
      }

      await queue.resume();
      logger.info('Queue resumed', { queueName });
    } catch (error) {
      logger.error('Failed to resume queue', {
        error: error.message,
        queueName
      });
      throw error;
    }
  }

  /**
   * Clean queue (remove completed/failed jobs)
   * @param {string} queueName - Queue name
   * @param {number} grace - Grace period in milliseconds
   * @param {string} status - Job status to clean ('completed', 'failed')
   * @returns {Promise<Array>} Cleaned job IDs
   */
  async cleanQueue(queueName, grace = 86400000, status = 'completed') {
    try {
      const queue = this.queues[queueName];
      if (!queue) {
        throw new Error(`Queue not found: ${queueName}`);
      }

      const cleaned = await queue.clean(grace, status);
      logger.info('Queue cleaned', {
        queueName,
        status,
        cleanedCount: cleaned.length
      });

      return cleaned;
    } catch (error) {
      logger.error('Failed to clean queue', {
        error: error.message,
        queueName
      });
      throw error;
    }
  }

  /**
   * Get queue statistics
   * @param {string} queueName - Queue name
   * @returns {Promise<Object>} Queue stats
   */
  async getQueueStats(queueName) {
    try {
      const queue = this.queues[queueName];
      if (!queue) {
        throw new Error(`Queue not found: ${queueName}`);
      }

      const [
        waiting,
        active,
        completed,
        failed,
        delayed,
        paused
      ] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
        queue.getPausedCount()
      ]);

      const isPaused = await queue.isPaused();

      return {
        queueName,
        isPaused,
        counts: {
          waiting,
          active,
          completed,
          failed,
          delayed,
          paused
        },
        total: waiting + active + completed + failed + delayed
      };
    } catch (error) {
      logger.error('Failed to get queue stats', {
        error: error.message,
        queueName
      });
      throw error;
    }
  }

  /**
   * Get all queue statistics
   * @returns {Promise<Object>} All queue stats
   */
  async getAllQueueStats() {
    try {
      const stats = {};

      for (const queueName of Object.keys(this.queues)) {
        stats[queueName] = await this.getQueueStats(queueName);
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get all queue stats', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get failed jobs
   * @param {string} queueName - Queue name
   * @param {number} start - Start index
   * @param {number} end - End index
   * @returns {Promise<Array>} Failed jobs
   */
  async getFailedJobs(queueName, start = 0, end = 10) {
    try {
      const queue = this.queues[queueName];
      if (!queue) {
        throw new Error(`Queue not found: ${queueName}`);
      }

      const jobs = await queue.getFailed(start, end);
      return jobs.map(job => ({
        id: job.id,
        data: job.data,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn
      }));
    } catch (error) {
      logger.error('Failed to get failed jobs', {
        error: error.message,
        queueName
      });
      throw error;
    }
  }

  /**
   * Retry failed job
   * @param {string} queueName - Queue name
   * @param {string} jobId - Job ID
   * @returns {Promise<void>}
   */
  async retryJob(queueName, jobId) {
    try {
      const job = await this.getJob(queueName, jobId);
      if (!job) {
        throw new Error('Job not found');
      }

      await job.retry();
      logger.info('Job retried', {
        queueName,
        jobId
      });
    } catch (error) {
      logger.error('Failed to retry job', {
        error: error.message,
        queueName,
        jobId
      });
      throw error;
    }
  }

  /**
   * Remove job
   * @param {string} queueName - Queue name
   * @param {string} jobId - Job ID
   * @returns {Promise<void>}
   */
  async removeJob(queueName, jobId) {
    try {
      const job = await this.getJob(queueName, jobId);
      if (!job) {
        throw new Error('Job not found');
      }

      await job.remove();
      logger.info('Job removed', {
        queueName,
        jobId
      });
    } catch (error) {
      logger.error('Failed to remove job', {
        error: error.message,
        queueName,
        jobId
      });
      throw error;
    }
  }

  /**
   * Close all queues
   * @returns {Promise<void>}
   */
  async closeAll() {
    try {
      await Promise.all(
        Object.values(this.queues).map(queue => queue.close())
      );
      logger.info('All queues closed');
    } catch (error) {
      logger.error('Failed to close queues', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = new JobQueueService();
