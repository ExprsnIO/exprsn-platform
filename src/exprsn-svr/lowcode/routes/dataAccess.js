/**
 * ═══════════════════════════════════════════════════════════
 * Data Access API Routes
 * Endpoints for database, Redis, and external data sources
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../../middleware/errorHandler');
const { Pool } = require('pg');
const mysql = require('mysql2/promise');
const { MongoClient } = require('mongodb');
const redis = require('redis');
const axios = require('axios');
const { parseString } = require('xml2js');

// Redis client
let redisClient = null;

/**
 * Initialize Redis client
 */
async function getRedisClient() {
  if (!redisClient) {
    redisClient = redis.createClient({
      url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
    });

    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    await redisClient.connect();
  }
  return redisClient;
}

/**
 * POST /lowcode/api/data/query
 * Execute database query
 */
router.post('/query', asyncHandler(async (req, res) => {
  const { connection, database, query, params = [] } = req.body;

  if (!connection || !database || !query) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'connection, database, and query are required'
    });
  }

  try {
    let result;

    switch (connection.toLowerCase()) {
      case 'postgres':
      case 'postgresql':
        result = await executePostgresQuery(database, query, params);
        break;

      case 'mysql':
        result = await executeMySQLQuery(database, query, params);
        break;

      case 'mongodb':
        result = await executeMongoQuery(database, query, params);
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'INVALID_CONNECTION',
          message: `Unsupported database type: ${connection}`
        });
    }

    res.json({
      success: true,
      data: result.rows || result.data,
      rowCount: result.rowCount || result.data?.length || 0
    });

  } catch (error) {
    console.error('Database query error:', error);
    res.status(500).json({
      success: false,
      error: 'QUERY_ERROR',
      message: error.message
    });
  }
}));

/**
 * POST /lowcode/api/data/redis
 * Redis operations
 */
router.post('/redis', asyncHandler(async (req, res) => {
  const { operation, key, value, ttl } = req.body;

  if (!operation || !key) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'operation and key are required'
    });
  }

  try {
    const client = await getRedisClient();
    let result;

    switch (operation.toLowerCase()) {
      case 'get':
        result = await client.get(key);
        try {
          result = JSON.parse(result);
        } catch (e) {
          // Not JSON, return as-is
        }
        break;

      case 'set':
        if (ttl) {
          await client.setEx(key, parseInt(ttl), value);
        } else {
          await client.set(key, value);
        }
        result = { success: true };
        break;

      case 'del':
      case 'delete':
        await client.del(key);
        result = { success: true };
        break;

      case 'exists':
        result = await client.exists(key);
        break;

      case 'ttl':
        result = await client.ttl(key);
        break;

      case 'keys':
        result = await client.keys(key); // key is pattern
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'INVALID_OPERATION',
          message: `Unsupported operation: ${operation}`
        });
    }

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Redis operation error:', error);
    res.status(500).json({
      success: false,
      error: 'REDIS_ERROR',
      message: error.message
    });
  }
}));

/**
 * POST /lowcode/api/data/xml
 * Parse XML to JSON
 */
router.post('/xml', asyncHandler(async (req, res) => {
  const { xml, url } = req.body;

  if (!xml && !url) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'xml or url is required'
    });
  }

  try {
    let xmlContent = xml;

    if (url) {
      const response = await axios.get(url);
      xmlContent = response.data;
    }

    parseString(xmlContent, { explicitArray: false, ignoreAttrs: false }, (err, result) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: 'PARSE_ERROR',
          message: err.message
        });
      }

      res.json({
        success: true,
        data: result
      });
    });

  } catch (error) {
    console.error('XML parse error:', error);
    res.status(500).json({
      success: false,
      error: 'XML_ERROR',
      message: error.message
    });
  }
}));

/**
 * POST /lowcode/api/data/json
 * Fetch and parse JSON from URL
 */
router.post('/json', asyncHandler(async (req, res) => {
  const { url, method = 'GET', headers = {}, body } = req.body;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'url is required'
    });
  }

  try {
    const config = {
      method,
      url,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      config.data = body;
    }

    const response = await axios(config);

    res.json({
      success: true,
      data: response.data
    });

  } catch (error) {
    console.error('JSON fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_ERROR',
      message: error.message
    });
  }
}));

/**
 * GET /lowcode/api/data/connections
 * List available database connections
 */
router.get('/connections', asyncHandler(async (req, res) => {
  // This would typically come from a configuration file or environment
  const connections = [
    {
      id: 'default-postgres',
      name: 'Default PostgreSQL',
      type: 'postgresql',
      database: process.env.DB_NAME || 'exprsn_svr',
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432
    }
  ];

  res.json({
    success: true,
    connections
  });
}));

// ─────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────

/**
 * Execute PostgreSQL query
 */
async function executePostgresQuery(database, query, params) {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: database,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || ''
  });

  try {
    const result = await pool.query(query, params);
    return {
      rows: result.rows,
      rowCount: result.rowCount
    };
  } finally {
    await pool.end();
  }
}

/**
 * Execute MySQL query
 */
async function executeMySQLQuery(database, query, params) {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: process.env.MYSQL_PORT || 3306,
    database: database,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || ''
  });

  try {
    const [rows] = await connection.execute(query, params);
    return {
      rows: rows,
      rowCount: Array.isArray(rows) ? rows.length : 0
    };
  } finally {
    await connection.end();
  }
}

/**
 * Execute MongoDB query
 */
async function executeMongoQuery(database, query, params) {
  const client = new MongoClient(process.env.MONGODB_URL || 'mongodb://localhost:27017', {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  try {
    await client.connect();
    const db = client.db(database);

    // Parse query (expecting format: { collection: 'name', operation: 'find', filter: {} })
    const { collection, operation = 'find', filter = {}, options = {} } = typeof query === 'string' ? JSON.parse(query) : query;

    const coll = db.collection(collection);
    let data;

    switch (operation) {
      case 'find':
        data = await coll.find(filter, options).toArray();
        break;
      case 'findOne':
        data = [await coll.findOne(filter, options)];
        break;
      case 'aggregate':
        data = await coll.aggregate(filter).toArray();
        break;
      default:
        throw new Error(`Unsupported MongoDB operation: ${operation}`);
    }

    return {
      data: data,
      rowCount: data.length
    };
  } finally {
    await client.close();
  }
}

module.exports = router;
