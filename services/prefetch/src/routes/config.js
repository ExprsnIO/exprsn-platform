/**
 * Configuration Management Routes
 * Provides endpoints for the Setup dashboard to manage Prefetch configurations
 */

const express = require('express');
const router = express.Router();
const { requirePlatformAdmin } = require('@exprsn/shared');

// Platform-config management is admin-only (TASK-039). These sections were
// previously reachable (read AND write) by anonymous callers; the shared gate
// validates the CA bearer and requires platform-admin identity.
router.use(requirePlatformAdmin);

// Logger
const logger = require('../utils/logger');

// Persisted section settings (TASK-039). Prefetch has no SQL models, so
// sections persist as JSON under prefetch:config:<sectionId> in the shared
// Redis. Stored values overlay the env-derived field defaults on read;
// previously POSTs logged-and-echoed without persisting anything.
const Redis = require('ioredis');
let configRedis = null;
function redis() {
  if (!configRedis) {
    configRedis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB) || 0,
      lazyConnect: true,
      maxRetriesPerRequest: 1
    });
  }
  return configRedis;
}
const configKey = (sectionId) => `prefetch:config:${sectionId}`;

async function storedSection(sectionId) {
  try {
    const raw = await redis().get(configKey(sectionId));
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    logger.warn(`Failed to load stored config for ${sectionId}: ${error.message}`);
    return {};
  }
}

function overlayStored(section, stored) {
  if (Array.isArray(section.fields)) {
    for (const field of section.fields) {
      if (Object.prototype.hasOwnProperty.call(stored, field.name)) {
        field.value = stored[field.name];
      }
    }
  }
  return section;
}

const SECTION_FIELDS = {
  'prefetch-settings': ['enablePrefetch', 'prefetchInterval', 'prefetchDepth', 'enableActivity', 'minActivity'],
  'prefetch-cache': ['hotCacheTTL', 'warmCacheTTL', 'maxHotCacheSize', 'maxWarmCacheSize', 'enableCompression', 'evictionPolicy'],
  'prefetch-performance': ['maxConcurrentRequests', 'requestTimeout', 'retryAttempts', 'retryDelay', 'enableMetrics', 'metricsInterval']
};

async function updateSection(sectionId, configData) {
  // ConfigSectionEditor round-trips the whole schema ({ fields: [...] });
  // accept either that or a flat key/value object.
  const flat = Array.isArray(configData && configData.fields)
    ? Object.fromEntries(configData.fields.map((f) => [f.name, f.value]))
    : configData;
  const allowed = SECTION_FIELDS[sectionId];
  const clean = { ...(await storedSection(sectionId)) };
  const rejected = [];
  for (const [key, value] of Object.entries(flat || {})) {
    if (allowed.includes(key)) clean[key] = value;
    else rejected.push(key);
  }
  await redis().set(configKey(sectionId), JSON.stringify(clean));
  logger.info(`Prefetch config section ${sectionId} saved`, { keys: Object.keys(clean) });
  return {
    message: 'Configuration saved',
    config: clean,
    ...(rejected.length ? { rejectedKeys: rejected } : {})
  };
}

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

    const canonical = sectionId === 'prefetch' ? 'prefetch-settings' : sectionId;
    res.json(overlayStored(data, await storedSection(canonical)));
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
      case 'prefetch':
      case 'prefetch-settings':
        result = await updateSection('prefetch-settings', configData);
        break;

      case 'prefetch-cache':
        result = await updateSection('prefetch-cache', configData);
        break;

      case 'prefetch-performance':
        result = await updateSection('prefetch-performance', configData);
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

module.exports = router;
