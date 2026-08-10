/**
 * Redis Configuration
 * Provides Redis client connection for caching and pub/sub
 */

const Redis = require('ioredis');
const config = require('./index');
const logger = require('../utils/logger');

let redisClient = null;
let isConnected = false;

/**
 * Get or create Redis client
 */
function getRedisClient() {
  if (!config.redis || !config.redis.enabled) {
    // Return null if Redis is disabled
    return null;
  }

  if (redisClient) {
    return redisClient;
  }

  try {
    const redisConfig = {
      host: process.env.REDIS_HOST || config.redis.host || 'localhost',
      port: process.env.REDIS_PORT || config.redis.port || 6379,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true
    };

    if (config.redis.password) {
      redisConfig.password = config.redis.password;
    }

    redisClient = new Redis(redisConfig);

    redisClient.on('connect', () => {
      isConnected = true;
      logger.info('Redis client connected');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });

    redisClient.on('error', (err) => {
      isConnected = false;
      logger.warn('Redis client error:', { error: err.message });
    });

    redisClient.on('close', () => {
      isConnected = false;
      logger.info('Redis client connection closed');
    });

    redisClient.on('reconnecting', () => {
      logger.info('Redis client reconnecting...');
    });

    // Attempt to connect
    redisClient.connect().catch(err => {
      logger.warn('Failed to connect to Redis:', { error: err.message });
    });

    return redisClient;
  } catch (error) {
    logger.error('Error creating Redis client:', { error: error.message });
    return null;
  }
}

/**
 * Check if Redis is connected
 */
function isRedisConnected() {
  return isConnected && redisClient && redisClient.status === 'ready';
}

/**
 * Close Redis connection
 */
async function closeRedisConnection() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    isConnected = false;
    logger.info('Redis connection closed');
  }
}

module.exports = {
  getRedisClient,
  isRedisConnected,
  closeRedisConnection,
  redis: getRedisClient()
};
