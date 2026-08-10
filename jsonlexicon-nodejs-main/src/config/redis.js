/**
 * Redis Configuration and Client
 */

const Redis = require('ioredis');
const config = require('./index');
const logger = require('../utils/logger');

class RedisClient {
  constructor() {
    this.client = null;
    this.subscriber = null;
  }

  /**
   * Initialize Redis client
   */
  async initialize() {
    try {
      const options = {
        host: config.redis.host,
        port: config.redis.port,
        db: config.redis.db,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        reconnectOnError: (err) => {
          const targetError = 'READONLY';
          if (err.message.includes(targetError)) {
            return true;
          }
          return false;
        },
      };

      // Add password if configured
      if (config.redis.password) {
        options.password = config.redis.password;
      }

      // Create main client
      this.client = new Redis(options);

      // Create subscriber client for pub/sub
      this.subscriber = new Redis(options);

      // Set up event handlers
      this.client.on('connect', () => {
        logger.info('Redis client connected', {
          host: config.redis.host,
          port: config.redis.port,
          db: config.redis.db,
        });
      });

      this.client.on('error', (err) => {
        logger.error('Redis client error', {
          error: err.message,
          stack: err.stack,
        });
      });

      this.client.on('reconnecting', () => {
        logger.warn('Redis client reconnecting');
      });

      // Wait for connection
      await this.client.ping();
      logger.info('Redis connection established');

      return this.client;
    } catch (error) {
      logger.error('Failed to initialize Redis client', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get a value from cache
   */
  async get(key) {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis GET failed', {
        key,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Set a value in cache
   */
  async set(key, value, ttl = null) {
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await this.client.setex(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }
      return true;
    } catch (error) {
      logger.error('Redis SET failed', {
        key,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Set with expiration
   */
  async setex(key, seconds, value) {
    try {
      const serialized = JSON.stringify(value);
      await this.client.setex(key, seconds, serialized);
      return true;
    } catch (error) {
      logger.error('Redis SETEX failed', {
        key,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Delete a key
   */
  async del(key) {
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error('Redis DEL failed', {
        key,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key) {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Redis EXISTS failed', {
        key,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Increment a value
   */
  async incr(key) {
    try {
      return await this.client.incr(key);
    } catch (error) {
      logger.error('Redis INCR failed', {
        key,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Set expiration on a key
   */
  async expire(key, seconds) {
    try {
      await this.client.expire(key, seconds);
      return true;
    } catch (error) {
      logger.error('Redis EXPIRE failed', {
        key,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Get multiple keys
   */
  async mget(...keys) {
    try {
      const values = await this.client.mget(...keys);
      return values.map((v) => (v ? JSON.parse(v) : null));
    } catch (error) {
      logger.error('Redis MGET failed', {
        keys,
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Publish a message to a channel
   */
  async publish(channel, message) {
    try {
      await this.client.publish(channel, JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error('Redis PUBLISH failed', {
        channel,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Subscribe to a channel
   */
  async subscribe(channel, callback) {
    try {
      await this.subscriber.subscribe(channel);
      this.subscriber.on('message', (ch, message) => {
        if (ch === channel) {
          try {
            const parsed = JSON.parse(message);
            callback(parsed);
          } catch (error) {
            logger.error('Failed to parse Redis message', {
              channel,
              error: error.message,
            });
          }
        }
      });
      return true;
    } catch (error) {
      logger.error('Redis SUBSCRIBE failed', {
        channel,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Get Redis client instance
   */
  getClient() {
    return this.client;
  }

  /**
   * Close Redis connections
   */
  async close() {
    if (this.client) {
      await this.client.quit();
      logger.info('Redis client closed');
    }
    if (this.subscriber) {
      await this.subscriber.quit();
      logger.info('Redis subscriber closed');
    }
  }

  /**
   * Flush all data (use with caution!)
   */
  async flushAll() {
    if (config.env !== 'production') {
      await this.client.flushall();
      logger.warn('Redis flushed all data');
      return true;
    }
    logger.error('Cannot flush Redis in production');
    return false;
  }
}

// Create singleton instance
const redisClient = new RedisClient();

module.exports = redisClient;
