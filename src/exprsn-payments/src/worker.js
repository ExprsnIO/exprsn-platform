const Queue = require('bull');
const { logger } = require('@exprsn/shared');
const { Webhook, Transaction } = require('./models');
const PaymentGatewayFactory = require('./services/PaymentGatewayFactory');
require('dotenv').config();

// Redis configuration
const redisConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined
  }
};

// Create queues
const paymentQueue = new Queue('payments', redisConfig);
const webhookQueue = new Queue('webhooks', redisConfig);
const refundQueue = new Queue('refunds', redisConfig);

/**
 * Payment Queue Processor
 * Handles async payment processing
 */
paymentQueue.process(
  parseInt(process.env.PAYMENT_QUEUE_CONCURRENCY) || 5,
  async (job) => {
    const { transactionId, action } = job.data;

    logger.info('Processing payment job', {
      jobId: job.id,
      transactionId,
      action
    });

    try {
      const transaction = await Transaction.findByPk(transactionId);

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      // Perform action based on job type
      switch (action) {
        case 'verify_status':
          // Poll payment provider for status update
          logger.info('Verifying transaction status', { transactionId });
          break;

        case 'send_receipt':
          // Send payment receipt
          logger.info('Sending payment receipt', { transactionId });
          break;

        case 'update_analytics':
          // Update analytics/metrics
          logger.info('Updating analytics', { transactionId });
          break;

        default:
          logger.warn('Unknown payment action', { action });
      }

      return { success: true, transactionId };
    } catch (error) {
      logger.error('Payment job failed:', error);
      throw error;
    }
  }
);

/**
 * Webhook Queue Processor
 * Handles async webhook processing
 */
webhookQueue.process(
  parseInt(process.env.WEBHOOK_QUEUE_CONCURRENCY) || 10,
  async (job) => {
    const { webhookId } = job.data;

    logger.info('Processing webhook job', {
      jobId: job.id,
      webhookId
    });

    try {
      const webhook = await Webhook.findByPk(webhookId);

      if (!webhook) {
        throw new Error('Webhook not found');
      }

      // Update webhook status
      await webhook.update({
        status: 'processing',
        attempts: webhook.attempts + 1,
        lastAttemptAt: new Date()
      });

      // Process webhook based on event type
      const eventType = webhook.eventType;

      switch (eventType) {
        case 'payment_intent.succeeded':
        case 'charge.succeeded':
          logger.info('Processing successful payment webhook', { webhookId });
          // Update transaction status, send notifications, etc.
          break;

        case 'payment_intent.payment_failed':
        case 'charge.failed':
          logger.info('Processing failed payment webhook', { webhookId });
          // Update transaction status, notify user, etc.
          break;

        case 'charge.refunded':
          logger.info('Processing refund webhook', { webhookId });
          // Update refund status
          break;

        case 'customer.created':
          logger.info('Processing customer created webhook', { webhookId });
          // Sync customer data
          break;

        default:
          logger.info('Processing webhook with unknown event type', {
            eventType,
            webhookId
          });
      }

      // Mark webhook as processed
      await webhook.update({
        status: 'processed',
        processedAt: new Date()
      });

      return { success: true, webhookId };
    } catch (error) {
      logger.error('Webhook job failed:', error);

      // Update webhook status
      await Webhook.update(
        {
          status: 'failed',
          errorMessage: error.message
        },
        {
          where: { id: webhookId }
        }
      );

      throw error;
    }
  }
);

/**
 * Refund Queue Processor
 * Handles async refund processing
 */
refundQueue.process(
  parseInt(process.env.REFUND_QUEUE_CONCURRENCY) || 3,
  async (job) => {
    const { refundId, action } = job.data;

    logger.info('Processing refund job', {
      jobId: job.id,
      refundId,
      action
    });

    try {
      // Perform refund-related actions
      switch (action) {
        case 'send_notification':
          logger.info('Sending refund notification', { refundId });
          break;

        case 'update_inventory':
          logger.info('Updating inventory after refund', { refundId });
          break;

        default:
          logger.warn('Unknown refund action', { action });
      }

      return { success: true, refundId };
    } catch (error) {
      logger.error('Refund job failed:', error);
      throw error;
    }
  }
);

// Queue event handlers
paymentQueue.on('completed', (job, result) => {
  logger.info('Payment job completed', {
    jobId: job.id,
    result
  });
});

paymentQueue.on('failed', (job, err) => {
  logger.error('Payment job failed', {
    jobId: job.id,
    error: err.message
  });
});

webhookQueue.on('completed', (job, result) => {
  logger.info('Webhook job completed', {
    jobId: job.id,
    result
  });
});

webhookQueue.on('failed', (job, err) => {
  logger.error('Webhook job failed', {
    jobId: job.id,
    error: err.message
  });
});

refundQueue.on('completed', (job, result) => {
  logger.info('Refund job completed', {
    jobId: job.id,
    result
  });
});

refundQueue.on('failed', (job, err) => {
  logger.error('Refund job failed', {
    jobId: job.id,
    error: err.message
  });
});

logger.info('Payment worker started');
logger.info('Queues initialized:', {
  payment: 'ready',
  webhook: 'ready',
  refund: 'ready'
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing queues...');
  await Promise.all([
    paymentQueue.close(),
    webhookQueue.close(),
    refundQueue.close()
  ]);
  logger.info('Queues closed, exiting');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing queues...');
  await Promise.all([
    paymentQueue.close(),
    webhookQueue.close(),
    refundQueue.close()
  ]);
  logger.info('Queues closed, exiting');
  process.exit(0);
});

module.exports = {
  paymentQueue,
  webhookQueue,
  refundQueue
};
