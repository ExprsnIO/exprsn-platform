/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Prefetch - Metrics Service
 * Track cache performance and prefetch metrics
 * ═══════════════════════════════════════════════════════════════════════
 */

const Redis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

class MetricsService {
  constructor() {
    this.client = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      db: 2  // Use separate DB for metrics
    });

    this.client.on('error', (err) => {
      logger.error('Metrics Redis error:', { error: err.message });
    });
  }

  /**
   * Record cache hit
   */
  async recordCacheHit(tier, userId) {
    try {
      const date = new Date().toISOString().split('T')[0];
      const key = `metrics:cache:hits:${tier}`;

      await Promise.all([
        this.client.hincrby(key, 'total', 1),
        this.client.hincrby(key, date, 1)
      ]);

      logger.debug(`Cache hit recorded`, { tier, userId });
    } catch (error) {
      logger.error('Error recording cache hit:', { error: error.message });
    }
  }

  /**
   * Record cache miss
   */
  async recordCacheMiss(userId) {
    try {
      const date = new Date().toISOString().split('T')[0];
      const key = 'metrics:cache:misses';

      await Promise.all([
        this.client.hincrby(key, 'total', 1),
        this.client.hincrby(key, date, 1)
      ]);

      logger.debug(`Cache miss recorded`, { userId });
    } catch (error) {
      logger.error('Error recording cache miss:', { error: error.message });
    }
  }

  /**
   * Record prefetch duration
   */
  async recordPrefetchDuration(userId, duration, tier) {
    try {
      const key = 'metrics:prefetch:durations';
      const data = JSON.stringify({
        userId,
        duration,
        tier,
        timestamp: Date.now()
      });

      await this.client.lpush(key, data);
      await this.client.ltrim(key, 0, 999);  // Keep last 1000

      logger.debug(`Prefetch duration recorded`, { userId, duration, tier });
    } catch (error) {
      logger.error('Error recording prefetch duration:', { error: error.message });
    }
  }

  /**
   * Record prefetch error
   */
  async recordPrefetchError(userId, error) {
    try {
      const date = new Date().toISOString().split('T')[0];
      const key = 'metrics:prefetch:errors';

      await Promise.all([
        this.client.hincrby(key, 'total', 1),
        this.client.hincrby(key, date, 1)
      ]);

      logger.debug(`Prefetch error recorded`, { userId, error });
    } catch (error) {
      logger.error('Error recording prefetch error:', { error: error.message });
    }
  }

  /**
   * Get cache metrics
   */
  async getMetrics() {
    try {
      const [hotHits, warmHits, misses] = await Promise.all([
        this.client.hgetall('metrics:cache:hits:hot'),
        this.client.hgetall('metrics:cache:hits:warm'),
        this.client.hgetall('metrics:cache:misses')
      ]);

      const totalHotHits = parseInt(hotHits.total) || 0;
      const totalWarmHits = parseInt(warmHits.total) || 0;
      const totalHits = totalHotHits + totalWarmHits;
      const totalMisses = parseInt(misses.total) || 0;
      const totalRequests = totalHits + totalMisses;

      return {
        hits: {
          hot: totalHotHits,
          warm: totalWarmHits,
          total: totalHits
        },
        misses: totalMisses,
        hitRate: totalRequests > 0 ? parseFloat((totalHits / totalRequests).toFixed(4)) : 0,
        totalRequests
      };
    } catch (error) {
      logger.error('Error getting metrics:', { error: error.message });
      return {
        hits: { hot: 0, warm: 0, total: 0 },
        misses: 0,
        hitRate: 0,
        totalRequests: 0,
        error: error.message
      };
    }
  }

  /**
   * Get prefetch performance metrics
   */
  async getPrefetchMetrics() {
    try {
      const durationsKey = 'metrics:prefetch:durations';
      const durations = await this.client.lrange(durationsKey, 0, 999);

      if (durations.length === 0) {
        return {
          count: 0,
          avgDuration: 0,
          minDuration: 0,
          maxDuration: 0,
          p50: 0,
          p95: 0,
          p99: 0
        };
      }

      const parsed = durations.map(d => JSON.parse(d));
      const durationValues = parsed.map(p => p.duration).sort((a, b) => a - b);

      const sum = durationValues.reduce((a, b) => a + b, 0);
      const avg = sum / durationValues.length;

      const percentile = (arr, p) => {
        const index = Math.ceil(arr.length * p) - 1;
        return arr[Math.max(0, index)];
      };

      return {
        count: durationValues.length,
        avgDuration: Math.round(avg),
        minDuration: durationValues[0],
        maxDuration: durationValues[durationValues.length - 1],
        p50: percentile(durationValues, 0.50),
        p95: percentile(durationValues, 0.95),
        p99: percentile(durationValues, 0.99)
      };
    } catch (error) {
      logger.error('Error getting prefetch metrics:', { error: error.message });
      return {
        count: 0,
        avgDuration: 0,
        error: error.message
      };
    }
  }

  /**
   * Get metrics for specific date
   */
  async getMetricsByDate(date) {
    try {
      const [hotHits, warmHits, misses] = await Promise.all([
        this.client.hget('metrics:cache:hits:hot', date),
        this.client.hget('metrics:cache:hits:warm', date),
        this.client.hget('metrics:cache:misses', date)
      ]);

      const totalHotHits = parseInt(hotHits) || 0;
      const totalWarmHits = parseInt(warmHits) || 0;
      const totalHits = totalHotHits + totalWarmHits;
      const totalMisses = parseInt(misses) || 0;
      const totalRequests = totalHits + totalMisses;

      return {
        date,
        hits: {
          hot: totalHotHits,
          warm: totalWarmHits,
          total: totalHits
        },
        misses: totalMisses,
        hitRate: totalRequests > 0 ? parseFloat((totalHits / totalRequests).toFixed(4)) : 0,
        totalRequests
      };
    } catch (error) {
      logger.error('Error getting metrics by date:', { error: error.message });
      return null;
    }
  }

  /**
   * Reset all metrics
   */
  async resetMetrics() {
    try {
      const keys = await this.client.keys('metrics:*');
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
      logger.info('Metrics reset');
      return { success: true, keysDeleted: keys.length };
    } catch (error) {
      logger.error('Error resetting metrics:', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Close metrics client
   */
  async close() {
    try {
      await this.client.quit();
      logger.info('Metrics client closed');
    } catch (error) {
      logger.error('Error closing metrics client:', { error: error.message });
    }
  }
}

// Export singleton instance
module.exports = new MetricsService();
