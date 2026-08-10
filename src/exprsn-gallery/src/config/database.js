/**
 * ═══════════════════════════════════════════════════════════════════════
 * Database Connection and Pool Management
 * ═══════════════════════════════════════════════════════════════════════
 */

const { Pool } = require('pg');
const config = require('./index');
const logger = require('../utils/logger');

let pool = null;

/**
 * Get database pool (singleton)
 */
function getPool() {
  if (!pool) {
    pool = new Pool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.user,
      password: config.database.password,
      max: config.database.pool.max,
      min: config.database.pool.min,
      connectionTimeoutMillis: config.database.pool.acquire,
      idleTimeoutMillis: config.database.pool.idle
    });

    // Handle pool errors
    pool.on('error', (err, client) => {
      logger.error('Unexpected database error:', err);
    });

    // Handle pool connection
    pool.on('connect', (client) => {
      logger.debug('Database client connected');
    });

    logger.info('Database pool created', {
      host: config.database.host,
      database: config.database.database
    });
  }

  return pool;
}

/**
 * Execute a query
 */
async function query(text, params = []) {
  const start = Date.now();
  const client = getPool();

  try {
    const result = await client.query(text, params);
    const duration = Date.now() - start;

    logger.debug('Query executed', {
      duration,
      rows: result.rowCount
    });

    return result;
  } catch (error) {
    logger.error('Query error:', {
      error: error.message,
      query: text
    });
    throw error;
  }
}

/**
 * Get a client from the pool (for transactions)
 */
async function getClient() {
  const client = await getPool().connect();
  return client;
}

/**
 * Close the pool
 */
async function close() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database pool closed');
  }
}

/**
 * Test database connection
 */
async function testConnection() {
  try {
    const result = await query('SELECT NOW()');
    logger.info('Database connection successful', {
      serverTime: result.rows[0].now
    });
    return true;
  } catch (error) {
    logger.error('Database connection failed:', error);
    return false;
  }
}

module.exports = {
  getPool,
  query,
  getClient,
  close,
  testConnection
};
