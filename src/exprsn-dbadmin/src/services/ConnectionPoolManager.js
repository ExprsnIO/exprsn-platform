const { Pool } = require('pg');
const { logger } = require('@exprsn/shared');
const { decrypt } = require('../utils/encryption');

/**
 * Manages PostgreSQL connection pools for multiple database connections
 * Implements connection pooling, health checks, and automatic cleanup
 */
class ConnectionPoolManager {
  constructor() {
    this.pools = new Map();
    this.healthCheckInterval = 60000; // 1 minute
    this.maxIdleTime = 300000; // 5 minutes
    this.healthCheckTimer = null;

    this.startHealthChecks();
  }

  /**
   * Get or create a connection pool for a database connection
   * @param {Object} connectionConfig - Connection configuration
   * @returns {Pool} PostgreSQL pool instance
   */
  getPool(connectionConfig) {
    const poolKey = this.generatePoolKey(connectionConfig);

    if (this.pools.has(poolKey)) {
      const poolInfo = this.pools.get(poolKey);
      poolInfo.lastUsed = Date.now();
      return poolInfo.pool;
    }

    const pool = this.createPool(connectionConfig);
    this.pools.set(poolKey, {
      pool,
      config: connectionConfig,
      created: Date.now(),
      lastUsed: Date.now()
    });

    logger.info('Created new connection pool', {
      poolKey,
      host: connectionConfig.host,
      database: connectionConfig.database
    });

    return pool;
  }

  /**
   * Create a new PostgreSQL connection pool
   * @param {Object} config - Connection configuration
   * @returns {Pool} PostgreSQL pool instance
   */
  createPool(config) {
    const poolConfig = {
      host: config.host,
      port: config.port || 5432,
      database: config.database,
      user: config.username,
      password: decrypt(config.password), // Decrypt stored password
      max: 10, // Maximum pool size
      min: 2,  // Minimum pool size
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      statement_timeout: parseInt(process.env.QUERY_TIMEOUT_MS) || 30000,
      query_timeout: parseInt(process.env.QUERY_TIMEOUT_MS) || 30000
    };

    if (config.sslEnabled) {
      poolConfig.ssl = {
        rejectUnauthorized: false
      };
    }

    const pool = new Pool(poolConfig);

    // Handle pool errors
    pool.on('error', (err) => {
      logger.error('Unexpected pool error', {
        error: err.message,
        stack: err.stack,
        poolKey: this.generatePoolKey(config)
      });
    });

    // Log new client connections
    pool.on('connect', () => {
      logger.debug('New client connected to pool', {
        poolKey: this.generatePoolKey(config)
      });
    });

    // Log client removals
    pool.on('remove', () => {
      logger.debug('Client removed from pool', {
        poolKey: this.generatePoolKey(config)
      });
    });

    return pool;
  }

  /**
   * Execute a query on a specific connection
   * @param {Object} connectionConfig - Connection configuration
   * @param {string} queryText - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object>} Query result
   */
  async executeQuery(connectionConfig, queryText, params = []) {
    const pool = this.getPool(connectionConfig);
    const startTime = Date.now();

    try {
      const result = await pool.query(queryText, params);
      const executionTime = Date.now() - startTime;

      logger.info('Query executed successfully', {
        executionTimeMs: executionTime,
        rowCount: result.rowCount,
        command: result.command
      });

      return {
        success: true,
        rows: result.rows,
        rowCount: result.rowCount,
        fields: result.fields,
        command: result.command,
        executionTimeMs: executionTime
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      logger.error('Query execution failed', {
        error: error.message,
        executionTimeMs: executionTime,
        query: queryText.substring(0, 200) // Log first 200 chars
      });

      throw error;
    }
  }

  /**
   * Execute multiple queries in a transaction
   * @param {Object} connectionConfig - Connection configuration
   * @param {Array<string>} queries - Array of SQL queries
   * @returns {Promise<Array>} Array of query results
   */
  async executeTransaction(connectionConfig, queries) {
    const pool = this.getPool(connectionConfig);
    const client = await pool.connect();
    const results = [];

    try {
      await client.query('BEGIN');

      for (const query of queries) {
        const result = await client.query(query);
        results.push({
          rows: result.rows,
          rowCount: result.rowCount,
          command: result.command
        });
      }

      await client.query('COMMIT');
      logger.info('Transaction committed successfully', {
        queryCount: queries.length
      });

      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Transaction rolled back', {
        error: error.message,
        queryCount: queries.length
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Test a database connection
   * @param {Object} connectionConfig - Connection configuration
   * @returns {Promise<Object>} Connection test result
   */
  async testConnection(connectionConfig) {
    try {
      const pool = this.createPool(connectionConfig);
      const client = await pool.connect();

      // Get PostgreSQL version
      const versionResult = await client.query('SELECT version()');
      const version = versionResult.rows[0].version;

      // Get database size
      const sizeResult = await client.query(
        `SELECT pg_size_pretty(pg_database_size($1)) as size`,
        [connectionConfig.database]
      );
      const size = sizeResult.rows[0].size;

      client.release();
      await pool.end();

      return {
        success: true,
        version,
        size,
        message: 'Connection successful'
      };
    } catch (error) {
      logger.error('Connection test failed', {
        error: error.message,
        host: connectionConfig.host,
        database: connectionConfig.database
      });

      return {
        success: false,
        error: error.message,
        message: 'Connection failed'
      };
    }
  }

  /**
   * Close a specific connection pool
   * @param {Object} connectionConfig - Connection configuration
   */
  async closePool(connectionConfig) {
    const poolKey = this.generatePoolKey(connectionConfig);

    if (this.pools.has(poolKey)) {
      const poolInfo = this.pools.get(poolKey);
      await poolInfo.pool.end();
      this.pools.delete(poolKey);

      logger.info('Connection pool closed', { poolKey });
    }
  }

  /**
   * Close all connection pools
   */
  async closeAllPools() {
    const closePromises = [];

    for (const [poolKey, poolInfo] of this.pools.entries()) {
      closePromises.push(
        poolInfo.pool.end().then(() => {
          logger.info('Connection pool closed', { poolKey });
        })
      );
    }

    await Promise.all(closePromises);
    this.pools.clear();

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
  }

  /**
   * Get pool statistics
   * @returns {Array} Array of pool statistics
   */
  getPoolStats() {
    const stats = [];

    for (const [poolKey, poolInfo] of this.pools.entries()) {
      stats.push({
        poolKey,
        host: poolInfo.config.host,
        database: poolInfo.config.database,
        totalCount: poolInfo.pool.totalCount,
        idleCount: poolInfo.pool.idleCount,
        waitingCount: poolInfo.pool.waitingCount,
        created: poolInfo.created,
        lastUsed: poolInfo.lastUsed,
        idleTimeMs: Date.now() - poolInfo.lastUsed
      });
    }

    return stats;
  }

  /**
   * Generate a unique key for a connection pool
   * @param {Object} config - Connection configuration
   * @returns {string} Pool key
   */
  generatePoolKey(config) {
    return `${config.host}:${config.port}:${config.database}:${config.username}`;
  }

  /**
   * Start periodic health checks on all pools
   */
  startHealthChecks() {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks();
    }, this.healthCheckInterval);
  }

  /**
   * Perform health checks on all pools and close idle ones
   */
  async performHealthChecks() {
    const now = Date.now();
    const poolsToClose = [];

    for (const [poolKey, poolInfo] of this.pools.entries()) {
      const idleTime = now - poolInfo.lastUsed;

      if (idleTime > this.maxIdleTime) {
        poolsToClose.push(poolKey);
      }
    }

    // Close idle pools
    for (const poolKey of poolsToClose) {
      const poolInfo = this.pools.get(poolKey);
      await poolInfo.pool.end();
      this.pools.delete(poolKey);

      logger.info('Closed idle connection pool', {
        poolKey,
        idleTimeMs: now - poolInfo.lastUsed
      });
    }
  }
}

// Singleton instance
const connectionPoolManager = new ConnectionPoolManager();

// Cleanup on process exit
process.on('SIGTERM', async () => {
  await connectionPoolManager.closeAllPools();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await connectionPoolManager.closeAllPools();
  process.exit(0);
});

module.exports = connectionPoolManager;
