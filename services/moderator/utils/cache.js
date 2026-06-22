/**
 * ═══════════════════════════════════════════════════════════
 * Cache Utility
 * Redis-based caching for classifications and settings
 * ═══════════════════════════════════════════════════════════
 */

const Redis = require('ioredis');
const config = require('../config');
const logger = require('./logger');

class CacheService {
  constructor() {
    if (!config.cache.enabled) {
      logger.warn('Cache is disabled');
      this.enabled = false;
      return;
    }

    try {
      this.client = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db,
        keyPrefix: config.redis.keyPrefix,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3
      });

      this.client.on('connect', () => {
        logger.info('Redis cache connected');
      });

      this.client.on('error', (err) => {
        logger.error('Redis cache error', { error: err.message });
      });

      this.enabled = true;

    } catch (error) {
      logger.error('Failed to initialize Redis cache', { error: error.message });
      this.enabled = false;
    }
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {Promise<string|null>}
   */
  async get(key) {
    if (!this.enabled) return null;

    try {
      const value = await this.client.get(key);
      if (value) {
        logger.debug('Cache hit', { key });
      }
      return value;
    } catch (error) {
      logger.error('Cache get error', { error: error.message, key });
      return null;
    }
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {string} value - Value to cache
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<boolean>}
   */
  async set(key, value, ttl = 300) {
    if (!this.enabled) return false;

    try {
      if (ttl > 0) {
        await this.client.setex(key, ttl, value);
      } else {
        await this.client.set(key, value);
      }
      logger.debug('Cache set', { key, ttl });
      return true;
    } catch (error) {
      logger.error('Cache set error', { error: error.message, key });
      return false;
    }
  }

  /**
   * Delete key from cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>}
   */
  async delete(key) {
    if (!this.enabled) return false;

    try {
      await this.client.del(key);
      logger.debug('Cache delete', { key });
      return true;
    } catch (error) {
      logger.error('Cache delete error', { error: error.message, key });
      return false;
    }
  }

  /**
   * Delete keys matching pattern
   * @param {string} pattern - Key pattern (e.g., "user:*")
   * @returns {Promise<number>} Number of keys deleted
   */
  async deletePattern(pattern) {
    if (!this.enabled) return 0;

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
        logger.debug('Cache pattern delete', { pattern, count: keys.length });
        return keys.length;
      }
      return 0;
    } catch (error) {
      logger.error('Cache pattern delete error', { error: error.message, pattern });
      return 0;
    }
  }

  /**
   * Check if key exists
   * @param {string} key - Cache key
   * @returns {Promise<boolean>}
   */
  async exists(key) {
    if (!this.enabled) return false;

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error', { error: error.message, key });
      return false;
    }
  }

  /**
   * Increment counter
   * @param {string} key - Cache key
   * @param {number} amount - Amount to increment (default: 1)
   * @returns {Promise<number>} New value
   */
  async increment(key, amount = 1) {
    if (!this.enabled) return 0;

    try {
      const result = await this.client.incrby(key, amount);
      return result;
    } catch (error) {
      logger.error('Cache increment error', { error: error.message, key });
      return 0;
    }
  }

  /**
   * Set with expiration at specific time
   * @param {string} key - Cache key
   * @param {string} value - Value to cache
   * @param {number} timestamp - Unix timestamp for expiration
   * @returns {Promise<boolean>}
   */
  async setExpireAt(key, value, timestamp) {
    if (!this.enabled) return false;

    try {
      await this.client.set(key, value);
      await this.client.expireat(key, Math.floor(timestamp / 1000));
      return true;
    } catch (error) {
      logger.error('Cache setExpireAt error', { error: error.message, key });
      return false;
    }
  }

  /**
   * Get multiple keys
   * @param {Array<string>} keys - Array of cache keys
   * @returns {Promise<Array<string|null>>}
   */
  async mget(keys) {
    if (!this.enabled || keys.length === 0) return [];

    try {
      const values = await this.client.mget(keys);
      return values;
    } catch (error) {
      logger.error('Cache mget error', { error: error.message });
      return [];
    }
  }

  /**
   * Set multiple key-value pairs
   * @param {Object} keyValues - Object with key-value pairs
   * @returns {Promise<boolean>}
   */
  async mset(keyValues) {
    if (!this.enabled || Object.keys(keyValues).length === 0) return false;

    try {
      const pairs = Object.entries(keyValues).flat();
      await this.client.mset(...pairs);
      return true;
    } catch (error) {
      logger.error('Cache mset error', { error: error.message });
      return false;
    }
  }

  /**
   * Flush all keys (use with caution!)
   * @returns {Promise<boolean>}
   */
  async flush() {
    if (!this.enabled) return false;

    try {
      await this.client.flushdb();
      logger.warn('Cache flushed');
      return true;
    } catch (error) {
      logger.error('Cache flush error', { error: error.message });
      return false;
    }
  }

  /**
   * Close Redis connection
   */
  async close() {
    if (this.enabled && this.client) {
      await this.client.quit();
      logger.info('Redis cache disconnected');
    }
  }
}

module.exports = new CacheService();
