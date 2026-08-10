/**
 * Query Engine Service
 * Executes queries against various data sources and returns unified results
 */

const axios = require('axios');
const { Query, DataSource, Dataset } = require('../models');
const { generateServiceToken } = require('@exprsn/shared');
const logger = require('../utils/logger');
const Redis = require('redis');

class QueryEngine {
  constructor() {
    // Initialize Redis client for caching
    this.redis = null;
    if (process.env.REDIS_ENABLED === 'true') {
      this.redis = Redis.createClient({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379
      });
      this.redis.on('error', (err) => logger.error('Redis error', { error: err.message }));
      this.redis.connect().catch(err => logger.warn('Redis connection failed', { error: err.message }));
    }
  }

  /**
   * Execute a query and return results
   */
  async execute(queryId, parameters = {}, options = {}) {
    const query = await Query.findByPk(queryId, {
      include: [{ model: DataSource, as: 'dataSource' }]
    });

    if (!query) {
      throw new Error('Query not found');
    }

    // Check cache first
    if (query.cacheEnabled && !options.skipCache) {
      const cachedResult = await this._getFromCache(queryId, parameters);
      if (cachedResult) {
        logger.debug('Query result retrieved from cache', { queryId });
        return cachedResult;
      }
    }

    const startTime = Date.now();

    try {
      let result;

      switch (query.queryType) {
        case 'sql':
          result = await this._executeSQLQuery(query, parameters);
          break;
        case 'rest':
          result = await this._executeRestQuery(query, parameters);
          break;
        case 'jsonlex':
          result = await this._executeJSONLexQuery(query, parameters);
          break;
        case 'custom':
          result = await this._executeCustomQuery(query, parameters);
          break;
        default:
          throw new Error(`Unsupported query type: ${query.queryType}`);
      }

      const executionTime = Date.now() - startTime;

      // Update query statistics
      await this._updateQueryStats(query, executionTime);

      // Cache results
      if (query.cacheEnabled) {
        await this._saveToCache(queryId, parameters, result, query.cacheTTL);
      }

      logger.info('Query executed successfully', {
        queryId,
        type: query.queryType,
        executionTime,
        rowCount: result.data?.length || 0
      });

      return {
        ...result,
        executionTime,
        cached: false
      };
    } catch (error) {
      logger.error('Query execution failed', {
        queryId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Execute SQL query
   */
  async _executeSQLQuery(query, parameters) {
    const { sequelize } = require('../models');
    const Sequelize = require('sequelize');

    // Get data source connection details
    const ds = query.dataSource;
    let connection;

    if (ds.type === 'postgresql') {
      connection = new Sequelize(
        ds.config.database,
        ds.config.username,
        ds.config.password,
        {
          host: ds.config.host,
          port: ds.config.port || 5432,
          dialect: 'postgres',
          logging: false
        }
      );
    } else {
      throw new Error('SQL queries only supported for PostgreSQL data sources');
    }

    try {
      // Parse SQL query from definition
      let sql = query.queryDefinition.sql || query.queryDefinition;

      // Replace parameters in SQL
      sql = this._replaceParameters(sql, parameters, query.parameters);

      // Execute query
      const [results, metadata] = await connection.query(sql, {
        type: Sequelize.QueryTypes.SELECT
      });

      await connection.close();

      // Extract schema from first row
      const schema = this._extractSchema(results);

      return {
        data: results,
        schema,
        rowCount: results.length,
        columnCount: Object.keys(schema).length
      };
    } catch (error) {
      if (connection) await connection.close();
      throw error;
    }
  }

  /**
   * Execute REST API query
   */
  async _executeRestQuery(query, parameters) {
    const ds = query.dataSource;
    const queryDef = query.queryDefinition;

    // Build request configuration
    const config = {
      method: queryDef.method || 'GET',
      url: this._replaceParameters(queryDef.url, parameters, query.parameters),
      headers: queryDef.headers || {},
      timeout: queryDef.timeout || 30000
    };

    // Add authentication if configured
    if (ds.config.authType === 'bearer') {
      config.headers['Authorization'] = `Bearer ${ds.config.token}`;
    } else if (ds.config.authType === 'basic') {
      config.auth = {
        username: ds.config.username,
        password: ds.config.password
      };
    }

    // Add query parameters
    if (queryDef.params) {
      config.params = this._replaceParametersInObject(queryDef.params, parameters, query.parameters);
    }

    // Add body for POST/PUT requests
    if (queryDef.body && ['POST', 'PUT', 'PATCH'].includes(config.method)) {
      config.data = this._replaceParametersInObject(queryDef.body, parameters, query.parameters);
    }

    const response = await axios(config);

    // Extract data from response using path if specified
    let data = response.data;
    if (queryDef.dataPath) {
      data = this._getNestedValue(data, queryDef.dataPath);
    }

    // Ensure data is an array
    if (!Array.isArray(data)) {
      data = [data];
    }

    const schema = this._extractSchema(data);

    return {
      data,
      schema,
      rowCount: data.length,
      columnCount: Object.keys(schema).length
    };
  }

  /**
   * Execute JSONLex query
   */
  async _executeJSONLexQuery(query, parameters) {
    // JSONLex queries use expressions to transform data
    const queryDef = query.queryDefinition;

    // First, fetch source data (could be from REST API or another query)
    let sourceData;

    if (queryDef.sourceType === 'rest') {
      const tempQuery = {
        dataSource: query.dataSource,
        queryDefinition: queryDef.source,
        queryType: 'rest'
      };
      const result = await this._executeRestQuery(tempQuery, parameters);
      sourceData = result.data;
    } else if (queryDef.sourceType === 'query') {
      const sourceQuery = await Query.findByPk(queryDef.sourceQueryId);
      const result = await this.execute(sourceQuery.id, parameters);
      sourceData = result.data;
    }

    // Apply JSONLex expression
    const JSONLexService = require('./JSONLexService');
    const transformedData = JSONLexService.evaluate(queryDef.expression, sourceData, parameters);

    const schema = this._extractSchema(transformedData);

    return {
      data: transformedData,
      schema,
      rowCount: transformedData.length,
      columnCount: Object.keys(schema).length
    };
  }

  /**
   * Execute custom query (user-defined function)
   */
  async _executeCustomQuery(query, parameters) {
    // Custom queries allow users to write JavaScript functions
    // This is executed in a sandbox for security
    const { VM } = require('vm2');

    const vm = new VM({
      timeout: 10000,
      sandbox: {
        parameters,
        axios,
        console: {
          log: (...args) => logger.debug('Custom query log', { args }),
          error: (...args) => logger.error('Custom query error', { args })
        }
      }
    });

    try {
      const result = vm.run(query.queryDefinition.code);

      if (!result || !Array.isArray(result.data)) {
        throw new Error('Custom query must return an object with "data" array');
      }

      const schema = this._extractSchema(result.data);

      return {
        data: result.data,
        schema,
        rowCount: result.data.length,
        columnCount: Object.keys(schema).length
      };
    } catch (error) {
      throw new Error(`Custom query execution failed: ${error.message}`);
    }
  }

  /**
   * Replace parameters in SQL or URL string
   */
  _replaceParameters(template, values, paramDefs) {
    let result = template;

    // Replace named parameters :paramName
    if (paramDefs) {
      paramDefs.forEach(param => {
        const value = values[param.name] !== undefined ? values[param.name] : param.defaultValue;

        // Escape value based on type
        let escapedValue;
        if (param.type === 'string') {
          escapedValue = `'${value.toString().replace(/'/g, "''")}'`;
        } else if (param.type === 'number') {
          escapedValue = parseFloat(value);
        } else if (param.type === 'boolean') {
          escapedValue = value ? 'TRUE' : 'FALSE';
        } else {
          escapedValue = value;
        }

        result = result.replace(new RegExp(`:${param.name}`, 'g'), escapedValue);
      });
    }

    return result;
  }

  /**
   * Replace parameters in object (deep)
   */
  _replaceParametersInObject(obj, values, paramDefs) {
    const result = JSON.parse(JSON.stringify(obj));

    const replaceInValue = (value) => {
      if (typeof value === 'string' && value.startsWith(':')) {
        const paramName = value.substring(1);
        const param = paramDefs?.find(p => p.name === paramName);
        return values[paramName] !== undefined ? values[paramName] : param?.defaultValue;
      } else if (typeof value === 'object' && value !== null) {
        return this._replaceParametersInObject(value, values, paramDefs);
      }
      return value;
    };

    for (const key in result) {
      result[key] = replaceInValue(result[key]);
    }

    return result;
  }

  /**
   * Extract schema from data array
   */
  _extractSchema(data) {
    if (!data || data.length === 0) {
      return {};
    }

    const schema = {};
    const firstRow = data[0];

    for (const key in firstRow) {
      const value = firstRow[key];
      let type = typeof value;

      if (value === null || value === undefined) {
        type = 'unknown';
      } else if (Array.isArray(value)) {
        type = 'array';
      } else if (value instanceof Date) {
        type = 'date';
      } else if (type === 'object') {
        type = 'object';
      }

      schema[key] = {
        name: key,
        type,
        nullable: value === null || value === undefined
      };
    }

    return schema;
  }

  /**
   * Get nested value from object using dot notation
   */
  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Update query statistics
   */
  async _updateQueryStats(query, executionTime) {
    const newAvg = query.executionCount === 0
      ? executionTime
      : (query.avgExecutionTime * query.executionCount + executionTime) / (query.executionCount + 1);

    await query.update({
      lastExecutedAt: new Date(),
      executionCount: query.executionCount + 1,
      avgExecutionTime: newAvg
    });
  }

  /**
   * Get result from cache
   */
  async _getFromCache(queryId, parameters) {
    if (!this.redis) return null;

    try {
      const cacheKey = this._getCacheKey(queryId, parameters);
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        return { ...JSON.parse(cached), cached: true };
      }
    } catch (error) {
      logger.warn('Cache retrieval failed', { error: error.message });
    }

    return null;
  }

  /**
   * Save result to cache
   */
  async _saveToCache(queryId, parameters, result, ttl) {
    if (!this.redis) return;

    try {
      const cacheKey = this._getCacheKey(queryId, parameters);
      await this.redis.setEx(cacheKey, ttl, JSON.stringify(result));
    } catch (error) {
      logger.warn('Cache save failed', { error: error.message });
    }
  }

  /**
   * Generate cache key
   */
  _getCacheKey(queryId, parameters) {
    const paramString = JSON.stringify(parameters);
    return `query:${queryId}:${Buffer.from(paramString).toString('base64')}`;
  }

  /**
   * Clear cache for a query
   */
  async clearCache(queryId) {
    if (!this.redis) return;

    try {
      const pattern = `query:${queryId}:*`;
      const keys = await this.redis.keys(pattern);

      if (keys.length > 0) {
        await this.redis.del(keys);
      }

      logger.info('Query cache cleared', { queryId, keysDeleted: keys.length });
    } catch (error) {
      logger.error('Cache clear failed', { error: error.message });
    }
  }
}

module.exports = new QueryEngine();
