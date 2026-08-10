/**
 * Rate Limiter for AI Agent Service
 *
 * Redis-backed rate limiting for AI provider requests.
 * Supports per-provider, per-user, and global limits.
 */

const Redis = require('ioredis');
const logger = require('../../../utils/logger');

class RateLimiter {
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      keyPrefix: 'ai:ratelimit:',
    });

    this.redis.on('error', (err) => {
      logger.error('[RateLimiter] Redis connection error:', err);
    });
  }

  /**
   * Check if request is allowed under rate limits
   *
   * @param {String} providerName - Provider name
   * @param {UUID} userId - User ID (optional)
   * @throws {Error} If rate limit exceeded
   */
  async checkLimit(providerName, userId = null) {
    const { AIProviderConfig } = require('../../models/ai');

    // Get provider config
    const config = await AIProviderConfig.findOne({
      where: { providerName },
    });

    if (!config) {
      throw new Error(`Provider config not found: ${providerName}`);
    }

    const limits = config.rateLimits;

    // Check provider-level rate limits
    await this.checkProviderLimit(providerName, limits);

    // Check user-level rate limits (if userId provided)
    if (userId) {
      await this.checkUserLimit(userId, limits);
    }
  }

  /**
   * Check provider-level rate limits
   */
  async checkProviderLimit(providerName, limits) {
    const now = Date.now();

    // Requests per minute
    if (limits.rpm) {
      const key = `provider:${providerName}:rpm`;
      const count = await this.increment(key, 60);

      if (count > limits.rpm) {
        throw new Error(`Rate limit exceeded for provider ${providerName}: ${limits.rpm} requests per minute`);
      }
    }

    // Requests per day
    if (limits.rpd) {
      const key = `provider:${providerName}:rpd`;
      const count = await this.increment(key, 86400);

      if (count > limits.rpd) {
        throw new Error(`Rate limit exceeded for provider ${providerName}: ${limits.rpd} requests per day`);
      }
    }
  }

  /**
   * Check user-level rate limits
   */
  async checkUserLimit(userId, limits) {
    // Default user limits (can be customized)
    const userLimits = {
      rpm: 20, // 20 requests per minute per user
      rph: 100, // 100 requests per hour per user
    };

    // Requests per minute
    const rpmKey = `user:${userId}:rpm`;
    const rpmCount = await this.increment(rpmKey, 60);

    if (rpmCount > userLimits.rpm) {
      throw new Error(`User rate limit exceeded: ${userLimits.rpm} requests per minute`);
    }

    // Requests per hour
    const rphKey = `user:${userId}:rph`;
    const rphCount = await this.increment(rphKey, 3600);

    if (rphCount > userLimits.rph) {
      throw new Error(`User rate limit exceeded: ${userLimits.rph} requests per hour`);
    }
  }

  /**
   * Increment counter with TTL
   *
   * @param {String} key - Redis key
   * @param {Number} ttl - TTL in seconds
   * @returns {Promise<Number>} Current count
   */
  async increment(key, ttl) {
    const count = await this.redis.incr(key);

    // Set TTL on first increment
    if (count === 1) {
      await this.redis.expire(key, ttl);
    }

    return count;
  }

  /**
   * Get current count for a key
   */
  async getCount(key) {
    const count = await this.redis.get(key);
    return parseInt(count) || 0;
  }

  /**
   * Reset rate limit for a key
   */
  async reset(key) {
    await this.redis.del(key);
  }

  /**
   * Get remaining requests for a provider
   */
  async getRemaining(providerName, period = 'rpm') {
    const { AIProviderConfig } = require('../../models/ai');

    const config = await AIProviderConfig.findOne({
      where: { providerName },
    });

    if (!config) {
      return 0;
    }

    const limit = config.rateLimits[period];
    const key = `provider:${providerName}:${period}`;
    const count = await this.getCount(key);

    return Math.max(0, limit - count);
  }

  /**
   * Close Redis connection
   */
  async close() {
    await this.redis.quit();
  }
}

module.exports = RateLimiter;
