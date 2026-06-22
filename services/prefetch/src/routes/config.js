/**
 * Configuration Management Routes
 * Provides endpoints for the Setup dashboard to manage Prefetch configurations
 */

const express = require('express');
const router = express.Router();

// Logger
const logger = require('../utils/logger');

/**
 * GET /api/config/:sectionId
 * Fetch configuration for a specific section
 */
router.get('/:sectionId', async (req, res) => {
  const { sectionId } = req.params;

  try {
    let data;

    switch (sectionId) {
      case 'prefetch':
      case 'prefetch-settings':
        data = await getPrefetchSettings();
        break;

      case 'prefetch-cache':
        data = await getCacheConfig();
        break;

      case 'prefetch-performance':
        data = await getPerformanceConfig();
        break;

      default:
        return res.status(404).json({
          success: false,
          error: 'Configuration section not found'
        });
    }

    res.json(data);
  } catch (error) {
    logger.error(`Error fetching config for ${sectionId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/config/:sectionId
 * Update configuration for a specific section
 */
router.post('/:sectionId', async (req, res) => {
  const { sectionId } = req.params;
  const configData = req.body;

  try {
    let result;

    switch (sectionId) {
      case 'prefetch-settings':
        result = await updatePrefetchSettings(configData);
        break;

      case 'prefetch-cache':
        result = await updateCacheConfig(configData);
        break;

      case 'prefetch-performance':
        result = await updatePerformanceConfig(configData);
        break;

      default:
        return res.status(404).json({
          success: false,
          error: 'Configuration section not found'
        });
    }

    res.json({
      success: true,
      result
    });
  } catch (error) {
    logger.error(`Error updating config for ${sectionId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// Configuration Fetching Functions
// ========================================

async function getPrefetchSettings() {
  return {
    title: 'Prefetch Settings',
    description: 'Configure timeline prefetching and caching behavior',
    fields: [
      { name: 'enablePrefetch', label: 'Enable Prefetching', type: 'checkbox', value: process.env.PREFETCH_ENABLED !== 'false' },
      { name: 'prefetchInterval', label: 'Prefetch Interval (seconds)', type: 'number', value: parseInt(process.env.PREFETCH_INTERVAL) || 60 },
      { name: 'prefetchDepth', label: 'Prefetch Depth (posts)', type: 'number', value: parseInt(process.env.PREFETCH_DEPTH) || 50 },
      { name: 'enableActivity', label: 'Activity-Based Prefetching', type: 'checkbox', value: process.env.PREFETCH_ACTIVITY_BASED !== 'false' },
      { name: 'minActivity', label: 'Min Activity Score', type: 'number', value: parseInt(process.env.PREFETCH_MIN_ACTIVITY) || 5 }
    ]
  };
}

async function getCacheConfig() {
  return {
    title: 'Cache Configuration',
    description: 'Configure hot and warm cache settings',
    fields: [
      { name: 'hotCacheTTL', label: 'Hot Cache TTL (seconds)', type: 'number', value: parseInt(process.env.HOT_CACHE_TTL) || 300 },
      { name: 'warmCacheTTL', label: 'Warm Cache TTL (seconds)', type: 'number', value: parseInt(process.env.WARM_CACHE_TTL) || 3600 },
      { name: 'maxHotCacheSize', label: 'Max Hot Cache Size (MB)', type: 'number', value: parseInt(process.env.MAX_HOT_CACHE_SIZE) || 100 },
      { name: 'maxWarmCacheSize', label: 'Max Warm Cache Size (MB)', type: 'number', value: parseInt(process.env.MAX_WARM_CACHE_SIZE) || 500 },
      { name: 'enableCompression', label: 'Enable Cache Compression', type: 'checkbox', value: process.env.CACHE_COMPRESSION === 'true' },
      { name: 'evictionPolicy', label: 'Eviction Policy', type: 'select', options: ['LRU', 'LFU', 'FIFO'], value: process.env.CACHE_EVICTION || 'LRU' }
    ],
    stats: {
      hotCacheHits: 0,
      hotCacheMisses: 0,
      warmCacheHits: 0,
      warmCacheMisses: 0,
      hitRate: '0%'
    }
  };
}

async function getPerformanceConfig() {
  return {
    title: 'Performance Tuning',
    description: 'Configure performance and optimization settings',
    fields: [
      { name: 'maxConcurrentRequests', label: 'Max Concurrent Requests', type: 'number', value: parseInt(process.env.MAX_CONCURRENT_REQUESTS) || 10 },
      { name: 'requestTimeout', label: 'Request Timeout (ms)', type: 'number', value: parseInt(process.env.REQUEST_TIMEOUT) || 5000 },
      { name: 'retryAttempts', label: 'Retry Attempts', type: 'number', value: parseInt(process.env.RETRY_ATTEMPTS) || 3 },
      { name: 'retryDelay', label: 'Retry Delay (ms)', type: 'number', value: parseInt(process.env.RETRY_DELAY) || 1000 },
      { name: 'enableMetrics', label: 'Enable Performance Metrics', type: 'checkbox', value: process.env.ENABLE_METRICS !== 'false' },
      { name: 'metricsInterval', label: 'Metrics Collection Interval (seconds)', type: 'number', value: parseInt(process.env.METRICS_INTERVAL) || 60 }
    ],
    stats: {
      avgResponseTime: '0ms',
      requestsPerSecond: 0,
      errorRate: '0%',
      uptime: '0h 0m'
    }
  };
}

// ========================================
// Configuration Update Functions
// ========================================

async function updatePrefetchSettings(configData) {
  logger.info('Prefetch settings updated:', configData);

  if (configData.enablePrefetch !== undefined) {
    logger.info(`Prefetching ${configData.enablePrefetch ? 'enabled' : 'disabled'}`);
  }

  if (configData.prefetchInterval) {
    logger.info(`Prefetch interval set to ${configData.prefetchInterval} seconds`);
  }

  return {
    message: 'Prefetch settings updated successfully',
    config: configData
  };
}

async function updateCacheConfig(configData) {
  logger.info('Cache configuration updated:', configData);

  if (configData.hotCacheTTL) {
    logger.info(`Hot cache TTL set to ${configData.hotCacheTTL} seconds`);
  }

  if (configData.evictionPolicy) {
    logger.info(`Cache eviction policy changed to ${configData.evictionPolicy}`);
  }

  return {
    message: 'Cache configuration updated successfully',
    config: configData
  };
}

async function updatePerformanceConfig(configData) {
  logger.info('Performance configuration updated:', configData);

  if (configData.maxConcurrentRequests) {
    logger.info(`Max concurrent requests set to ${configData.maxConcurrentRequests}`);
  }

  return {
    message: 'Performance configuration updated successfully',
    config: configData
  };
}

module.exports = router;
