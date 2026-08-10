/**
 * Webhook Worker Service
 * Processes webhook delivery jobs from RabbitMQ
 */

const rabbitmq = require('../../config/rabbitmq');
const logger = require('../../utils/logger');
const axios = require('axios');
const crypto = require('crypto');

class WebhookWorker {
  constructor() {
    this.running = false;
  }

  /**
   * Start webhook worker
   */
  async start() {
    if (this.running) {
      logger.warn('Webhook worker already running');
      return;
    }

    this.running = true;
    logger.info('Webhook worker started');

    // Start consuming from webhook queue
    await rabbitmq.consume('webhooks', this.processWebhook.bind(this));
  }

  /**
   * Process a webhook delivery
   */
  async processWebhook(message, rawMessage) {
    const startTime = Date.now();

    try {
      logger.info('Processing webhook', {
        webhookId: message.id,
        url: message.url,
        event: message.event,
      });

      // Generate signature
      const signature = this.generateSignature(message.payload, message.secret);

      // Make HTTP request
      const response = await axios({
        method: message.method || 'POST',
        url: message.url,
        data: message.payload,
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': message.event,
          'X-Webhook-ID': message.id,
          'User-Agent': 'Exprsn-Webhook/1.0',
          ...message.headers,
        },
        timeout: message.timeout || 5000,
        validateStatus: () => true, // Don't throw on any status
      });

      const duration = Date.now() - startTime;

      // Check if successful (2xx status code)
      if (response.status >= 200 && response.status < 300) {
        logger.info('Webhook delivered successfully', {
          webhookId: message.id,
          url: message.url,
          statusCode: response.status,
          duration,
        });
      } else {
        throw new Error(`Webhook delivery failed with status ${response.status}`);
      }
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Webhook delivery failed', {
        webhookId: message.id,
        url: message.url,
        error: error.message,
        duration,
      });

      // Check if should retry
      const attemptCount = message.attemptCount || 1;
      const maxAttempts = message.maxAttempts || 3;

      if (attemptCount < maxAttempts) {
        // Requeue for retry
        const delay = this.calculateRetryDelay(attemptCount);

        logger.info('Requeueing webhook for retry', {
          webhookId: message.id,
          attemptCount: attemptCount + 1,
          maxAttempts,
          delay,
        });

        setTimeout(() => {
          rabbitmq.publish('webhooks', {
            ...message,
            attemptCount: attemptCount + 1,
          });
        }, delay);
      } else {
        // Move to dead letter queue
        logger.error('Webhook failed after max attempts, moving to DLQ', {
          webhookId: message.id,
          attemptCount,
        });

        await rabbitmq.publish('webhooks_dlq', {
          ...message,
          finalError: error.message,
          failedAt: new Date().toISOString(),
        });
      }

      throw error;
    }
  }

  /**
   * Generate webhook signature
   */
  generateSignature(payload, secret) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  calculateRetryDelay(attemptCount) {
    const baseDelay = 1000; // 1 second
    const maxDelay = 60000; // 60 seconds
    const delay = Math.min(baseDelay * Math.pow(2, attemptCount - 1), maxDelay);
    return delay;
  }

  /**
   * Stop webhook worker
   */
  async stop() {
    this.running = false;
    logger.info('Webhook worker stopped');
  }
}

// Create singleton instance
const webhookWorker = new WebhookWorker();

module.exports = webhookWorker;
