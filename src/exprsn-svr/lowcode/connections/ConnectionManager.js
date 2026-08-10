/**
 * Connection Manager
 *
 * Central manager for all data source connections in the low-code platform.
 * Handles connection pooling, lifecycle management, and provides a unified interface.
 */

const PostgreSQLConnectionHandler = require('./PostgreSQLConnectionHandler');
const ForgeConnectionHandler = require('./ForgeConnectionHandler');
const RESTConnectionHandler = require('./RESTConnectionHandler');
const SOAPConnectionHandler = require('./SOAPConnectionHandler');
const FileConnectionHandler = require('./FileConnectionHandler');

class ConnectionManager {
  constructor() {
    this.connections = new Map();
    this.handlers = {
      'postgresql': PostgreSQLConnectionHandler,
      'postgres': PostgreSQLConnectionHandler,
      'pg': PostgreSQLConnectionHandler,
      'forge': ForgeConnectionHandler,
      'rest': RESTConnectionHandler,
      'http': RESTConnectionHandler,
      'https': RESTConnectionHandler,
      'soap': SOAPConnectionHandler,
      'json': FileConnectionHandler,
      'xml': FileConnectionHandler,
      'csv': FileConnectionHandler,
      'tsv': FileConnectionHandler,
      'file': FileConnectionHandler
    };
  }

  /**
   * Register a custom connection handler
   */
  registerHandler(type, HandlerClass) {
    this.handlers[type.toLowerCase()] = HandlerClass;
  }

  /**
   * Create a new connection
   */
  async createConnection(id, type, config) {
    if (this.connections.has(id)) {
      throw new Error(`Connection with ID "${id}" already exists`);
    }

    const HandlerClass = this.handlers[type.toLowerCase()];

    if (!HandlerClass) {
      throw new Error(`Unknown connection type: ${type}`);
    }

    try {
      // Create handler instance
      const handler = new HandlerClass(config);

      // Connect
      await handler.connect();

      // Store connection
      this.connections.set(id, {
        id,
        type,
        handler,
        config,
        createdAt: new Date(),
        lastUsed: new Date()
      });

      return {
        success: true,
        id,
        type,
        createdAt: new Date()
      };
    } catch (error) {
      console.error(`Failed to create connection "${id}":`, error);
      throw new Error(`Connection creation failed: ${error.message}`);
    }
  }

  /**
   * Get an existing connection
   */
  getConnection(id) {
    const connection = this.connections.get(id);

    if (!connection) {
      throw new Error(`Connection "${id}" not found`);
    }

    // Update last used timestamp
    connection.lastUsed = new Date();

    return connection.handler;
  }

  /**
   * Check if connection exists
   */
  hasConnection(id) {
    return this.connections.has(id);
  }

  /**
   * Remove a connection
   */
  async removeConnection(id) {
    const connection = this.connections.get(id);

    if (!connection) {
      throw new Error(`Connection "${id}" not found`);
    }

    try {
      // Disconnect handler
      await connection.handler.disconnect();

      // Remove from map
      this.connections.delete(id);

      return {
        success: true,
        id
      };
    } catch (error) {
      console.error(`Failed to remove connection "${id}":`, error);
      throw new Error(`Connection removal failed: ${error.message}`);
    }
  }

  /**
   * Test a connection
   */
  async testConnection(id) {
    const handler = this.getConnection(id);
    return handler.testConnection();
  }

  /**
   * Execute query on a connection
   */
  async query(id, queryConfig) {
    const handler = this.getConnection(id);
    return handler.query(queryConfig);
  }

  /**
   * Clear cache for a connection
   */
  clearCache(id, key = null) {
    const handler = this.getConnection(id);

    if (handler.clearCache) {
      handler.clearCache(key);
      return { success: true };
    }

    return { success: false, message: 'Cache not supported by this connection type' };
  }

  /**
   * Get connection info
   */
  getConnectionInfo(id) {
    const connection = this.connections.get(id);

    if (!connection) {
      throw new Error(`Connection "${id}" not found`);
    }

    return {
      id: connection.id,
      type: connection.type,
      createdAt: connection.createdAt,
      lastUsed: connection.lastUsed,
      handler: connection.handler.getInfo()
    };
  }

  /**
   * List all connections
   */
  listConnections() {
    const connections = [];

    for (const [id, connection] of this.connections) {
      connections.push({
        id,
        type: connection.type,
        createdAt: connection.createdAt,
        lastUsed: connection.lastUsed
      });
    }

    return connections;
  }

  /**
   * Close all connections
   */
  async closeAll() {
    const errors = [];

    for (const [id, connection] of this.connections) {
      try {
        await connection.handler.disconnect();
      } catch (error) {
        errors.push({
          id,
          error: error.message
        });
      }
    }

    this.connections.clear();

    return {
      success: errors.length === 0,
      errors
    };
  }

  /**
   * Clean up idle connections
   */
  async cleanupIdleConnections(maxIdleTime = 3600000) {
    // Default: 1 hour
    const now = Date.now();
    const toRemove = [];

    for (const [id, connection] of this.connections) {
      const idleTime = now - connection.lastUsed.getTime();

      if (idleTime > maxIdleTime) {
        toRemove.push(id);
      }
    }

    const results = {
      removed: [],
      errors: []
    };

    for (const id of toRemove) {
      try {
        await this.removeConnection(id);
        results.removed.push(id);
      } catch (error) {
        results.errors.push({
          id,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get statistics
   */
  getStats() {
    const stats = {
      totalConnections: this.connections.size,
      byType: {},
      oldestConnection: null,
      newestConnection: null,
      mostRecentlyUsed: null,
      leastRecentlyUsed: null
    };

    let oldestDate = Infinity;
    let newestDate = 0;
    let mostRecentUse = 0;
    let leastRecentUse = Infinity;

    for (const [id, connection] of this.connections) {
      // Count by type
      if (!stats.byType[connection.type]) {
        stats.byType[connection.type] = 0;
      }
      stats.byType[connection.type]++;

      // Track oldest/newest
      const createdTime = connection.createdAt.getTime();
      if (createdTime < oldestDate) {
        oldestDate = createdTime;
        stats.oldestConnection = {
          id,
          createdAt: connection.createdAt
        };
      }
      if (createdTime > newestDate) {
        newestDate = createdTime;
        stats.newestConnection = {
          id,
          createdAt: connection.createdAt
        };
      }

      // Track most/least recently used
      const lastUsedTime = connection.lastUsed.getTime();
      if (lastUsedTime > mostRecentUse) {
        mostRecentUse = lastUsedTime;
        stats.mostRecentlyUsed = {
          id,
          lastUsed: connection.lastUsed
        };
      }
      if (lastUsedTime < leastRecentUse) {
        leastRecentUse = lastUsedTime;
        stats.leastRecentlyUsed = {
          id,
          lastUsed: connection.lastUsed
        };
      }
    }

    return stats;
  }

  /**
   * Create connection from data source config
   */
  async createFromDataSource(dataSource) {
    const { id, name, type, config } = dataSource;

    const connectionId = id || `ds_${name.replace(/\s+/g, '_').toLowerCase()}`;

    return this.createConnection(connectionId, type, config);
  }

  /**
   * Execute batch operations across multiple connections
   */
  async batch(operations) {
    const results = [];

    for (const op of operations) {
      try {
        const result = await this.query(op.connectionId, op.query);
        results.push({
          success: true,
          connectionId: op.connectionId,
          data: result
        });
      } catch (error) {
        results.push({
          success: false,
          connectionId: op.connectionId,
          error: error.message
        });
      }
    }

    return {
      results,
      successCount: results.filter(r => r.success).length,
      errorCount: results.filter(r => !r.success).length
    };
  }

  /**
   * Validate connection config before creating
   */
  validateConfig(type, config) {
    const HandlerClass = this.handlers[type.toLowerCase()];

    if (!HandlerClass) {
      throw new Error(`Unknown connection type: ${type}`);
    }

    try {
      // Create temporary instance to validate
      const tempHandler = new HandlerClass(config);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }
}

// Export singleton instance
module.exports = new ConnectionManager();
