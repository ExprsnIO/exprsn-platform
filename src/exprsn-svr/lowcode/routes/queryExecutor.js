/**
 * ═══════════════════════════════════════════════════════════
 * Query Executor - Backend Query Execution Engine
 * Handles execution for all datasource types
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { Sequelize, QueryTypes } = require('sequelize');
const axios = require('axios');
const Redis = require('redis');
const xml2js = require('xml2js');
const vm = require('vm2');
const { validateCAToken } = require('@exprsn/shared');

// Database connection
const sequelize = require('../config/database');

// Redis connection (optional)
let redisClient = null;
if (process.env.REDIS_ENABLED === 'true') {
  redisClient = Redis.createClient({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  });
}

// ═══════════════════════════════════════════════════════════
// Query Execution Endpoint
// ═══════════════════════════════════════════════════════════

router.post('/execute', async (req, res) => {
  try {
    const { query, options = {}, context = {} } = req.body;

    if (!query || !query.datasource) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_QUERY',
        message: 'Query object with datasource is required'
      });
    }

    console.log('[QueryExecutor] Executing query:', query.name, 'Type:', query.datasource.type);

    const startTime = Date.now();

    // Check cache first
    if (query.enableCache && !options.preview) {
      const cached = await getCachedResult(query);
      if (cached) {
        console.log('[QueryExecutor] Returning cached result');
        return res.json({
          success: true,
          data: {
            rows: cached.rows,
            rowCount: cached.rowCount,
            executionTime: Date.now() - startTime,
            cached: true
          }
        });
      }
    }

    // Execute query based on datasource type
    let result;
    switch (query.datasource.type) {
      case 'entity':
        result = await executeEntityQuery(query, context);
        break;
      case 'forge':
        result = await executeForgeQuery(query, context);
        break;
      case 'database':
        result = await executeDatabaseQuery(query, context);
        break;
      case 'rest':
        result = await executeRESTQuery(query, context);
        break;
      case 'json':
        result = await executeJSONQuery(query, context);
        break;
      case 'xml':
        result = await executeXMLQuery(query, context);
        break;
      case 'jsonlex':
        result = await executeJSONLexQuery(query, context);
        break;
      case 'redis':
        result = await executeRedisQuery(query, context);
        break;
      case 'variable':
        result = await executeVariableQuery(query, context);
        break;
      case 'custom':
        result = await executeCustomQuery(query, context);
        break;
      default:
        throw new Error(`Unsupported datasource type: ${query.datasource.type}`);
    }

    // Apply filters, aggregations, sorting, limiting
    result = await applyQueryTransformations(result, query);

    const executionTime = Date.now() - startTime;

    // Cache result if enabled
    if (query.enableCache && !options.preview) {
      await cacheResult(query, result, query.cacheDuration || 300);
    }

    console.log('[QueryExecutor] Query executed successfully:', result.length, 'rows in', executionTime, 'ms');

    res.json({
      success: true,
      data: {
        rows: result,
        rowCount: result.length,
        executionTime: executionTime,
        cached: false
      }
    });

  } catch (error) {
    console.error('[QueryExecutor] Query execution error:', error);
    res.status(500).json({
      success: false,
      error: 'EXECUTION_ERROR',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
// Datasource Executors
// ═══════════════════════════════════════════════════════════

async function executeEntityQuery(query, context) {
  const config = query.datasource.config;

  if (!config.entityId && !config.entityName) {
    throw new Error('Entity ID or name required');
  }

  // Build SQL query
  const sql = buildSQLFromQuery(query);

  console.log('[QueryExecutor] Executing entity SQL:', sql);

  const results = await sequelize.query(sql, {
    type: QueryTypes.SELECT,
    timeout: (query.timeout || 30) * 1000
  });

  return results;
}

async function executeForgeQuery(query, context) {
  const config = query.datasource.config;

  if (!config.module) {
    throw new Error('Forge module required');
  }

  // Map module to table name
  const tableMap = {
    contacts: 'forge_contacts',
    accounts: 'forge_accounts',
    leads: 'forge_leads',
    opportunities: 'forge_opportunities',
    cases: 'forge_cases',
    tasks: 'forge_tasks'
  };

  const tableName = tableMap[config.module];
  if (!tableName) {
    throw new Error(`Unknown Forge module: ${config.module}`);
  }

  // Build SQL query
  query.datasource.config.entityName = tableName;
  const sql = buildSQLFromQuery(query);

  console.log('[QueryExecutor] Executing Forge SQL:', sql);

  const results = await sequelize.query(sql, {
    type: QueryTypes.SELECT,
    timeout: (query.timeout || 30) * 1000
  });

  return results;
}

async function executeDatabaseQuery(query, context) {
  const config = query.datasource.config;

  if (!config.table) {
    throw new Error('Table name required');
  }

  // Build SQL query
  query.datasource.config.entityName = config.table;
  const sql = buildSQLFromQuery(query);

  console.log('[QueryExecutor] Executing database SQL:', sql);

  const results = await sequelize.query(sql, {
    type: QueryTypes.SELECT,
    timeout: (query.timeout || 30) * 1000
  });

  return results;
}

async function executeRESTQuery(query, context) {
  const config = query.datasource.config;

  if (!config.url) {
    throw new Error('API URL required');
  }

  console.log('[QueryExecutor] Fetching from REST API:', config.url);

  const response = await axios({
    method: config.method || 'GET',
    url: config.url,
    headers: config.headers || {},
    timeout: (query.timeout || 30) * 1000,
    data: config.method === 'POST' ? config.body : undefined
  });

  let data = response.data;

  // Extract data from response path
  if (config.dataPath) {
    const path = config.dataPath.split('.');
    for (const key of path) {
      data = data[key];
      if (!data) break;
    }
  }

  if (!Array.isArray(data)) {
    throw new Error('API response is not an array');
  }

  return data;
}

async function executeJSONQuery(query, context) {
  const config = query.datasource.config;
  let data;

  if (config.sourceType === 'url') {
    if (!config.url) {
      throw new Error('JSON URL required');
    }

    console.log('[QueryExecutor] Fetching JSON from URL:', config.url);

    const response = await axios.get(config.url, {
      timeout: (query.timeout || 30) * 1000
    });

    data = response.data;
  } else {
    // Inline JSON
    if (!config.data) {
      throw new Error('JSON data required');
    }

    data = JSON.parse(config.data);
  }

  if (!Array.isArray(data)) {
    throw new Error('JSON data is not an array');
  }

  return data;
}

async function executeXMLQuery(query, context) {
  const config = query.datasource.config;
  let xmlData;

  if (config.sourceType === 'url') {
    if (!config.url) {
      throw new Error('XML URL required');
    }

    console.log('[QueryExecutor] Fetching XML from URL:', config.url);

    const response = await axios.get(config.url, {
      timeout: (query.timeout || 30) * 1000
    });

    xmlData = response.data;
  } else {
    // Inline XML
    if (!config.data) {
      throw new Error('XML data required');
    }

    xmlData = config.data;
  }

  // Parse XML to JSON
  const parser = new xml2js.Parser({ explicitArray: false });
  const result = await parser.parseStringPromise(xmlData);

  // Extract items using XPath-like path
  let data = result;
  if (config.xpath) {
    const path = config.xpath.split('/').filter(p => p);
    for (const key of path) {
      data = data[key];
      if (!data) break;
    }
  }

  if (!Array.isArray(data)) {
    data = [data]; // Wrap single item in array
  }

  return data;
}

async function executeJSONLexQuery(query, context) {
  const config = query.datasource.config;

  if (!config.expression) {
    throw new Error('JSONLex expression required');
  }

  // Get input data
  let inputData;
  if (config.inputSource) {
    const [type, name] = config.inputSource.split(':');
    if (type === 'variable') {
      inputData = context.variables?.[name];
    }
  }

  if (!inputData) {
    throw new Error('Input data required for JSONLex');
  }

  // Execute JSONLex expression in sandboxed environment
  const VM = new vm.VM({
    timeout: (query.timeout || 30) * 1000,
    sandbox: {
      data: inputData,
      context: context,
      console: console // For debugging
    }
  });

  const result = VM.run(config.expression);

  if (!Array.isArray(result)) {
    throw new Error('JSONLex expression must return an array');
  }

  return result;
}

async function executeRedisQuery(query, context) {
  if (!redisClient) {
    throw new Error('Redis is not enabled');
  }

  const config = query.datasource.config;

  if (!config.key) {
    throw new Error('Redis key pattern required');
  }

  console.log('[QueryExecutor] Querying Redis with pattern:', config.key);

  // Get keys matching pattern
  const keys = await new Promise((resolve, reject) => {
    redisClient.keys(config.key, (err, keys) => {
      if (err) reject(err);
      else resolve(keys);
    });
  });

  if (keys.length === 0) {
    return [];
  }

  // Fetch data based on type
  const results = [];
  for (const key of keys) {
    let value;

    switch (config.dataType) {
      case 'string':
        value = await new Promise((resolve, reject) => {
          redisClient.get(key, (err, val) => {
            if (err) reject(err);
            else resolve(val);
          });
        });
        try {
          value = JSON.parse(value);
        } catch (e) {
          // Not JSON, keep as string
        }
        break;

      case 'hash':
        value = await new Promise((resolve, reject) => {
          redisClient.hgetall(key, (err, val) => {
            if (err) reject(err);
            else resolve(val);
          });
        });
        break;

      case 'list':
        value = await new Promise((resolve, reject) => {
          redisClient.lrange(key, 0, -1, (err, val) => {
            if (err) reject(err);
            else resolve(val);
          });
        });
        break;

      case 'set':
        value = await new Promise((resolve, reject) => {
          redisClient.smembers(key, (err, val) => {
            if (err) reject(err);
            else resolve(val);
          });
        });
        break;

      case 'zset':
        value = await new Promise((resolve, reject) => {
          redisClient.zrange(key, 0, -1, 'WITHSCORES', (err, val) => {
            if (err) reject(err);
            else resolve(val);
          });
        });
        break;
    }

    results.push({
      key: key,
      value: value
    });
  }

  return results;
}

async function executeVariableQuery(query, context) {
  const config = query.datasource.config;

  if (!config.variableName) {
    throw new Error('Variable name required');
  }

  const data = context.variables?.[config.variableName];

  if (!data) {
    throw new Error(`Variable not found: ${config.variableName}`);
  }

  if (!Array.isArray(data)) {
    throw new Error('Variable data must be an array');
  }

  return data;
}

async function executeCustomQuery(query, context) {
  const config = query.datasource.config;

  if (!config.code) {
    throw new Error('Custom code required');
  }

  // Execute custom code in sandboxed environment
  const VM = new vm.VM({
    timeout: (query.timeout || 30) * 1000,
    sandbox: {
      context: context,
      console: console,
      require: require // Limited require access
    }
  });

  const wrappedCode = `
    (async function() {
      ${config.code}
      return await getData(context);
    })();
  `;

  const result = await VM.run(wrappedCode);

  if (!Array.isArray(result)) {
    throw new Error('Custom function must return an array');
  }

  return result;
}

// ═══════════════════════════════════════════════════════════
// Query Transformations
// ═══════════════════════════════════════════════════════════

async function applyQueryTransformations(data, query) {
  let result = data;

  // Apply filters (for non-SQL datasources)
  if (query.filters && query.filters.rules && query.filters.rules.length > 0 && !isSQLDatasource(query.datasource.type)) {
    result = applyFilters(result, query.filters);
  }

  // Apply field selection
  if (query.fields && query.fields.length > 0) {
    result = result.map(row => {
      const newRow = {};
      query.fields.forEach(field => {
        const value = row[field.name];
        const key = field.alias || field.name;

        // Apply transformations
        newRow[key] = applyTransform(value, field.transform);
      });
      return newRow;
    });
  }

  // Apply aggregations (for non-SQL datasources)
  if (query.groupBy && query.groupBy.length > 0 && !isSQLDatasource(query.datasource.type)) {
    result = applyAggregations(result, query);
  }

  // Apply sorting
  if (query.orderBy && query.orderBy.length > 0 && !isSQLDatasource(query.datasource.type)) {
    result = applySorting(result, query.orderBy);
  }

  // Apply limit and offset
  if (query.offset || query.limit) {
    const offset = query.offset || 0;
    const limit = query.limit || result.length;
    result = result.slice(offset, offset + limit);
  }

  return result;
}

function applyFilters(data, filterGroup) {
  return data.filter(row => {
    return evaluateFilterGroup(row, filterGroup);
  });
}

function evaluateFilterGroup(row, group) {
  const results = group.rules.map(rule => {
    if (rule.type === 'group') {
      return evaluateFilterGroup(row, rule);
    }
    return evaluateFilterRule(row, rule);
  });

  return group.condition === 'AND'
    ? results.every(r => r)
    : results.some(r => r);
}

function evaluateFilterRule(row, rule) {
  const fieldValue = row[rule.field];
  let compareValue = rule.valueType === 'static' ? rule.value : rule.valueSource;

  if (rule.valueType === 'field') {
    compareValue = row[compareValue];
  }

  switch (rule.operator) {
    case 'equals':
      return fieldValue == compareValue;
    case 'notEquals':
      return fieldValue != compareValue;
    case 'greaterThan':
      return fieldValue > compareValue;
    case 'greaterOrEqual':
      return fieldValue >= compareValue;
    case 'lessThan':
      return fieldValue < compareValue;
    case 'lessOrEqual':
      return fieldValue <= compareValue;
    case 'contains':
      return String(fieldValue).includes(compareValue);
    case 'notContains':
      return !String(fieldValue).includes(compareValue);
    case 'startsWith':
      return String(fieldValue).startsWith(compareValue);
    case 'endsWith':
      return String(fieldValue).endsWith(compareValue);
    case 'isNull':
      return fieldValue === null || fieldValue === undefined;
    case 'isNotNull':
      return fieldValue !== null && fieldValue !== undefined;
    case 'isTrue':
      return fieldValue === true;
    case 'isFalse':
      return fieldValue === false;
    default:
      return false;
  }
}

function applyTransform(value, transform) {
  if (!transform) return value;

  switch (transform) {
    case 'uppercase':
      return String(value).toUpperCase();
    case 'lowercase':
      return String(value).toLowerCase();
    case 'trim':
      return String(value).trim();
    case 'date_format':
      return new Date(value).toLocaleDateString();
    default:
      return value;
  }
}

function applyAggregations(data, query) {
  // Group data
  const groups = {};

  data.forEach(row => {
    const groupKey = query.groupBy.map(field => row[field]).join('|');

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }

    groups[groupKey].push(row);
  });

  // Apply aggregations
  const result = [];

  Object.entries(groups).forEach(([groupKey, rows]) => {
    const aggregatedRow = {};

    // Add group by fields
    query.groupBy.forEach((field, idx) => {
      aggregatedRow[field] = groupKey.split('|')[idx];
    });

    // Apply aggregation functions
    query.aggregations?.forEach(agg => {
      const values = rows.map(r => r[agg.field]);
      const alias = agg.alias || `${agg.function}_${agg.field}`;

      switch (agg.function) {
        case 'count':
          aggregatedRow[alias] = values.length;
          break;
        case 'sum':
          aggregatedRow[alias] = values.reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
          break;
        case 'avg':
          aggregatedRow[alias] = values.reduce((sum, val) => sum + (parseFloat(val) || 0), 0) / values.length;
          break;
        case 'min':
          aggregatedRow[alias] = Math.min(...values.map(v => parseFloat(v) || 0));
          break;
        case 'max':
          aggregatedRow[alias] = Math.max(...values.map(v => parseFloat(v) || 0));
          break;
        case 'countDistinct':
          aggregatedRow[alias] = new Set(values).size;
          break;
        case 'arrayAgg':
          aggregatedRow[alias] = values;
          break;
        case 'jsonAgg':
          aggregatedRow[alias] = rows;
          break;
      }
    });

    result.push(aggregatedRow);
  });

  return result;
}

function applySorting(data, orderBy) {
  return data.sort((a, b) => {
    for (const order of orderBy) {
      const aVal = a[order.field];
      const bVal = b[order.field];

      if (aVal < bVal) return order.direction === 'ASC' ? -1 : 1;
      if (aVal > bVal) return order.direction === 'ASC' ? 1 : -1;
    }
    return 0;
  });
}

function isSQLDatasource(type) {
  return ['entity', 'forge', 'database'].includes(type);
}

// ═══════════════════════════════════════════════════════════
// SQL Builder
// ═══════════════════════════════════════════════════════════

function buildSQLFromQuery(query) {
  let sql = '';

  // SELECT clause
  if (query.fields && query.fields.length > 0) {
    const fieldList = query.fields.map(f => {
      let fieldStr = f.aggregation
        ? `${getAggregationSQL(f.aggregation)}(${f.name})`
        : f.name;

      if (f.alias) {
        fieldStr += ` AS "${f.alias}"`;
      }

      return fieldStr;
    }).join(', ');

    sql += query.distinct ? 'SELECT DISTINCT ' : 'SELECT ';
    sql += fieldList;
  } else {
    sql += 'SELECT *';
  }

  // FROM clause
  const tableName = query.datasource.config.entityName || query.datasource.config.table;
  sql += `\nFROM "${tableName}"`;

  // WHERE clause
  if (query.filters && query.filters.rules && query.filters.rules.length > 0) {
    sql += '\nWHERE ' + buildFilterSQL(query.filters);
  }

  // GROUP BY clause
  if (query.groupBy && query.groupBy.length > 0) {
    sql += '\nGROUP BY ' + query.groupBy.map(f => `"${f}"`).join(', ');
  }

  // HAVING clause
  if (query.having && query.having.rules && query.having.rules.length > 0) {
    sql += '\nHAVING ' + buildFilterSQL(query.having);
  }

  // ORDER BY clause
  if (query.orderBy && query.orderBy.length > 0) {
    const orderList = query.orderBy.map(o => `"${o.field}" ${o.direction}`).join(', ');
    sql += '\nORDER BY ' + orderList;
  }

  // LIMIT clause
  if (query.limit) {
    sql += `\nLIMIT ${query.limit}`;
  }

  // OFFSET clause
  if (query.offset) {
    sql += `\nOFFSET ${query.offset}`;
  }

  return sql;
}

function buildFilterSQL(filterGroup) {
  const rules = filterGroup.rules.map(rule => {
    if (rule.type === 'group') {
      return '(' + buildFilterSQL(rule) + ')';
    }

    const field = `"${rule.field}"`;
    let value = rule.valueType === 'static' ? escapeSQL(rule.value) : `"${rule.valueSource}"`;

    switch (rule.operator) {
      case 'equals':
        return `${field} = ${value}`;
      case 'notEquals':
        return `${field} != ${value}`;
      case 'greaterThan':
        return `${field} > ${value}`;
      case 'greaterOrEqual':
        return `${field} >= ${value}`;
      case 'lessThan':
        return `${field} < ${value}`;
      case 'lessOrEqual':
        return `${field} <= ${value}`;
      case 'contains':
        return `${field} LIKE '%${value.replace(/'/g, '')}%'`;
      case 'startsWith':
        return `${field} LIKE '${value.replace(/'/g, '')}%'`;
      case 'endsWith':
        return `${field} LIKE '%${value.replace(/'/g, '')}'`;
      case 'isNull':
        return `${field} IS NULL`;
      case 'isNotNull':
        return `${field} IS NOT NULL`;
      case 'isTrue':
        return `${field} = true`;
      case 'isFalse':
        return `${field} = false`;
      default:
        return `${field} = ${value}`;
    }
  });

  return rules.join(` ${filterGroup.condition} `);
}

function escapeSQL(value) {
  if (typeof value === 'string') {
    return `'${value.replace(/'/g, "''")}'`;
  }
  return value;
}

function getAggregationSQL(func) {
  const map = {
    count: 'COUNT',
    sum: 'SUM',
    avg: 'AVG',
    min: 'MIN',
    max: 'MAX',
    countDistinct: 'COUNT(DISTINCT',
    arrayAgg: 'ARRAY_AGG',
    jsonAgg: 'JSON_AGG'
  };
  return map[func] || 'COUNT';
}

// ═══════════════════════════════════════════════════════════
// Caching
// ═══════════════════════════════════════════════════════════

async function getCachedResult(query) {
  if (!redisClient) return null;

  const cacheKey = `query_cache:${query.id}:${JSON.stringify(query.datasource.config)}`;

  return new Promise((resolve) => {
    redisClient.get(cacheKey, (err, data) => {
      if (err || !data) {
        resolve(null);
      } else {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      }
    });
  });
}

async function cacheResult(query, result, duration) {
  if (!redisClient) return;

  const cacheKey = `query_cache:${query.id}:${JSON.stringify(query.datasource.config)}`;
  const cacheData = {
    rows: result,
    rowCount: result.length,
    cachedAt: Date.now()
  };

  redisClient.setex(cacheKey, duration, JSON.stringify(cacheData));
}

module.exports = router;
