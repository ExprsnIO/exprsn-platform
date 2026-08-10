/**
 * ═══════════════════════════════════════════════════════════════════════
 * Redis Manager
 * Comprehensive Redis management for Exprsn services
 * ═══════════════════════════════════════════════════════════════════════
 */

const redis = require('redis');
const logger = require('../../utils/logger');

class RedisManager {
  constructor() {
    // Default Redis configuration
    this.config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB) || 0,
      // Connection settings
      connectTimeout: 5000,
      commandTimeout: 5000,
      retryStrategy: (times) => {
        if (times > 3) return null; // Stop retrying
        return Math.min(times * 100, 3000); // Exponential backoff
      }
    };

    // Service-specific prefixes
    this.servicePrefixes = {
      ca: 'ca:',
      auth: 'auth:',
      spark: 'spark:',
      timeline: 'timeline:',
      prefetch: 'prefetch:',
      moderator: 'moderator:',
      filevault: 'filevault:',
      gallery: 'gallery:',
      live: 'live:',
      bridge: 'bridge:',
      nexus: 'nexus:',
      pulse: 'pulse:',
      vault: 'vault:',
      herald: 'herald:',
      setup: 'setup:',
      forge: 'forge:',
      workflow: 'workflow:',
      svr: 'svr:',
      // Common prefixes
      cache: 'cache:',
      session: 'session:',
      queue: 'queue:',
      lock: 'lock:',
      rate: 'rate:'
    };

    // Redis clients (lazy initialization)
    this.clients = new Map();
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * CONNECTION MANAGEMENT
   * ═══════════════════════════════════════════════════════════════════════
   */

  /**
   * Create Redis client with configuration
   */
  createClient(options = {}) {
    const config = {
      socket: {
        host: options.host || this.config.host,
        port: options.port || this.config.port,
        connectTimeout: this.config.connectTimeout
      },
      password: options.password || this.config.password,
      database: options.db !== undefined ? options.db : this.config.db,
      commandsQueueMaxLength: 1000
    };

    // TLS configuration if enabled
    if (options.tls || process.env.REDIS_TLS_ENABLED === 'true') {
      config.socket.tls = true;
      if (options.tlsCert) {
        config.socket.cert = options.tlsCert;
        config.socket.key = options.tlsKey;
        config.socket.ca = options.tlsCa;
      }
    }

    const client = redis.createClient(config);

    // Error handling
    client.on('error', (err) => {
      logger.error('Redis client error:', err);
    });

    client.on('ready', () => {
      logger.info(`Redis client connected to ${config.socket.host}:${config.socket.port}`);
    });

    client.on('end', () => {
      logger.info('Redis client disconnected');
    });

    return client;
  }

  /**
   * Get or create Redis client for a specific purpose
   */
  async getClient(name = 'default') {
    if (!this.clients.has(name)) {
      const client = this.createClient();
      await client.connect();
      this.clients.set(name, client);
    }

    return this.clients.get(name);
  }

  /**
   * Test Redis connection
   */
  async testConnection(options = {}) {
    let client;
    try {
      client = this.createClient(options);
      await client.connect();

      // Test PING
      const pong = await client.ping();

      // Get server info
      const info = await client.info('server');
      const versionMatch = info.match(/redis_version:([^\r\n]+)/);
      const version = versionMatch ? versionMatch[1] : 'unknown';

      const modeMatch = info.match(/redis_mode:([^\r\n]+)/);
      const mode = modeMatch ? modeMatch[1] : 'standalone';

      await client.quit();

      return {
        success: true,
        connected: true,
        ping: pong,
        version,
        mode,
        host: options.host || this.config.host,
        port: options.port || this.config.port
      };
    } catch (error) {
      logger.error('Redis connection test failed:', error);
      if (client && client.isOpen) {
        await client.quit().catch(() => {});
      }
      return {
        success: false,
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * KEY OPERATIONS
   * ═══════════════════════════════════════════════════════════════════════
   */

  /**
   * Get keys by pattern
   */
  async getKeys(pattern = '*', options = {}) {
    try {
      const client = await this.getClient();
      const limit = options.limit || 1000;
      const cursor = options.cursor || 0;

      const result = await client.scan(cursor, {
        MATCH: pattern,
        COUNT: limit
      });

      return {
        success: true,
        cursor: result.cursor,
        keys: result.keys,
        count: result.keys.length,
        hasMore: result.cursor !== 0
      };
    } catch (error) {
      logger.error('Failed to get keys:', error);
      throw error;
    }
  }

  /**
   * Get key details
   */
  async getKeyDetails(key) {
    try {
      const client = await this.getClient();

      // Check if key exists
      const exists = await client.exists(key);
      if (!exists) {
        return {
          success: false,
          error: 'Key not found',
          key
        };
      }

      // Get key type
      const type = await client.type(key);

      // Get TTL
      const ttl = await client.ttl(key);

      // Get memory usage
      const memoryUsage = await client.memoryUsage(key).catch(() => null);

      // Get value based on type
      let value;
      let size;

      switch (type) {
        case 'string':
          value = await client.get(key);
          size = value ? value.length : 0;
          break;

        case 'list':
          const listLength = await client.lLen(key);
          value = await client.lRange(key, 0, 99); // First 100 items
          size = listLength;
          break;

        case 'set':
          size = await client.sCard(key);
          value = await client.sMembers(key);
          break;

        case 'zset':
          size = await client.zCard(key);
          value = await client.zRange(key, 0, 99); // First 100 items
          break;

        case 'hash':
          value = await client.hGetAll(key);
          size = Object.keys(value).length;
          break;

        default:
          value = null;
          size = 0;
      }

      return {
        success: true,
        key,
        type,
        ttl,
        size,
        memoryUsage,
        value,
        encoding: await client.objectEncoding(key).catch(() => 'unknown')
      };
    } catch (error) {
      logger.error(`Failed to get key details for ${key}:`, error);
      throw error;
    }
  }

  /**
   * Delete keys by pattern
   */
  async deleteKeys(pattern) {
    try {
      const client = await this.getClient();
      let deleted = 0;
      let cursor = 0;

      do {
        const result = await client.scan(cursor, {
          MATCH: pattern,
          COUNT: 1000
        });

        cursor = result.cursor;

        if (result.keys.length > 0) {
          const delCount = await client.del(result.keys);
          deleted += delCount;
        }
      } while (cursor !== 0);

      return {
        success: true,
        deleted,
        pattern
      };
    } catch (error) {
      logger.error(`Failed to delete keys with pattern ${pattern}:`, error);
      throw error;
    }
  }

  /**
   * Flush database
   */
  async flushDatabase(db = null) {
    try {
      const client = await this.getClient();

      if (db !== null) {
        await client.select(db);
        await client.flushDb();
      } else {
        await client.flushAll();
      }

      return {
        success: true,
        message: db !== null ? `Flushed database ${db}` : 'Flushed all databases'
      };
    } catch (error) {
      logger.error('Failed to flush database:', error);
      throw error;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * PREFIX MANAGEMENT
   * ═══════════════════════════════════════════════════════════════════════
   */

  /**
   * Get keys by service prefix
   */
  async getServiceKeys(serviceId, options = {}) {
    const prefix = this.servicePrefixes[serviceId];
    if (!prefix) {
      throw new Error(`Unknown service: ${serviceId}`);
    }

    const pattern = options.pattern ? `${prefix}${options.pattern}` : `${prefix}*`;
    return this.getKeys(pattern, options);
  }

  /**
   * Get memory usage by prefix
   */
  async getMemoryByPrefix() {
    try {
      const client = await this.getClient();
      const prefixUsage = {};

      for (const [service, prefix] of Object.entries(this.servicePrefixes)) {
        let cursor = 0;
        let totalMemory = 0;
        let keyCount = 0;

        do {
          const result = await client.scan(cursor, {
            MATCH: `${prefix}*`,
            COUNT: 1000
          });

          cursor = result.cursor;

          for (const key of result.keys) {
            const memory = await client.memoryUsage(key).catch(() => 0);
            totalMemory += memory || 0;
            keyCount++;
          }
        } while (cursor !== 0);

        prefixUsage[service] = {
          prefix,
          keys: keyCount,
          memory: totalMemory,
          memoryPretty: this.formatBytes(totalMemory)
        };
      }

      return {
        success: true,
        prefixes: prefixUsage
      };
    } catch (error) {
      logger.error('Failed to get memory by prefix:', error);
      throw error;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * MONITORING & STATISTICS
   * ═══════════════════════════════════════════════════════════════════════
   */

  /**
   * Get Redis server info
   */
  async getServerInfo() {
    try {
      const client = await this.getClient();

      const info = await client.info();
      const config = await client.configGet('*');

      // Parse info sections
      const sections = this.parseInfo(info);

      // Get additional stats
      const dbSize = await client.dbSize();
      const clientList = await client.clientList();
      const slowlog = await client.slowlogGet(10);

      return {
        success: true,
        info: sections,
        config: this.parseConfigArray(config),
        dbSize,
        connectedClients: clientList.split('\n').filter(l => l.trim()).length,
        slowlog: slowlog.map(entry => ({
          id: entry.id,
          timestamp: entry.timestamp,
          duration: entry.duration,
          command: entry.command
        }))
      };
    } catch (error) {
      logger.error('Failed to get server info:', error);
      throw error;
    }
  }

  /**
   * Get memory statistics
   */
  async getMemoryStats() {
    try {
      const client = await this.getClient();

      const info = await client.info('memory');
      const memoryStats = this.parseInfo(info).Memory || {};

      return {
        success: true,
        used: parseInt(memoryStats.used_memory || 0),
        usedPretty: memoryStats.used_memory_human,
        peak: parseInt(memoryStats.used_memory_peak || 0),
        peakPretty: memoryStats.used_memory_peak_human,
        rss: parseInt(memoryStats.used_memory_rss || 0),
        rssPretty: memoryStats.used_memory_rss_human,
        fragmentation: parseFloat(memoryStats.mem_fragmentation_ratio || 0),
        maxmemory: parseInt(memoryStats.maxmemory || 0),
        maxmemoryPretty: memoryStats.maxmemory_human,
        evictedKeys: parseInt(memoryStats.evicted_keys || 0)
      };
    } catch (error) {
      logger.error('Failed to get memory stats:', error);
      throw error;
    }
  }

  /**
   * Get command statistics
   */
  async getCommandStats() {
    try {
      const client = await this.getClient();

      const info = await client.info('commandstats');
      const stats = this.parseInfo(info).Commandstats || {};

      const commands = [];
      for (const [key, value] of Object.entries(stats)) {
        if (key.startsWith('cmdstat_')) {
          const cmdName = key.replace('cmdstat_', '');
          const match = value.match(/calls=(\d+),usec=(\d+),usec_per_call=([0-9.]+)/);

          if (match) {
            commands.push({
              command: cmdName,
              calls: parseInt(match[1]),
              usec: parseInt(match[2]),
              usecPerCall: parseFloat(match[3])
            });
          }
        }
      }

      // Sort by calls descending
      commands.sort((a, b) => b.calls - a.calls);

      return {
        success: true,
        commands,
        total: commands.reduce((sum, cmd) => sum + cmd.calls, 0)
      };
    } catch (error) {
      logger.error('Failed to get command stats:', error);
      throw error;
    }
  }

  /**
   * Get client connections
   */
  async getConnections() {
    try {
      const client = await this.getClient();

      const clientList = await client.clientList();
      const clients = clientList.split('\n').filter(l => l.trim()).map(line => {
        const parts = {};
        line.split(' ').forEach(part => {
          const [key, value] = part.split('=');
          if (key && value) parts[key] = value;
        });
        return parts;
      });

      return {
        success: true,
        clients,
        total: clients.length,
        byName: this.groupBy(clients, 'name')
      };
    } catch (error) {
      logger.error('Failed to get connections:', error);
      throw error;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * CONFIGURATION MANAGEMENT
   * ═══════════════════════════════════════════════════════════════════════
   */

  /**
   * Get Redis configuration
   */
  async getConfig(parameter = '*') {
    try {
      const client = await this.getClient();
      const config = await client.configGet(parameter);

      return {
        success: true,
        config: this.parseConfigArray(config)
      };
    } catch (error) {
      logger.error('Failed to get config:', error);
      throw error;
    }
  }

  /**
   * Set Redis configuration
   */
  async setConfig(parameter, value) {
    try {
      const client = await this.getClient();
      await client.configSet(parameter, value);

      logger.info(`Set Redis config: ${parameter} = ${value}`);

      return {
        success: true,
        parameter,
        value,
        message: 'Configuration updated successfully'
      };
    } catch (error) {
      logger.error(`Failed to set config ${parameter}:`, error);
      throw error;
    }
  }

  /**
   * Rewrite Redis configuration file
   */
  async rewriteConfig() {
    try {
      const client = await this.getClient();
      await client.configRewrite();

      return {
        success: true,
        message: 'Configuration file rewritten successfully'
      };
    } catch (error) {
      logger.error('Failed to rewrite config:', error);
      throw error;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * UTILITY METHODS
   * ═══════════════════════════════════════════════════════════════════════
   */

  /**
   * Parse Redis INFO output
   */
  parseInfo(info) {
    const sections = {};
    let currentSection = null;

    info.split('\r\n').forEach(line => {
      line = line.trim();

      if (line.startsWith('#')) {
        // Section header
        currentSection = line.substring(2).trim();
        sections[currentSection] = {};
      } else if (line && currentSection) {
        // Key-value pair
        const [key, value] = line.split(':');
        if (key && value !== undefined) {
          sections[currentSection][key] = value;
        }
      }
    });

    return sections;
  }

  /**
   * Parse CONFIG GET array response
   */
  parseConfigArray(configArray) {
    const config = {};
    for (let i = 0; i < configArray.length; i += 2) {
      config[configArray[i]] = configArray[i + 1];
    }
    return config;
  }

  /**
   * Format bytes to human-readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Group array by property
   */
  groupBy(array, property) {
    return array.reduce((acc, item) => {
      const key = item[property] || 'unknown';
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(item);
      return acc;
    }, {});
  }

  /**
   * Close all Redis clients
   */
  async closeAllClients() {
    const promises = [];
    for (const [name, client] of this.clients.entries()) {
      promises.push(
        client.quit().then(() => {
          logger.info(`Closed Redis client: ${name}`);
        }).catch(err => {
          logger.error(`Failed to close Redis client ${name}:`, err);
        })
      );
    }

    await Promise.all(promises);
    this.clients.clear();
  }
}

// Singleton instance
const redisManager = new RedisManager();

module.exports = redisManager;
