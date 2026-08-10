/**
 * Exprsn Herald - Cleanup Job Processor
 * Cleans up expired notifications and old delivery logs
 */

const notificationService = require('../services/notificationService');
const pushService = require('../services/pushService');
const { DeliveryLog } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * Process cleanup job
 */
async function process(job) {
  try {
    logger.info('Processing cleanup job', { jobId: job.id });

    const results = {
      expiredNotifications: 0,
      oldDeliveryLogs: 0,
      inactivePushTokens: 0
    };

    // 1. Clean up expired notifications
    try {
      const expiredResult = await notificationService.cleanupExpired();
      results.expiredNotifications = expiredResult.count;
      logger.info('Expired notifications cleaned up', {
        count: expiredResult.count
      });
    } catch (error) {
      logger.error('Error cleaning up expired notifications', {
        error: error.message
      });
    }

    // 2. Clean up old delivery logs (older than 90 days)
    try {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const deletedLogs = await DeliveryLog.destroy({
        where: {
          createdAt: { [Op.lt]: ninetyDaysAgo }
        }
      });

      results.oldDeliveryLogs = deletedLogs;
      logger.info('Old delivery logs cleaned up', {
        count: deletedLogs
      });
    } catch (error) {
      logger.error('Error cleaning up old delivery logs', {
        error: error.message
      });
    }

    // 3. Clean up inactive push tokens (not used in 30+ days)
    try {
      const inactiveResult = await pushService.cleanupInactiveTokens();
      results.inactivePushTokens = inactiveResult.count;
      logger.info('Inactive push tokens cleaned up', {
        count: inactiveResult.count
      });
    } catch (error) {
      logger.error('Error cleaning up inactive push tokens', {
        error: error.message
      });
    }

    logger.info('Cleanup job completed', {
      jobId: job.id,
      results
    });

    return results;
  } catch (error) {
    logger.error('Cleanup job failed', {
      jobId: job.id,
      error: error.message
    });
    throw error;
  }
}

module.exports = { process };
