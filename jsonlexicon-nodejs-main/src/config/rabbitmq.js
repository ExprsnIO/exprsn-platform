/**
 * RabbitMQ Configuration and Connection
 */

const amqp = require('amqplib');
const config = require('./index');
const logger = require('../utils/logger');

class RabbitMQClient {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.queues = new Map();
  }

  /**
   * Initialize RabbitMQ connection
   */
  async initialize() {
    try {
      const url = `amqp://${config.rabbitmq.user}:${config.rabbitmq.password}@${config.rabbitmq.host}:${config.rabbitmq.port}${config.rabbitmq.vhost}`;

      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createChannel();

      await this.channel.prefetch(config.rabbitmq.prefetch);

      logger.info('RabbitMQ connection established', {
        host: config.rabbitmq.host,
        port: config.rabbitmq.port,
        vhost: config.rabbitmq.vhost,
      });

      // Set up event handlers
      this.connection.on('error', (err) => {
        logger.error('RabbitMQ connection error', {
          error: err.message,
          stack: err.stack,
        });
      });

      this.connection.on('close', () => {
        logger.warn('RabbitMQ connection closed');
      });

      this.channel.on('error', (err) => {
        logger.error('RabbitMQ channel error', {
          error: err.message,
          stack: err.stack,
        });
      });

      this.channel.on('close', () => {
        logger.warn('RabbitMQ channel closed');
      });

      return this.connection;
    } catch (error) {
      logger.error('Failed to initialize RabbitMQ', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Assert a queue exists
   */
  async assertQueue(queueName, options = {}) {
    try {
      const defaultOptions = {
        durable: true,
        ...options,
      };

      const queue = await this.channel.assertQueue(queueName, defaultOptions);
      this.queues.set(queueName, queue);

      logger.info('Queue asserted', {
        queue: queueName,
        durable: defaultOptions.durable,
      });

      return queue;
    } catch (error) {
      logger.error('Failed to assert queue', {
        queue: queueName,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Publish a message to a queue
   */
  async publish(queueName, message, options = {}) {
    try {
      const content = Buffer.from(JSON.stringify(message));
      const defaultOptions = {
        persistent: true,
        ...options,
      };

      await this.channel.sendToQueue(queueName, content, defaultOptions);

      logger.debug('Message published to queue', {
        queue: queueName,
        messageId: message.id || 'unknown',
      });

      return true;
    } catch (error) {
      logger.error('Failed to publish message', {
        queue: queueName,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Consume messages from a queue
   */
  async consume(queueName, handler, options = {}) {
    try {
      const defaultOptions = {
        noAck: false,
        ...options,
      };

      await this.channel.consume(
        queueName,
        async (msg) => {
          if (msg) {
            try {
              const content = JSON.parse(msg.content.toString());

              logger.debug('Message received from queue', {
                queue: queueName,
                messageId: content.id || 'unknown',
              });

              await handler(content, msg);

              if (!defaultOptions.noAck) {
                this.channel.ack(msg);
              }
            } catch (error) {
              logger.error('Error processing message', {
                queue: queueName,
                error: error.message,
                stack: error.stack,
              });

              // Reject and requeue if processing failed
              this.channel.nack(msg, false, true);
            }
          }
        },
        defaultOptions
      );

      logger.info('Consumer started for queue', {
        queue: queueName,
      });

      return true;
    } catch (error) {
      logger.error('Failed to start consumer', {
        queue: queueName,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Acknowledge a message
   */
  ack(message) {
    this.channel.ack(message);
  }

  /**
   * Reject a message
   */
  nack(message, requeue = true) {
    this.channel.nack(message, false, requeue);
  }

  /**
   * Purge a queue
   */
  async purgeQueue(queueName) {
    try {
      await this.channel.purgeQueue(queueName);
      logger.warn('Queue purged', { queue: queueName });
      return true;
    } catch (error) {
      logger.error('Failed to purge queue', {
        queue: queueName,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Get queue info
   */
  async checkQueue(queueName) {
    try {
      return await this.channel.checkQueue(queueName);
    } catch (error) {
      logger.error('Failed to check queue', {
        queue: queueName,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Close RabbitMQ connection
   */
  async close() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      logger.info('RabbitMQ connection closed');
    } catch (error) {
      logger.error('Error closing RabbitMQ connection', {
        error: error.message,
      });
    }
  }
}

// Create singleton instance
const rabbitmqClient = new RabbitMQClient();

module.exports = rabbitmqClient;
