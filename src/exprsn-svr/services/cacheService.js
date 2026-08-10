/**
 * ═══════════════════════════════════════════════════════════
 * Cache Service
 * Redis-based caching with intelligent invalidation
 * ═══════════════════════════════════════════════════════════
 */

const Redis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

class CacheService {
  constructor() {
    this.client = null;
    this.enabled = config.redis.enabled;
    this.defaultTTL = config.redis.cacheTTL;

    if (this.enabled) {
      this.initialize();
    }
  }

  /**
   * Initialize Redis client
   */
  initialize() {
    try {
      this.client = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db,
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
        logger.error('Redis cache error:', err);
      });

      this.client.on('reconnecting', () => {
        logger.warn('Redis cache reconnecting...');
      });
    } catch (error) {
      logger.error('Failed to initialize Redis cache:', error);
      this.enabled = false;
    }
  }

  /**
   * Get value from cache
   */
  async get(key) {
    if (!this.enabled || !this.client) return null;

    try {
      const value = await this.client.get(key);
      if (value) {
        logger.debug('Cache hit', { key });
        return JSON.parse(value);
      }
      logger.debug('Cache miss', { key });
      return null;
    } catch (error) {
      logger.error('Cache get error:', { key, error: error.message });
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set(key, value, ttl = this.defaultTTL) {
    if (!this.enabled || !this.client) return false;

    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await this.client.setex(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }
      logger.debug('Cache set', { key, ttl });
      return true;
    } catch (error) {
      logger.error('Cache set error:', { key, error: error.message });
      return false;
    }
  }

  /**
   * Delete key from cache
   */
  async del(key) {
    if (!this.enabled || !this.client) return false;

    try {
      await this.client.del(key);
      logger.debug('Cache deleted', { key });
      return true;
    } catch (error) {
      logger.error('Cache delete error:', { key, error: error.message });
      return false;
    }
  }

  /**
   * Delete keys matching pattern
   */
  async delPattern(pattern) {
    if (!this.enabled || !this.client) return false;

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
        logger.debug('Cache pattern deleted', { pattern, count: keys.length });
      }
      return true;
    } catch (error) {
      logger.error('Cache pattern delete error:', { pattern, error: error.message });
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key) {
    if (!this.enabled || !this.client) return false;

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error:', { key, error: error.message });
      return false;
    }
  }

  /**
   * Increment counter
   */
  async incr(key, amount = 1) {
    if (!this.enabled || !this.client) return 0;

    try {
      const result = await this.client.incrby(key, amount);
      return result;
    } catch (error) {
      logger.error('Cache increment error:', { key, error: error.message });
      return 0;
    }
  }

  /**
   * Set expiration on key
   */
  async expire(key, ttl) {
    if (!this.enabled || !this.client) return false;

    try {
      await this.client.expire(key, ttl);
      return true;
    } catch (error) {
      logger.error('Cache expire error:', { key, error: error.message });
      return false;
    }
  }

  /**
   * Get multiple keys
   */
  async mget(keys) {
    if (!this.enabled || !this.client || keys.length === 0) return [];

    try {
      const values = await this.client.mget(...keys);
      return values.map(v => v ? JSON.parse(v) : null);
    } catch (error) {
      logger.error('Cache mget error:', { keys, error: error.message });
      return [];
    }
  }

  /**
   * Set multiple keys
   */
  async mset(pairs, ttl = this.defaultTTL) {
    if (!this.enabled || !this.client || pairs.length === 0) return false;

    try {
      const pipeline = this.client.pipeline();

      for (const [key, value] of pairs) {
        const serialized = JSON.stringify(value);
        if (ttl) {
          pipeline.setex(key, ttl, serialized);
        } else {
          pipeline.set(key, serialized);
        }
      }

      await pipeline.exec();
      return true;
    } catch (error) {
      logger.error('Cache mset error:', { error: error.message });
      return false;
    }
  }

  /**
   * Cache wrapper for functions
   */
  async wrap(key, fn, ttl = this.defaultTTL) {
    // Try to get from cache first
    const cached = await this.get(key);
    if (cached !== null) {
      return cached;
    }

    // Execute function and cache result
    const result = await fn();
    await this.set(key, result, ttl);
    return result;
  }

  /**
   * Invalidate cache for entity
   */
  async invalidateEntity(entityType, entityId = '*') {
    const pattern = `${entityType}:${entityId}:*`;
    await this.delPattern(pattern);

    // Also invalidate list caches for this entity type
    await this.delPattern(`${entityType}:list:*`);
  }

  /**
   * Generate cache key
   */
  generateKey(prefix, ...parts) {
    return `${prefix}:${parts.join(':')}`;
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    if (!this.enabled || !this.client) return null;

    try {
      const info = await this.client.info('stats');
      const keyspace = await this.client.info('keyspace');

      return {
        connected: this.client.status === 'ready',
        info,
        keyspace
      };
    } catch (error) {
      logger.error('Cache stats error:', error);
      return null;
    }
  }

  /**
   * Flush all cache
   */
  async flush() {
    if (!this.enabled || !this.client) return false;

    try {
      await this.client.flushdb();
      logger.warn('Cache flushed');
      return true;
    } catch (error) {
      logger.error('Cache flush error:', error);
      return false;
    }
  }

  /**
   * Close Redis connection
   */
  async close() {
    if (this.client) {
      await this.client.quit();
      logger.info('Redis cache connection closed');
    }
  }
}

// Export singleton instance
module.exports = new CacheService();
