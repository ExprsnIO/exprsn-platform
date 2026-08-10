/**
 * Exprsn Platform Main Entry Point
 * Handles initialization based on SERVICE_TYPE environment variable
 */

const config = require('./config');
const logger = require('./utils/logger');
const database = require('./config/database');
const redis = require('./config/redis');
const rabbitmq = require('./config/rabbitmq');

/**
 * Initialize connections
 */
async function initializeConnections() {
  try {
    // Initialize database
    await database.initialize();
    logger.info('Database initialized');

    // Initialize Redis
    await redis.initialize();
    logger.info('Redis initialized');

    // Initialize RabbitMQ (only if needed for this service type)
    if (['api', 'webhook-worker'].includes(config.serviceType)) {
      await rabbitmq.initialize();
      logger.info('RabbitMQ initialized');

      // Setup webhook queues
      if (config.serviceType === 'webhook-worker') {
        await rabbitmq.assertQueue('webhooks', { durable: true });
        await rabbitmq.assertQueue('webhooks_dlq', { durable: true });
      }
    }

    return true;
  } catch (error) {
    logger.error('Failed to initialize connections', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Start API server
 */
async function startAPIServer() {
  const app = require('./app');

  return new Promise((resolve, reject) => {
    const server = app.listen(config.port, () => {
      logger.info(`API server started`, {
        port: config.port,
        env: config.env,
        deploymentMode: config.deploymentMode,
      });
      resolve(server);
    });

    server.on('error', (error) => {
      logger.error('API server error', { error: error.message });
      reject(error);
    });
  });
}

/**
 * Start Socket.io server
 */
async function startSocketServer() {
  const { server } = require('./sockets');

  return new Promise((resolve, reject) => {
    server.listen(config.socketPort, () => {
      logger.info(`Socket server started`, {
        port: config.socketPort,
        env: config.env,
      });
      resolve(server);
    });

    server.on('error', (error) => {
      logger.error('Socket server error', { error: error.message });
      reject(error);
    });
  });
}

/**
 * Start Webhook Worker
 */
async function startWebhookWorker() {
  const webhookWorker = require('./services/webhook/webhook-worker');

  logger.info('Starting webhook worker');
  await webhookWorker.start();
}

/**
 * Graceful shutdown
 */
async function shutdown(signal) {
  logger.info(`Received ${signal}, starting graceful shutdown`);

  try {
    // Close database connection
    await database.close();
    logger.info('Database connection closed');

    // Close Redis connection
    await redis.close();
    logger.info('Redis connection closed');

    // Close RabbitMQ connection
    if (['api', 'webhook-worker'].includes(config.serviceType)) {
      await rabbitmq.close();
      logger.info('RabbitMQ connection closed');
    }

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

/**
 * Main function
 */
async function main() {
  try {
    logger.info('Starting Exprsn Platform', {
      version: '1.0.0',
      serviceType: config.serviceType,
      env: config.env,
      deploymentMode: config.deploymentMode,
      nodeVersion: process.version,
    });

    // Initialize connections
    await initializeConnections();

    // Start appropriate service based on SERVICE_TYPE
    switch (config.serviceType) {
      case 'socket':
        await startSocketServer();
        break;

      case 'webhook-worker':
        await startWebhookWorker();
        break;

      case 'api':
      default:
        await startAPIServer();
        break;
    }

    // Setup graceful shutdown handlers
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', {
        error: error.message,
        stack: error.stack,
      });
      shutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection', {
        reason,
        promise,
      });
    });
  } catch (error) {
    logger.error('Failed to start application', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

// Start application
main();
