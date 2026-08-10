/**
 * Redis Service
 * Centralized Redis caching for dashboards, visualizations, and query results
 */

const { createClient } = require('redis');
const logger = require('../utils/logger');

class RedisService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.enabled = process.env.REDIS_ENABLED === 'true';

    // Cache TTL settings (in seconds)
    this.ttl = {
      dashboard: parseInt(process.env.CACHE_TTL_DASHBOARD || '300'), // 5 minutes
      visualization: parseInt(process.env.CACHE_TTL_VISUALIZATION || '600'), // 10 minutes
      query: parseInt(process.env.CACHE_TTL_QUERY || '180'), // 3 minutes
      dataset: parseInt(process.env.CACHE_TTL_DATASET || '600'), // 10 minutes
      report: parseInt(process.env.CACHE_TTL_REPORT || '300') // 5 minutes
    };
  }

  /**
   * Initialize Redis connection
   */
  async initialize() {
    if (!this.enabled) {
      logger.info('Redis caching disabled');
      return;
    }

    try {
      this.client = createClient({
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379')
        },
        password: process.env.REDIS_PASSWORD || undefined,
        database: parseInt(process.env.REDIS_DB || '0')
      });

      this.client.on('error', (err) => {
        logger.error('Redis client error', { error: err.message });
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('Redis client connecting...');
      });

      this.client.on('ready', () => {
        logger.info('Redis client ready');
        this.isConnected = true;
      });

      this.client.on('reconnecting', () => {
        logger.warn('Redis client reconnecting...');
      });

      this.client.on('end', () => {
        logger.warn('Redis client connection closed');
        this.isConnected = false;
      });

      await this.client.connect();

      logger.info('Redis service initialized', {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        database: process.env.REDIS_DB || 0
      });
    } catch (error) {
      logger.error('Failed to initialize Redis service', {
        error: error.message
      });
      this.enabled = false;
    }
  }

  /**
   * Close Redis connection
   */
  async close() {
    if (this.client && this.isConnected) {
      await this.client.quit();
      logger.info('Redis service closed');
    }
  }

  /**
   * Generate cache key
   */
  _generateKey(type, id, suffix = '') {
    const key = `pulse:${type}:${id}`;
    return suffix ? `${key}:${suffix}` : key;
  }

  /**
   * Get cached value
   */
  async get(type, id, suffix = '') {
    if (!this.enabled || !this.isConnected) {
      return null;
    }

    try {
      const key = this._generateKey(type, id, suffix);
      const value = await this.client.get(key);

      if (value) {
        logger.debug('Cache hit', { type, id, suffix });
        return JSON.parse(value);
      }

      logger.debug('Cache miss', { type, id, suffix });
      return null;
    } catch (error) {
      logger.error('Redis get error', {
        type,
        id,
        suffix,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Set cached value
   */
  async set(type, id, value, suffix = '', customTtl = null) {
    if (!this.enabled || !this.isConnected) {
      return false;
    }

    try {
      const key = this._generateKey(type, id, suffix);
      const ttl = customTtl || this.ttl[type] || 300;

      await this.client.setEx(key, ttl, JSON.stringify(value));

      logger.debug('Cache set', { type, id, suffix, ttl });
      return true;
    } catch (error) {
      logger.error('Redis set error', {
        type,
        id,
        suffix,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Delete cached value
   */
  async delete(type, id, suffix = '') {
    if (!this.enabled || !this.isConnected) {
      return false;
    }

    try {
      const key = this._generateKey(type, id, suffix);
      await this.client.del(key);

      logger.debug('Cache deleted', { type, id, suffix });
      return true;
    } catch (error) {
      logger.error('Redis delete error', {
        type,
        id,
        suffix,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Delete all keys matching pattern
   */
  async deletePattern(pattern) {
    if (!this.enabled || !this.isConnected) {
      return 0;
    }

    try {
      const keys = await this.client.keys(pattern);

      if (keys.length === 0) {
        return 0;
      }

      await this.client.del(keys);

      logger.debug('Cache pattern deleted', { pattern, count: keys.length });
      return keys.length;
    } catch (error) {
      logger.error('Redis delete pattern error', {
        pattern,
        error: error.message
      });
      return 0;
    }
  }

  /**
   * Invalidate all cache for a specific type
   */
  async invalidateType(type) {
    return await this.deletePattern(`pulse:${type}:*`);
  }

  /**
   * Invalidate all cache for a specific item
   */
  async invalidateItem(type, id) {
    return await this.deletePattern(`pulse:${type}:${id}*`);
  }

  // =========================================================================
  // Dashboard-specific methods
  // =========================================================================

  /**
   * Get cached dashboard data
   */
  async getDashboard(dashboardId) {
    return await this.get('dashboard', dashboardId, 'data');
  }

  /**
   * Cache dashboard data
   */
  async setDashboard(dashboardId, data) {
    return await this.set('dashboard', dashboardId, data, 'data');
  }

  /**
   * Invalidate dashboard cache
   */
  async invalidateDashboard(dashboardId) {
    return await this.invalidateItem('dashboard', dashboardId);
  }

  /**
   * Invalidate all dashboards
   */
  async invalidateAllDashboards() {
    return await this.invalidateType('dashboard');
  }

  // =========================================================================
  // Visualization-specific methods
  // =========================================================================

  /**
   * Get cached visualization result
   */
  async getVisualization(visualizationId) {
    return await this.get('visualization', visualizationId, 'result');
  }

  /**
   * Cache visualization result
   */
  async setVisualization(visualizationId, result) {
    return await this.set('visualization', visualizationId, result, 'result');
  }

  /**
   * Invalidate visualization cache
   */
  async invalidateVisualization(visualizationId) {
    return await this.invalidateItem('visualization', visualizationId);
  }

  /**
   * Invalidate all visualizations
   */
  async invalidateAllVisualizations() {
    return await this.invalidateType('visualization');
  }

  // =========================================================================
  // Query-specific methods
  // =========================================================================

  /**
   * Get cached query result
   */
  async getQuery(queryId, parametersHash = '') {
    return await this.get('query', queryId, parametersHash);
  }

  /**
   * Cache query result
   */
  async setQuery(queryId, result, parametersHash = '') {
    return await this.set('query', queryId, result, parametersHash);
  }

  /**
   * Invalidate query cache
   */
  async invalidateQuery(queryId) {
    return await this.invalidateItem('query', queryId);
  }

  /**
   * Invalidate all queries
   */
  async invalidateAllQueries() {
    return await this.invalidateType('query');
  }

  // =========================================================================
  // Dataset-specific methods
  // =========================================================================

  /**
   * Get cached dataset
   */
  async getDataset(datasetId) {
    return await this.get('dataset', datasetId, 'data');
  }

  /**
   * Cache dataset
   */
  async setDataset(datasetId, data) {
    return await this.set('dataset', datasetId, data, 'data');
  }

  /**
   * Invalidate dataset cache
   */
  async invalidateDataset(datasetId) {
    return await this.invalidateItem('dataset', datasetId);
  }

  /**
   * Invalidate all datasets
   */
  async invalidateAllDatasets() {
    return await this.invalidateType('dataset');
  }

  // =========================================================================
  // Report-specific methods
  // =========================================================================

  /**
   * Get cached report result
   */
  async getReport(reportId, parametersHash = '') {
    return await this.get('report', reportId, parametersHash);
  }

  /**
   * Cache report result
   */
  async setReport(reportId, result, parametersHash = '') {
    return await this.set('report', reportId, result, parametersHash);
  }

  /**
   * Invalidate report cache
   */
  async invalidateReport(reportId) {
    return await this.invalidateItem('report', reportId);
  }

  /**
   * Invalidate all reports
   */
  async invalidateAllReports() {
    return await this.invalidateType('report');
  }

  // =========================================================================
  // Utility methods
  // =========================================================================

  /**
   * Flush all cache
   */
  async flushAll() {
    if (!this.enabled || !this.isConnected) {
      return false;
    }

    try {
      const count = await this.deletePattern('pulse:*');
      logger.info('All cache flushed', { count });
      return true;
    } catch (error) {
      logger.error('Failed to flush cache', { error: error.message });
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    if (!this.enabled || !this.isConnected) {
      return {
        enabled: false,
        connected: false
      };
    }

    try {
      const info = await this.client.info('stats');
      const keys = await this.client.keys('pulse:*');

      const keysByType = {
        dashboard: keys.filter(k => k.startsWith('pulse:dashboard:')).length,
        visualization: keys.filter(k => k.startsWith('pulse:visualization:')).length,
        query: keys.filter(k => k.startsWith('pulse:query:')).length,
        dataset: keys.filter(k => k.startsWith('pulse:dataset:')).length,
        report: keys.filter(k => k.startsWith('pulse:report:')).length
      };

      return {
        enabled: true,
        connected: this.isConnected,
        totalKeys: keys.length,
        keysByType,
        ttl: this.ttl,
        info: info
      };
    } catch (error) {
      logger.error('Failed to get cache stats', { error: error.message });
      return {
        enabled: true,
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * Ping Redis server
   */
  async ping() {
    if (!this.enabled || !this.isConnected) {
      return false;
    }

    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis ping failed', { error: error.message });
      return false;
    }
  }

  /**
   * Get cache health status
   */
  async getHealth() {
    return {
      enabled: this.enabled,
      connected: this.isConnected,
      healthy: this.enabled && this.isConnected && await this.ping()
    };
  }
}

module.exports = new RedisService();
