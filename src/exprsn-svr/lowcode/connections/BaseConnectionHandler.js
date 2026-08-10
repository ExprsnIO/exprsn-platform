/**
 * Base Connection Handler
 *
 * Abstract base class for all data source connection handlers.
 * Defines the interface and common functionality.
 */

class BaseConnectionHandler {
  constructor(config) {
    this.config = config;
    this.cache = new Map();
    this.cacheEnabled = config.cacheEnabled !== false;
    this.cacheTTL = config.cacheTTL || 300000; // 5 minutes default
  }

  /**
   * Connect to the data source
   * Must be implemented by subclasses
   */
  async connect() {
    throw new Error('connect() must be implemented by subclass');
  }

  /**
   * Disconnect from the data source
   * Must be implemented by subclasses
   */
  async disconnect() {
    throw new Error('disconnect() must be implemented by subclass');
  }

  /**
   * Test connection
   * Must be implemented by subclasses
   */
  async testConnection() {
    throw new Error('testConnection() must be implemented by subclass');
  }

  /**
   * Execute a query
   * Must be implemented by subclasses
   */
  async query(queryConfig) {
    throw new Error('query() must be implemented by subclass');
  }

  /**
   * Get data with optional caching
   */
  async getData(key, fetchFn) {
    if (this.cacheEnabled) {
      const cached = this.cache.get(key);
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.data;
      }
    }

    const data = await fetchFn();

    if (this.cacheEnabled) {
      this.cache.set(key, {
        data,
        timestamp: Date.now()
      });
    }

    return data;
  }

  /**
   * Clear cache
   */
  clearCache(key = null) {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Validate configuration
   */
  validateConfig(requiredFields) {
    const missing = requiredFields.filter(field => !this.config[field]);

    if (missing.length > 0) {
      throw new Error(`Missing required configuration fields: ${missing.join(', ')}`);
    }
  }

  /**
   * Transform data to standard format
   */
  transformData(data) {
    // Default implementation returns data as-is
    // Subclasses can override for custom transformations
    return data;
  }

  /**
   * Handle errors
   */
  handleError(error, context = {}) {
    console.error('Connection handler error:', {
      handler: this.constructor.name,
      error: error.message,
      stack: error.stack,
      context
    });

    throw new Error(`${this.constructor.name} error: ${error.message}`);
  }

  /**
   * Get connection info
   */
  getInfo() {
    return {
      type: this.constructor.name,
      cacheEnabled: this.cacheEnabled,
      cacheTTL: this.cacheTTL,
      cacheSize: this.cache.size
    };
  }
}

module.exports = BaseConnectionHandler;
