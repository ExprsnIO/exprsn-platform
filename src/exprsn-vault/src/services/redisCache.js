/**
 * Redis Cache Service for Vault Tokens
 * Manages token caching with automatic expiration
 */

const redis = require('redis');
const { logger } = require('@exprsn/shared');

class RedisCache {
  constructor() {
    this.client = null;
    this.connected = false;
    this.keyPrefix = 'vault:token:';
  }

  /**
   * Initialize Redis connection
   */
  async connect() {
    if (this.connected) {
      return;
    }

    try {
      this.client = redis.createClient({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB || '0'),
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            logger.error('Redis connection refused');
            return new Error('Redis server connection refused');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            return new Error('Redis retry time exhausted');
          }
          if (options.attempt > 10) {
            return undefined;
          }
          return Math.min(options.attempt * 100, 3000);
        }
      });

      await this.client.connect();

      this.client.on('error', (err) => {
        logger.error('Redis error', { error: err.message });
      });

      this.client.on('ready', () => {
        logger.info('Redis connection established');
        this.connected = true;
      });

      this.connected = true;
      logger.info('Redis cache initialized for Vault');
    } catch (error) {
      logger.error('Failed to connect to Redis', { error: error.message });
      this.connected = false;
    }
  }

  /**
   * Cache a token
   * @param {string} tokenId - Token identifier
   * @param {Object} data - Token data to cache
   * @param {Date} expiresAt - Token expiration date
   */
  async cacheToken(tokenId, data, expiresAt) {
    if (!this.connected || !this.client) {
      logger.warn('Redis not connected, skipping cache');
      return;
    }

    try {
      const key = this.keyPrefix + tokenId;
      const value = JSON.stringify(data);

      // Calculate TTL in seconds
      let ttl = null;
      if (expiresAt) {
        ttl = Math.floor((new Date(expiresAt) - new Date()) / 1000);
        if (ttl <= 0) {
          logger.warn('Token already expired, not caching', { tokenId });
          return;
        }
      }

      if (ttl) {
        await this.client.setEx(key, ttl, value);
      } else {
        // Default TTL of 24 hours if no expiration
        await this.client.setEx(key, 86400, value);
      }

      logger.debug('Token cached in Redis', { tokenId, ttl });
    } catch (error) {
      logger.error('Failed to cache token', { error: error.message, tokenId });
    }
  }

  /**
   * Get a cached token
   * @param {string} tokenId - Token identifier or hash
   * @returns {Object|null} Cached token data
   */
  async getToken(tokenId) {
    if (!this.connected || !this.client) {
      return null;
    }

    try {
      const key = this.keyPrefix + tokenId;
      const value = await this.client.get(key);

      if (!value) {
        return null;
      }

      return JSON.parse(value);
    } catch (error) {
      logger.error('Failed to get cached token', { error: error.message, tokenId });
      return null;
    }
  }

  /**
   * Remove a token from cache
   * @param {string} tokenId - Token identifier
   */
  async removeToken(tokenId) {
    if (!this.connected || !this.client) {
      return;
    }

    try {
      const key = this.keyPrefix + tokenId;
      await this.client.del(key);
      logger.debug('Token removed from cache', { tokenId });
    } catch (error) {
      logger.error('Failed to remove token from cache', { error: error.message, tokenId });
    }
  }

  /**
   * Purge all expired tokens from cache
   * This is handled automatically by Redis TTL, but can be called manually
   */
  async purgeExpired() {
    if (!this.connected || !this.client) {
      return 0;
    }

    try {
      // Redis automatically removes expired keys, but we can scan for them
      const pattern = this.keyPrefix + '*';
      let cursor = '0';
      let purged = 0;

      do {
        const result = await this.client.scan(cursor, {
          MATCH: pattern,
          COUNT: 100
        });

        cursor = result.cursor;
        const keys = result.keys;

        for (const key of keys) {
          const ttl = await this.client.ttl(key);
          if (ttl === -1) {
            // Key has no expiration, set default
            await this.client.expire(key, 86400);
          }
        }
      } while (cursor !== '0');

      logger.info(`Redis cache scan complete, ${purged} keys processed`);
      return purged;
    } catch (error) {
      logger.error('Failed to purge expired tokens', { error: error.message });
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    if (!this.connected || !this.client) {
      return { connected: false };
    }

    try {
      const pattern = this.keyPrefix + '*';
      const keys = await this.client.keys(pattern);

      return {
        connected: true,
        cachedTokens: keys.length,
        keyPrefix: this.keyPrefix
      };
    } catch (error) {
      logger.error('Failed to get cache stats', { error: error.message });
      return { connected: false, error: error.message };
    }
  }

  /**
   * Clear all cached tokens (use with caution!)
   */
  async clearAll() {
    if (!this.connected || !this.client) {
      return;
    }

    try {
      const pattern = this.keyPrefix + '*';
      const keys = await this.client.keys(pattern);

      if (keys.length > 0) {
        await this.client.del(...keys);
      }

      logger.warn(`Cleared ${keys.length} cached tokens`);
      return keys.length;
    } catch (error) {
      logger.error('Failed to clear cache', { error: error.message });
      return 0;
    }
  }

  /**
   * Close Redis connection
   */
  async disconnect() {
    if (this.client && this.connected) {
      await this.client.quit();
      this.connected = false;
      logger.info('Redis cache disconnected');
    }
  }
}

// Singleton instance
const redisCacheInstance = new RedisCache();

// Auto-connect on initialization
if (process.env.REDIS_ENABLED !== 'false') {
  redisCacheInstance.connect().catch(err => {
    logger.warn('Redis connection failed, continuing without cache', { error: err.message });
  });
}

module.exports = redisCacheInstance;
