/**
 * Exprsn Herald - SMS Job Processor
 */

const smsService = require('../services/smsService');
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');

/**
 * Process SMS notification job
 */
async function process(job) {
  const { notificationId, to, body } = job.data;

  try {
    logger.info('Processing SMS job', { jobId: job.id, notificationId });

    // Send SMS
    const result = await smsService.sendSMS({
      to,
      body,
      notificationId
    });

    // Update notification status
    if (notificationId) {
      await notificationService.sendNotification(notificationId);
    }

    logger.info('SMS job completed', {
      jobId: job.id,
      notificationId,
      messageSid: result.messageSid
    });

    return result;
  } catch (error) {
    logger.error('SMS job failed', {
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
