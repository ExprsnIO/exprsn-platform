/**
 * Message Worker
 * Background job processor for Spark service
 */

require('dotenv').config();
const { createLogger } = require('@exprsn/shared');
const {
  messageNotificationQueue,
  messageIndexingQueue,
  fileProcessingQueue,
  deliveryTrackingQueue,
  cleanupQueue
} = require('../services/queueService');

const logger = createLogger('exprsn-spark:worker');

// Import services (will be created)
let notificationService;
let searchService;
let uploadService;

try {
  notificationService = require('../services/notificationService');
  searchService = require('../services/searchService');
  uploadService = require('../services/uploadService');
} catch (error) {
  logger.warn('Some services not available yet', { error: error.message });
}

/**
 * Process message notification job
 */
messageNotificationQueue.process(async (job) => {
  logger.info('Processing notification job', { jobId: job.id });

  const { messageId, conversationId, senderId, content, recipientIds } = job.data;

  try {
    if (notificationService) {
      await notificationService.sendMessageNotification({
        messageId,
        conversationId,
        senderId,
        content,
        recipientIds
      });

      logger.info('Notification sent', { messageId, recipients: recipientIds.length });
      return { success: true, recipients: recipientIds.length };
    } else {
      logger.warn('Notification service not available');
      return { success: false, reason: 'Service not available' };
    }
  } catch (error) {
    logger.error('Failed to send notification', {
      messageId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
});

/**
 * Process message indexing job
 */
messageIndexingQueue.process(async (job) => {
  logger.info('Processing indexing job', { jobId: job.id });

  const { messageId, conversationId, senderId, content, createdAt } = job.data;

  try {
    if (searchService) {
      await searchService.indexMessage({
        id: messageId,
        conversationId,
        senderId,
        content,
        createdAt
      });

      logger.info('Message indexed', { messageId });
      return { success: true, messageId };
    } else {
      logger.warn('Search service not available');
      return { success: false, reason: 'Service not available' };
    }
  } catch (error) {
    logger.error('Failed to index message', {
      messageId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
});

/**
 * Process file processing job
 */
fileProcessingQueue.process(async (job) => {
  logger.info('Processing file job', { jobId: job.id });

  const { attachmentId, messageId, fileName, mimeType, fileUrl } = job.data;

  try {
    if (uploadService) {
      const result = await uploadService.processMedia({
        attachmentId,
        messageId,
        fileName,
        mimeType,
        fileUrl
      });

      logger.info('File processed', { attachmentId, result });
      return { success: true, attachmentId, ...result };
    } else {
      logger.warn('Upload service not available');
      return { success: false, reason: 'Service not available' };
    }
  } catch (error) {
    logger.error('Failed to process file', {
      attachmentId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
});

/**
 * Process delivery tracking job
 */
deliveryTrackingQueue.process(async (job) => {
  logger.info('Processing delivery tracking job', { jobId: job.id });

  const { messageId, userId, status, timestamp } = job.data;

  try {
    const db = require('../models');
    const Message = db.Message;

    const message = await Message.findByPk(messageId);
    if (!message) {
      throw new Error('Message not found');
    }

    if (status === 'delivered') {
      const deliveredTo = message.deliveredTo || [];
      if (!deliveredTo.includes(userId)) {
        deliveredTo.push(userId);
        await message.update({ deliveredTo });
      }
    } else if (status === 'read') {
      const readBy = message.readBy || [];
      if (!readBy.includes(userId)) {
        readBy.push(userId);
        await message.update({ readBy });
      }
    }

    logger.info('Delivery status updated', { messageId, userId, status });
    return { success: true, messageId, userId, status };
  } catch (error) {
    logger.error('Failed to update delivery status', {
      messageId,
      userId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
});

/**
 * Process cleanup job
 */
cleanupQueue.process(async (job) => {
  logger.info('Processing cleanup job', { jobId: job.id });

  const { type, olderThan, conversationId } = job.data;

  try {
    const db = require('../models');
    const Message = db.Message;
    const Attachment = db.Attachment;

    let deletedCount = 0;

    if (type === 'messages') {
      // Delete old deleted messages
      const cutoffDate = olderThan || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const result = await Message.destroy({
        where: {
          deleted: true,
          deletedAt: { [db.Sequelize.Op.lt]: cutoffDate }
        }
      });
      deletedCount = result;
      logger.info('Old messages cleaned up', { count: deletedCount });
    } else if (type === 'attachments') {
      // Delete orphaned attachments
      const result = await Attachment.destroy({
        where: {
          messageId: null
        }
      });
      deletedCount = result;
      logger.info('Orphaned attachments cleaned up', { count: deletedCount });
    }

    return { success: true, type, deletedCount };
  } catch (error) {
    logger.error('Failed to cleanup', {
      type,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down worker...');
  await messageNotificationQueue.close();
  await messageIndexingQueue.close();
  await fileProcessingQueue.close();
  await deliveryTrackingQueue.close();
  await cleanupQueue.close();
  logger.info('Worker shut down');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down worker...');
  await messageNotificationQueue.close();
  await messageIndexingQueue.close();
  await fileProcessingQueue.close();
  await deliveryTrackingQueue.close();
  await cleanupQueue.close();
  logger.info('Worker shut down');
  process.exit(0);
});

logger.info('Message worker started');
