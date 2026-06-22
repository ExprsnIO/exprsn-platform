/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Prefetch - Activity-Based Strategy
 * ═══════════════════════════════════════════════════════════════════════
 */

const logger = require('../utils/logger');
const { prefetchTimeline } = require('../services/prefetchService');

/**
 * Activity-based prefetching strategy
 * Prefetch timelines for recently active users
 */
class ActivityBasedStrategy {
  constructor() {
    this.name = 'activity-based';
    this.recentlyActiveUsers = new Set();
  }

  /**
   * Track user activity
   */
  trackActivity(userId) {
    this.recentlyActiveUsers.add(userId);
    logger.debug(`Tracked activity for user ${userId}`);
  }

  /**
   * Schedule prefetch jobs for active users (uses Bull queue)
   */
  async schedule() {
    try {
      const userIds = Array.from(this.recentlyActiveUsers);

      if (userIds.length === 0) {
        logger.debug('No recently active users to prefetch');
        return { scheduled: 0 };
      }

      logger.info(`Scheduling activity-based prefetch for ${userIds.length} users`);

      // Queue prefetch jobs for all active users
      const { queueBatchPrefetch } = require('../queues/prefetchQueue');
      await queueBatchPrefetch(userIds, 'high');

      // Clear tracked users
      this.recentlyActiveUsers.clear();

      logger.info(`Activity-based prefetch jobs scheduled: ${userIds.length} jobs`);

      return {
        scheduled: userIds.length
      };
    } catch (error) {
      logger.error('Error scheduling activity-based prefetch:', error);
      return { scheduled: 0, error: error.message };
    }
  }

  /**
   * Run prefetch for active users (direct execution, for backward compatibility)
   */
  async run() {
    try {
      const userIds = Array.from(this.recentlyActiveUsers);

      if (userIds.length === 0) {
        logger.debug('No recently active users to prefetch');
        return { processed: 0 };
      }

      logger.info(`Running activity-based prefetch for ${userIds.length} users`);

      // Prefetch timelines for all active users
      const results = await Promise.allSettled(
        userIds.map(userId => prefetchTimeline(userId, 'high'))
      );

      // Clear tracked users
      this.recentlyActiveUsers.clear();

      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;

      logger.info(`Activity-based prefetch completed: ${successful}/${userIds.length} successful`);

      return {
        processed: userIds.length,
        successful,
        failed: userIds.length - successful
      };
    } catch (error) {
      logger.error('Error running activity-based strategy:', error);
      return { processed: 0, error: error.message };
    }
  }

  /**
   * Get recently active users
   */
  getActiveUsers() {
    return Array.from(this.recentlyActiveUsers);
  }

  /**
   * Clear tracked users
   */
  clear() {
    this.recentlyActiveUsers.clear();
  }
}

module.exports = ActivityBasedStrategy;
