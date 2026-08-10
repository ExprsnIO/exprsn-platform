/**
 * Exprsn Herald - Email Job Processor
 */

const emailService = require('../services/emailService');
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');

/**
 * Process email notification job
 */
async function process(job) {
  const { notificationId, to, subject, body, html, template, variables } = job.data;

  try {
    logger.info('Processing email job', { jobId: job.id, notificationId });

    // Send email
    const result = await emailService.sendEmail({
      to,
      subject,
      body,
      html,
      template,
      variables,
      notificationId
    });

    // Update notification status
    if (notificationId) {
      await notificationService.sendNotification(notificationId);
    }

    logger.info('Email job completed', {
      jobId: job.id,
      notificationId,
      messageId: result.messageId
    });

    return result;
  } catch (error) {
    logger.error('Email job failed', {
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
