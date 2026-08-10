const { logger } = require('@exprsn/shared');
const { getRedisClient } = require('../config/redis');

/**
 * Cache Service
 * Provides caching layer for frequently accessed data
 */
class CacheService {
  constructor() {
    this.defaultTTL = 300; // 5 minutes
    this.prefix = 'bluesky:cache:';
  }

  /**
   * Get Redis client
   */
  getClient() {
    const client = getRedisClient();
    if (!client) {
      logger.warn('Redis client not available, caching disabled');
    }
    return client;
  }

  /**
   * Generate cache key
   */
  getKey(key) {
    return `${this.prefix}${key}`;
  }

  /**
   * Get cached value
   * @param {string} key - Cache key
   * @returns {Promise<any|null>} - Cached value or null
   */
  async get(key) {
    const client = this.getClient();
    if (!client) return null;

    try {
      const value = await client.get(this.getKey(key));
      if (!value) return null;

      const parsed = JSON.parse(value);

      // Check if expired (additional check)
      if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
        await this.delete(key);
        return null;
      }

      logger.debug('Cache hit', { key });
      return parsed.data;
    } catch (error) {
      logger.error('Cache get error', {
        error: error.message,
        key
      });
      return null;
    }
  }

  /**
   * Set cached value
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<boolean>} - Success
   */
  async set(key, value, ttl = this.defaultTTL) {
    const client = this.getClient();
    if (!client) return false;

    try {
      const cacheData = {
        data: value,
        cachedAt: Date.now(),
        expiresAt: Date.now() + (ttl * 1000)
      };

      await client.setEx(
        this.getKey(key),
        ttl,
        JSON.stringify(cacheData)
      );

      logger.debug('Cache set', { key, ttl });
      return true;
    } catch (error) {
      logger.error('Cache set error', {
        error: error.message,
        key
      });
      return false;
    }
  }

  /**
   * Delete cached value
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} - Success
   */
  async delete(key) {
    const client = this.getClient();
    if (!client) return false;

    try {
      await client.del(this.getKey(key));
      logger.debug('Cache deleted', { key });
      return true;
    } catch (error) {
      logger.error('Cache delete error', {
        error: error.message,
        key
      });
      return false;
    }
  }

  /**
   * Delete multiple keys by pattern
   * @param {string} pattern - Key pattern (e.g., "user:*")
   * @returns {Promise<number>} - Number of keys deleted
   */
  async deletePattern(pattern) {
    const client = this.getClient();
    if (!client) return 0;

    try {
      const keys = await client.keys(this.getKey(pattern));
      if (keys.length === 0) return 0;

      await client.del(keys);
      logger.debug('Cache pattern deleted', { pattern, count: keys.length });
      return keys.length;
    } catch (error) {
      logger.error('Cache pattern delete error', {
        error: error.message,
        pattern
      });
      return 0;
    }
  }

  /**
   * Wrap function with caching
   * @param {string} key - Cache key
   * @param {Function} fn - Function to execute if cache miss
   * @param {number} ttl - Time to live
   * @returns {Promise<any>} - Result
   */
  async wrap(key, fn, ttl = this.defaultTTL) {
    // Try to get from cache
    const cached = await this.get(key);
    if (cached !== null) {
      return cached;
    }

    // Execute function
    const result = await fn();

    // Cache result
    await this.set(key, result, ttl);

    return result;
  }

  /**
   * Cache DID document
   */
  async cacheDIDDocument(did, didDoc, ttl = 3600) {
    return this.set(`did:${did}`, didDoc, ttl);
  }

  /**
   * Get cached DID document
   */
  async getCachedDIDDocument(did) {
    return this.get(`did:${did}`);
  }

  /**
   * Cache account profile
   */
  async cacheProfile(did, profile, ttl = 300) {
    return this.set(`profile:${did}`, profile, ttl);
  }

  /**
   * Get cached profile
   */
  async getCachedProfile(did) {
    return this.get(`profile:${did}`);
  }

  /**
   * Cache repository info
   */
  async cacheRepository(did, repo, ttl = 600) {
    return this.set(`repo:${did}`, repo, ttl);
  }

  /**
   * Get cached repository
   */
  async getCachedRepository(did) {
    return this.get(`repo:${did}`);
  }

  /**
   * Cache feed
   */
  async cacheFeed(userId, feedData, ttl = 60) {
    return this.set(`feed:${userId}`, feedData, ttl);
  }

  /**
   * Get cached feed
   */
  async getCachedFeed(userId) {
    return this.get(`feed:${userId}`);
  }

  /**
   * Invalidate user cache
   */
  async invalidateUserCache(did) {
    await this.deletePattern(`*:${did}`);
  }

  /**
   * Cache statistics
   */
  async getCacheStats() {
    const client = this.getClient();
    if (!client) {
      return {
        enabled: false,
        keys: 0
      };
    }

    try {
      const keys = await client.keys(this.prefix + '*');
      return {
        enabled: true,
        keys: keys.length,
        prefix: this.prefix
      };
    } catch (error) {
      return {
        enabled: true,
        keys: 0,
        error: error.message
      };
    }
  }
}

module.exports = new CacheService();
