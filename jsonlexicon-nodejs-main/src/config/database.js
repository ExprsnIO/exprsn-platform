/**
 * Database Configuration and Connection Pool
 */

const { Pool } = require('pg');
const config = require('./index');
const logger = require('../utils/logger');

class Database {
  constructor() {
    this.pool = null;
  }

  /**
   * Initialize database connection pool
   */
  async initialize() {
    try {
      this.pool = new Pool({
        host: config.database.host,
        port: config.database.port,
        database: config.database.name,
        user: config.database.user,
        password: config.database.password,
        min: config.database.pool.min,
        max: config.database.pool.max,
        idleTimeoutMillis: config.database.pool.idleTimeout,
        connectionTimeoutMillis: config.database.pool.connectionTimeout,
      });

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      logger.info('Database connection pool initialized', {
        host: config.database.host,
        port: config.database.port,
        database: config.database.name,
        poolSize: config.database.pool.max,
      });

      // Set up pool event handlers
      this.pool.on('error', (err) => {
        logger.error('Unexpected database pool error', {
          error: err.message,
          stack: err.stack,
        });
      });

      this.pool.on('connect', () => {
        logger.debug('New database client connected');
      });

      this.pool.on('remove', () => {
        logger.debug('Database client removed from pool');
      });

      return this.pool;
    } catch (error) {
      logger.error('Failed to initialize database connection', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Execute a query
   */
  async query(text, params) {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;

      logger.debug('Database query executed', {
        query: text,
        duration,
        rows: result.rowCount,
      });

      return result;
    } catch (error) {
      logger.error('Database query failed', {
        query: text,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get a client from the pool
   */
  async getClient() {
    return this.pool.connect();
  }

  /**
   * Execute a transaction
   */
  async transaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Close all database connections
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      logger.info('Database connection pool closed');
    }
  }

  /**
   * Get pool statistics
   */
  getStats() {
    if (!this.pool) {
      return null;
    }

    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }
}

// Create singleton instance
const database = new Database();

module.exports = database;
