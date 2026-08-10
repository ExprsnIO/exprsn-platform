const { logger } = require('@exprsn/shared');

/**
 * Performance Monitor
 * Tracks and reports on service performance metrics
 */
class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.requestCounts = new Map();
    this.errorCounts = new Map();
    this.startTime = Date.now();
  }

  /**
   * Start timing an operation
   * @param {string} operation - Operation name
   * @returns {Function} - Stop function
   */
  startTimer(operation) {
    const start = Date.now();

    return () => {
      const duration = Date.now() - start;
      this.recordMetric(operation, duration);
      return duration;
    };
  }

  /**
   * Record a metric
   * @param {string} name - Metric name
   * @param {number} value - Metric value (ms)
   */
  recordMetric(name, value) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metrics = this.metrics.get(name);
    metrics.push(value);

    // Keep only last 1000 measurements
    if (metrics.length > 1000) {
      metrics.shift();
    }

    // Log slow operations
    if (value > 1000) {
      logger.warn('Slow operation detected', {
        operation: name,
        duration: value
      });
    }
  }

  /**
   * Increment request count
   * @param {string} endpoint - Endpoint name
   */
  incrementRequest(endpoint) {
    const count = this.requestCounts.get(endpoint) || 0;
    this.requestCounts.set(endpoint, count + 1);
  }

  /**
   * Increment error count
   * @param {string} endpoint - Endpoint name
   * @param {string} errorType - Error type
   */
  incrementError(endpoint, errorType = 'unknown') {
    const key = `${endpoint}:${errorType}`;
    const count = this.errorCounts.get(key) || 0;
    this.errorCounts.set(key, count + 1);
  }

  /**
   * Get statistics for an operation
   * @param {string} name - Operation name
   * @returns {Object} - Statistics
   */
  getStats(name) {
    const metrics = this.metrics.get(name);

    if (!metrics || metrics.length === 0) {
      return {
        count: 0,
        avg: 0,
        min: 0,
        max: 0,
        p50: 0,
        p95: 0,
        p99: 0
      };
    }

    const sorted = [...metrics].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      count: sorted.length,
      avg: Math.round(sum / sorted.length),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p50: this.percentile(sorted, 0.5),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99)
    };
  }

  /**
   * Calculate percentile
   * @param {Array} sorted - Sorted array
   * @param {number} p - Percentile (0-1)
   * @returns {number} - Value at percentile
   */
  percentile(sorted, p) {
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get all statistics
   * @returns {Object} - All statistics
   */
  getAllStats() {
    const stats = {};

    for (const [name] of this.metrics) {
      stats[name] = this.getStats(name);
    }

    return stats;
  }

  /**
   * Get request counts
   * @returns {Object} - Request counts by endpoint
   */
  getRequestCounts() {
    return Object.fromEntries(this.requestCounts);
  }

  /**
   * Get error counts
   * @returns {Object} - Error counts by endpoint and type
   */
  getErrorCounts() {
    return Object.fromEntries(this.errorCounts);
  }

  /**
   * Get error rate
   * @param {string} endpoint - Endpoint name
   * @returns {number} - Error rate (0-1)
   */
  getErrorRate(endpoint) {
    const requests = this.requestCounts.get(endpoint) || 0;
    if (requests === 0) return 0;

    let errors = 0;
    for (const [key, count] of this.errorCounts) {
      if (key.startsWith(endpoint + ':')) {
        errors += count;
      }
    }

    return errors / requests;
  }

  /**
   * Get uptime in seconds
   * @returns {number} - Uptime
   */
  getUptime() {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Get comprehensive report
   * @returns {Object} - Performance report
   */
  getReport() {
    const uptime = this.getUptime();
    const totalRequests = Array.from(this.requestCounts.values())
      .reduce((a, b) => a + b, 0);
    const totalErrors = Array.from(this.errorCounts.values())
      .reduce((a, b) => a + b, 0);

    return {
      uptime: {
        seconds: uptime,
        formatted: this.formatUptime(uptime)
      },
      requests: {
        total: totalRequests,
        perSecond: uptime > 0 ? (totalRequests / uptime).toFixed(2) : 0,
        byEndpoint: this.getRequestCounts()
      },
      errors: {
        total: totalErrors,
        rate: totalRequests > 0 ? (totalErrors / totalRequests).toFixed(4) : 0,
        byEndpoint: this.getErrorCounts()
      },
      performance: this.getAllStats(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Format uptime
   * @param {number} seconds - Uptime in seconds
   * @returns {string} - Formatted uptime
   */
  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);

    return parts.join(' ');
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics.clear();
    this.requestCounts.clear();
    this.errorCounts.clear();
    this.startTime = Date.now();
    logger.info('Performance metrics reset');
  }

  /**
   * Express middleware for automatic tracking
   * @returns {Function} - Express middleware
   */
  middleware() {
    return (req, res, next) => {
      const stopTimer = this.startTimer(`${req.method} ${req.route?.path || req.path}`);
      const endpoint = `${req.method} ${req.route?.path || req.path}`;

      this.incrementRequest(endpoint);

      // Track response
      const originalSend = res.send;
      res.send = function (data) {
        stopTimer();

        if (res.statusCode >= 400) {
          performanceMonitor.incrementError(endpoint, `http_${res.statusCode}`);
        }

        return originalSend.call(this, data);
      };

      next();
    };
  }
}

// Singleton instance
const performanceMonitor = new PerformanceMonitor();

module.exports = performanceMonitor;
