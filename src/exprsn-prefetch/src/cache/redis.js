/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Prefetch - Redis Cache Manager
 * ═══════════════════════════════════════════════════════════════════════
 */

const Redis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

class RedisCache {
  constructor(tier = 'hot') {
    this.tier = tier;
    this.ttl = tier === 'hot' ? config.cache.hotTTL : config.cache.warmTTL;
    this.db = tier === 'hot' ? config.redis.db.hot : config.redis.db.warm;

    this.client = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      db: this.db,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });

    this.client.on('connect', () => {
      logger.info(`Redis ${tier} cache connected`);
    });

    this.client.on('error', (err) => {
      logger.error(`Redis ${tier} cache error:`, err);
    });
  }

  /**
   * Get timeline from cache
   */
  async get(userId) {
    try {
      const key = `timeline:${userId}`;
      const data = await this.client.get(key);

      if (data) {
        logger.debug(`Cache hit for user ${userId} (${this.tier})`);
        return JSON.parse(data);
      }

      logger.debug(`Cache miss for user ${userId} (${this.tier})`);
      return null;
    } catch (error) {
      logger.error('Error getting from cache:', error);
      return null;
    }
  }

  /**
   * Set timeline in cache
   */
  async set(userId, timeline) {
    try {
      const key = `timeline:${userId}`;
      await this.client.setex(key, Math.floor(this.ttl / 1000), JSON.stringify(timeline));
      logger.debug(`Cached timeline for user ${userId} (${this.tier})`);
      return true;
    } catch (error) {
      logger.error('Error setting cache:', error);
      return false;
    }
  }

  /**
   * Delete timeline from cache
   */
  async delete(userId) {
    try {
      const key = `timeline:${userId}`;
      await this.client.del(key);
      logger.debug(`Deleted cache for user ${userId} (${this.tier})`);
      return true;
    } catch (error) {
      logger.error('Error deleting from cache:', error);
      return false;
    }
  }

  /**
   * Check if timeline exists in cache
   */
  async exists(userId) {
    try {
      const key = `timeline:${userId}`;
      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error('Error checking cache existence:', error);
      return false;
    }
  }

  /**
   * Get cache TTL
   */
  async getTTL(userId) {
    try {
      const key = `timeline:${userId}`;
      const ttl = await this.client.ttl(key);
      return ttl;
    } catch (error) {
      logger.error('Error getting cache TTL:', error);
      return -1;
    }
  }

  /**
   * Close connection
   */
  async close() {
    await this.client.quit();
  }
}

module.exports = RedisCache;
