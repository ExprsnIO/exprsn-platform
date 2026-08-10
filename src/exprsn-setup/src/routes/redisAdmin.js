/**
 * ═══════════════════════════════════════════════════════════════════════
 * Redis & Caching Administration Routes
 * ═══════════════════════════════════════════════════════════════════════
 * Comprehensive Redis management including:
 * - Connection management (standalone and cluster)
 * - Service-level configuration
 * - Key management and browsing
 * - Cache statistics and monitoring
 * - Flush operations
 * - Service prefix management
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const Redis = require('ioredis');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

// Store active Redis connections per service
const redisConnections = new Map();

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CONNECTION MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/redis/connections - List all service connections
router.get('/connections', async (req, res) => {
  try {
    const services = await getServicesWithRedis();
    const connections = [];

    for (const service of services) {
      const config = await loadServiceRedisConfig(service.key);
      const status = await getConnectionStatus(service.key, config);

      connections.push({
        service: service.key,
        serviceName: service.name,
        status: status.connected ? 'connected' : 'disconnected',
        config: {
          host: config.host,
          port: config.port,
          db: config.db,
          keyPrefix: config.keyPrefix,
          clusterMode: config.clusterMode || false
        },
        stats: status.connected ? status.stats : null
      });
    }

    res.json({
      success: true,
      connections
    });
  } catch (error) {
    logger.error('Error fetching Redis connections:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/redis/test-connection - Test Redis connection
router.post('/test-connection', async (req, res) => {
  try {
    const { host, port, password, db, clusterMode, clusterNodes } = req.body;

    let testClient;

    if (clusterMode && clusterNodes && clusterNodes.length > 0) {
      // Test cluster connection
      testClient = new Redis.Cluster(
        clusterNodes.map(node => ({ host: node.host, port: node.port })),
        {
          redisOptions: {
            password: password || undefined,
            db: db || 0
          }
        }
      );
    } else {
      // Test standalone connection
      testClient = new Redis({
        host: host || 'localhost',
        port: port || 6379,
        password: password || undefined,
        db: db || 0,
        lazyConnect: true,
        retryStrategy: () => null // Don't retry for test
      });
    }

    await testClient.connect();
    const ping = await testClient.ping();

    if (ping === 'PONG') {
      const info = await testClient.info('server');
      const serverInfo = parseRedisInfo(info);

      await testClient.quit();

      res.json({
        success: true,
        message: 'Connection successful',
        serverInfo: {
          version: serverInfo.redis_version,
          mode: serverInfo.redis_mode,
          os: serverInfo.os
        }
      });
    } else {
      throw new Error('Invalid PING response');
    }
  } catch (error) {
    logger.error('Redis connection test failed:', error);
    res.status(400).json({
      success: false,
      error: 'Connection failed: ' + error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * SERVICE CONFIGURATION
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/redis/services - Get all services with Redis support
router.get('/services', async (req, res) => {
  try {
    const services = await getServicesWithRedis();
    res.json({
      success: true,
      services
    });
  } catch (error) {
    logger.error('Error fetching Redis services:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/redis/:service/config - Get Redis config for specific service
router.get('/:service/config', async (req, res) => {
  try {
    const { service } = req.params;
    const config = await loadServiceRedisConfig(service);

    res.json({
      success: true,
      service,
      config
    });
  } catch (error) {
    logger.error(`Error fetching Redis config for ${req.params.service}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/redis/:service/config - Update Redis config for service
router.post('/:service/config', async (req, res) => {
  try {
    const { service } = req.params;
    const { redis } = req.body;

    await saveServiceRedisConfig(service, redis);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('redis:config-updated', {
        service,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: `Redis configuration updated for ${service}`,
      service
    });
  } catch (error) {
    logger.error(`Error updating Redis config for ${req.params.service}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CACHE STATISTICS & MONITORING
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/redis/:service/stats - Get detailed stats for service
router.get('/:service/stats', async (req, res) => {
  try {
    const { service } = req.params;
    const config = await loadServiceRedisConfig(service);
    const client = await getRedisClient(service, config);

    const info = await client.info();
    const serverInfo = parseRedisInfo(info);
    const dbSize = await client.dbsize();
    const memory = await client.info('memory');
    const memoryInfo = parseRedisInfo(memory);

    // Get key count by prefix
    const keyPrefix = config.keyPrefix || `exprsn:${service}:`;
    const keys = await client.keys(`${keyPrefix}*`);
    const keyCount = keys.length;

    // Sample some keys for analysis
    const sampleKeys = keys.slice(0, Math.min(100, keys.length));
    const keyTypes = {};
    for (const key of sampleKeys) {
      const type = await client.type(key);
      keyTypes[type] = (keyTypes[type] || 0) + 1;
    }

    res.json({
      success: true,
      service,
      stats: {
        server: {
          version: serverInfo.redis_version,
          mode: serverInfo.redis_mode,
          uptime: parseInt(serverInfo.uptime_in_seconds),
          os: serverInfo.os
        },
        database: {
          totalKeys: dbSize,
          servicePrefixKeys: keyCount,
          keyPrefix
        },
        memory: {
          used: memoryInfo.used_memory_human,
          usedBytes: parseInt(memoryInfo.used_memory),
          peak: memoryInfo.used_memory_peak_human,
          peakBytes: parseInt(memoryInfo.used_memory_peak),
          fragmentation: parseFloat(memoryInfo.mem_fragmentation_ratio)
        },
        keyTypes,
        clients: {
          connected: parseInt(serverInfo.connected_clients)
        },
        stats: {
          totalConnections: parseInt(serverInfo.total_connections_received),
          totalCommands: parseInt(serverInfo.total_commands_processed),
          opsPerSec: parseFloat(serverInfo.instantaneous_ops_per_sec)
        }
      }
    });
  } catch (error) {
    logger.error(`Error fetching Redis stats for ${req.params.service}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/redis/global/stats - Get global Redis statistics
router.get('/global/stats', async (req, res) => {
  try {
    const services = await getServicesWithRedis();
    const globalStats = {
      totalConnections: 0,
      totalKeys: 0,
      totalMemoryBytes: 0,
      serviceStats: []
    };

    for (const service of services) {
      try {
        const config = await loadServiceRedisConfig(service.key);
        const client = await getRedisClient(service.key, config);
        const info = await client.info();
        const serverInfo = parseRedisInfo(info);
        const dbSize = await client.dbsize();
        const memory = await client.info('memory');
        const memoryInfo = parseRedisInfo(memory);

        const keyPrefix = config.keyPrefix || `exprsn:${service.key}:`;
        const keys = await client.keys(`${keyPrefix}*`);

        globalStats.totalKeys += dbSize;
        globalStats.totalMemoryBytes += parseInt(memoryInfo.used_memory);
        globalStats.totalConnections += parseInt(serverInfo.connected_clients);

        globalStats.serviceStats.push({
          service: service.key,
          serviceName: service.name,
          keys: keys.length,
          memory: memoryInfo.used_memory_human,
          connected: true
        });
      } catch (error) {
        logger.warn(`Failed to get stats for ${service.key}:`, error.message);
        globalStats.serviceStats.push({
          service: service.key,
          serviceName: service.name,
          connected: false,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      stats: globalStats
    });
  } catch (error) {
    logger.error('Error fetching global Redis stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * KEY MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/redis/:service/keys - Browse keys for service
router.get('/:service/keys', async (req, res) => {
  try {
    const { service } = req.params;
    const { pattern, limit = 100 } = req.query;

    const config = await loadServiceRedisConfig(service);
    const client = await getRedisClient(service, config);

    const keyPrefix = config.keyPrefix || `exprsn:${service}:`;
    const searchPattern = pattern || `${keyPrefix}*`;

    const keys = await client.keys(searchPattern);
    const limitedKeys = keys.slice(0, parseInt(limit));

    const keyDetails = [];
    for (const key of limitedKeys) {
      const type = await client.type(key);
      const ttl = await client.ttl(key);

      keyDetails.push({
        key,
        type,
        ttl: ttl > 0 ? ttl : null,
        persistent: ttl === -1
      });
    }

    res.json({
      success: true,
      service,
      total: keys.length,
      showing: keyDetails.length,
      pattern: searchPattern,
      keys: keyDetails
    });
  } catch (error) {
    logger.error(`Error fetching keys for ${req.params.service}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/redis/:service/keys/:key/value - Get value of specific key
router.get('/:service/keys/:key(*)/value', async (req, res) => {
  try {
    const { service, key } = req.params;

    const config = await loadServiceRedisConfig(service);
    const client = await getRedisClient(service, config);

    const type = await client.type(key);
    let value;

    switch (type) {
      case 'string':
        value = await client.get(key);
        break;
      case 'list':
        value = await client.lrange(key, 0, -1);
        break;
      case 'set':
        value = await client.smembers(key);
        break;
      case 'zset':
        value = await client.zrange(key, 0, -1, 'WITHSCORES');
        break;
      case 'hash':
        value = await client.hgetall(key);
        break;
      default:
        value = null;
    }

    const ttl = await client.ttl(key);

    res.json({
      success: true,
      service,
      key,
      type,
      value,
      ttl: ttl > 0 ? ttl : null,
      persistent: ttl === -1
    });
  } catch (error) {
    logger.error(`Error fetching key value for ${req.params.key}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE /api/redis/:service/keys/:key - Delete specific key
router.delete('/:service/keys/:key(*)', async (req, res) => {
  try {
    const { service, key } = req.params;

    const config = await loadServiceRedisConfig(service);
    const client = await getRedisClient(service, config);

    const deleted = await client.del(key);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('redis:key-deleted', {
        service,
        key,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: deleted > 0 ? 'Key deleted successfully' : 'Key not found',
      deleted: deleted > 0
    });
  } catch (error) {
    logger.error(`Error deleting key ${req.params.key}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/redis/:service/keys/delete-pattern - Delete keys by pattern
router.post('/:service/keys/delete-pattern', async (req, res) => {
  try {
    const { service } = req.params;
    const { pattern } = req.body;

    if (!pattern) {
      return res.status(400).json({
        success: false,
        error: 'Pattern is required'
      });
    }

    const config = await loadServiceRedisConfig(service);
    const client = await getRedisClient(service, config);

    const keys = await client.keys(pattern);

    if (keys.length === 0) {
      return res.json({
        success: true,
        message: 'No keys matched the pattern',
        deleted: 0
      });
    }

    const deleted = await client.del(...keys);

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('redis:keys-deleted', {
        service,
        pattern,
        count: deleted,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: `Deleted ${deleted} keys`,
      deleted
    });
  } catch (error) {
    logger.error(`Error deleting keys by pattern:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * FLUSH OPERATIONS
 * ═══════════════════════════════════════════════════════════════════════
 */

// POST /api/redis/:service/flush - Flush service cache
router.post('/:service/flush', async (req, res) => {
  try {
    const { service } = req.params;
    const { flushType = 'prefix' } = req.body; // 'prefix' or 'db'

    const config = await loadServiceRedisConfig(service);
    const client = await getRedisClient(service, config);

    let deleted = 0;

    if (flushType === 'db') {
      // Flush entire database
      await client.flushdb();
      deleted = 'all';
    } else {
      // Flush only service-prefixed keys
      const keyPrefix = config.keyPrefix || `exprsn:${service}:`;
      const keys = await client.keys(`${keyPrefix}*`);

      if (keys.length > 0) {
        deleted = await client.del(...keys);
      }
    }

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('redis:flushed', {
        service,
        flushType,
        deleted,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: flushType === 'db'
        ? 'Database flushed successfully'
        : `Deleted ${deleted} service keys`,
      deleted
    });
  } catch (error) {
    logger.error(`Error flushing cache for ${req.params.service}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/redis/flush-all - Flush all Redis databases (DANGEROUS)
router.post('/flush-all', async (req, res) => {
  try {
    const { confirmation } = req.body;

    if (confirmation !== 'FLUSH_ALL_DATABASES') {
      return res.status(400).json({
        success: false,
        error: 'Invalid confirmation. Must be "FLUSH_ALL_DATABASES"'
      });
    }

    // Get any service config to connect to Redis
    const services = await getServicesWithRedis();
    if (services.length === 0) {
      throw new Error('No Redis services configured');
    }

    const config = await loadServiceRedisConfig(services[0].key);
    const client = await getRedisClient(services[0].key, config);

    await client.flushall();

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('redis:flush-all', {
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'All Redis databases flushed successfully'
    });
  } catch (error) {
    logger.error('Error flushing all databases:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CLUSTER MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════
 */

// GET /api/redis/:service/cluster/info - Get cluster information
router.get('/:service/cluster/info', async (req, res) => {
  try {
    const { service } = req.params;
    const config = await loadServiceRedisConfig(service);

    if (!config.clusterMode) {
      return res.json({
        success: true,
        clusterMode: false,
        message: 'Service is not configured for cluster mode'
      });
    }

    const client = await getRedisClient(service, config);
    const clusterInfo = await client.cluster('INFO');
    const nodes = await client.cluster('NODES');

    res.json({
      success: true,
      clusterMode: true,
      info: parseClusterInfo(clusterInfo),
      nodes: parseClusterNodes(nodes)
    });
  } catch (error) {
    logger.error(`Error fetching cluster info for ${req.params.service}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * HELPER FUNCTIONS
 * ═══════════════════════════════════════════════════════════════════════
 */

async function getServicesWithRedis() {
  // Return list of services that support Redis
  return [
    { key: 'ca', name: 'Certificate Authority', port: 3000 },
    { key: 'auth', name: 'Authentication & SSO', port: 3001 },
    { key: 'spark', name: 'Real-time Messaging', port: 3002 },
    { key: 'timeline', name: 'Social Feed', port: 3004 },
    { key: 'prefetch', name: 'Timeline Prefetching', port: 3005 },
    { key: 'moderator', name: 'Content Moderation', port: 3006 },
    { key: 'gallery', name: 'Media Galleries', port: 3008 },
    { key: 'live', name: 'Live Streaming', port: 3009 },
    { key: 'bridge', name: 'API Gateway', port: 3010 },
    { key: 'nexus', name: 'Groups & Events', port: 3011 },
    { key: 'pulse', name: 'Analytics & Metrics', port: 3012 },
    { key: 'herald', name: 'Notifications & Alerts', port: 3014 },
    { key: 'forge', name: 'Business Platform', port: 3016 },
    { key: 'workflow', name: 'Workflow Automation', port: 3017 }
  ];
}

async function loadServiceRedisConfig(service) {
  const envPath = path.join(__dirname, '../../../../', `.env.${service}`);

  let config = {};
  try {
    const envContent = await fs.readFile(envPath, 'utf-8');
    config = parseEnvFile(envContent);
  } catch (error) {
    // Try main .env
    try {
      const mainEnvPath = path.join(__dirname, '../../../../', '.env');
      const mainEnvContent = await fs.readFile(mainEnvPath, 'utf-8');
      config = parseEnvFile(mainEnvContent);
    } catch (err) {
      // Use defaults
    }
  }

  return {
    enabled: config.REDIS_ENABLED !== 'false',
    host: config.REDIS_HOST || 'localhost',
    port: parseInt(config.REDIS_PORT) || 6379,
    password: config.REDIS_PASSWORD || '',
    db: parseInt(config.REDIS_DB) || 0,
    keyPrefix: config.REDIS_KEY_PREFIX || `exprsn:${service}:`,
    tls: config.REDIS_TLS === 'true',
    maxRetriesPerRequest: parseInt(config.REDIS_MAX_RETRIES) || 3,
    enableReadyCheck: config.REDIS_READY_CHECK !== 'false',
    connectTimeout: parseInt(config.REDIS_CONNECT_TIMEOUT) || 10000,
    clusterMode: config.REDIS_CLUSTER_MODE === 'true',
    clusterNodes: config.REDIS_CLUSTER_NODES ? JSON.parse(config.REDIS_CLUSTER_NODES) : []
  };
}

async function saveServiceRedisConfig(service, redisConfig) {
  const envPath = path.join(__dirname, '../../../../', `.env.${service}`);

  let config = {};
  try {
    const envContent = await fs.readFile(envPath, 'utf-8');
    config = parseEnvFile(envContent);
  } catch (error) {
    // File doesn't exist, create new
    config = {};
  }

  config.REDIS_ENABLED = redisConfig.enabled ? 'true' : 'false';
  config.REDIS_HOST = redisConfig.host;
  config.REDIS_PORT = redisConfig.port;
  config.REDIS_PASSWORD = redisConfig.password;
  config.REDIS_DB = redisConfig.db;
  config.REDIS_KEY_PREFIX = redisConfig.keyPrefix;
  config.REDIS_TLS = redisConfig.tls ? 'true' : 'false';
  config.REDIS_MAX_RETRIES = redisConfig.maxRetriesPerRequest;
  config.REDIS_READY_CHECK = redisConfig.enableReadyCheck ? 'true' : 'false';
  config.REDIS_CONNECT_TIMEOUT = redisConfig.connectTimeout;
  config.REDIS_CLUSTER_MODE = redisConfig.clusterMode ? 'true' : 'false';
  if (redisConfig.clusterNodes && redisConfig.clusterNodes.length > 0) {
    config.REDIS_CLUSTER_NODES = JSON.stringify(redisConfig.clusterNodes);
  }

  const envContent = generateEnvFile(config, service);
  await fs.writeFile(envPath, envContent, 'utf-8');
}

function parseEnvFile(content) {
  const config = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();

      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      config[key] = value;
    }
  }

  return config;
}

function generateEnvFile(config, service) {
  let content = `# Exprsn ${service.charAt(0).toUpperCase() + service.slice(1)} - Redis Configuration\n`;
  content += `# Generated: ${new Date().toISOString()}\n\n`;

  for (const [key, value] of Object.entries(config)) {
    content += `${key}=${value}\n`;
  }

  return content;
}

async function getRedisClient(service, config) {
  const connectionKey = `${service}:${config.host}:${config.port}:${config.db}`;

  if (redisConnections.has(connectionKey)) {
    return redisConnections.get(connectionKey);
  }

  let client;

  if (config.clusterMode && config.clusterNodes && config.clusterNodes.length > 0) {
    client = new Redis.Cluster(
      config.clusterNodes,
      {
        redisOptions: {
          password: config.password || undefined,
          db: config.db,
          tls: config.tls ? {} : undefined,
          connectTimeout: config.connectTimeout
        }
      }
    );
  } else {
    client = new Redis({
      host: config.host,
      port: config.port,
      password: config.password || undefined,
      db: config.db,
      keyPrefix: '', // Don't use prefix for admin operations
      tls: config.tls ? {} : undefined,
      maxRetriesPerRequest: config.maxRetriesPerRequest,
      enableReadyCheck: config.enableReadyCheck,
      connectTimeout: config.connectTimeout,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });
  }

  client.on('error', (err) => {
    logger.error(`Redis error for ${service}:`, err);
  });

  redisConnections.set(connectionKey, client);
  return client;
}

async function getConnectionStatus(service, config) {
  try {
    const client = await getRedisClient(service, config);
    const ping = await client.ping();
    const info = await client.info('server');
    const serverInfo = parseRedisInfo(info);

    return {
      connected: ping === 'PONG',
      stats: {
        version: serverInfo.redis_version,
        uptime: parseInt(serverInfo.uptime_in_seconds)
      }
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message
    };
  }
}

function parseRedisInfo(info) {
  const lines = info.split('\r\n');
  const result = {};

  for (const line of lines) {
    if (line && !line.startsWith('#')) {
      const [key, value] = line.split(':');
      if (key && value !== undefined) {
        result[key] = value;
      }
    }
  }

  return result;
}

function parseClusterInfo(info) {
  const result = {};
  const lines = info.split('\r\n');

  for (const line of lines) {
    const [key, value] = line.split(':');
    if (key && value !== undefined) {
      result[key] = value;
    }
  }

  return result;
}

function parseClusterNodes(nodes) {
  const lines = nodes.split('\n').filter(line => line.trim());
  return lines.map(line => {
    const parts = line.split(' ');
    return {
      id: parts[0],
      address: parts[1],
      flags: parts[2],
      master: parts[3],
      ping: parts[4],
      pong: parts[5],
      epoch: parts[6],
      status: parts[7]
    };
  });
}

module.exports = router;
