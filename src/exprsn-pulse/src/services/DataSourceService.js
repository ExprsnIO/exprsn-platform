/**
 * DataSource Service
 * Manages data source connections and metadata discovery
 */

const axios = require('axios');
const { DataSource } = require('../models');
const { generateServiceToken } = require('@exprsn/shared');
const logger = require('../utils/logger');

class DataSourceService {
  /**
   * Create a new data source
   */
  static async create(data, userId) {
    try {
      const dataSource = await DataSource.create({
        ...data,
        createdBy: userId
      });

      logger.info('Data source created', { dataSourceId: dataSource.id, type: data.type });
      return dataSource;
    } catch (error) {
      logger.error('Failed to create data source', { error: error.message });
      throw error;
    }
  }

  /**
   * Test connection to a data source
   */
  static async testConnection(dataSourceId) {
    const dataSource = await DataSource.findByPk(dataSourceId);
    if (!dataSource) {
      throw new Error('Data source not found');
    }

    try {
      let result;

      switch (dataSource.type) {
        case 'exprsn-service':
          result = await this._testExprsnService(dataSource);
          break;
        case 'postgresql':
          result = await this._testPostgreSQL(dataSource);
          break;
        case 'rest-api':
          result = await this._testRestAPI(dataSource);
          break;
        default:
          throw new Error(`Unsupported data source type: ${dataSource.type}`);
      }

      await dataSource.update({
        lastTestedAt: new Date(),
        testStatus: 'success'
      });

      return { success: true, ...result };
    } catch (error) {
      await dataSource.update({
        lastTestedAt: new Date(),
        testStatus: 'failed'
      });

      logger.error('Data source connection test failed', {
        dataSourceId,
        error: error.message
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Test Exprsn service connection
   */
  static async _testExprsnService(dataSource) {
    const { serviceName } = dataSource;
    const serviceUrl = dataSource.config.url || this._getServiceUrl(serviceName);

    // Generate service token for authentication
    const token = await generateServiceToken({
      serviceName: 'exprsn-pulse',
      resource: `${serviceUrl}/health`,
      permissions: { read: true }
    });

    const response = await axios.get(`${serviceUrl}/health`, {
      headers: { 'Authorization': `Bearer ${token}` },
      timeout: 5000
    });

    return {
      service: serviceName,
      status: response.data.status,
      version: response.data.version
    };
  }

  /**
   * Test PostgreSQL connection
   */
  static async _testPostgreSQL(dataSource) {
    const { sequelize } = require('../models');
    const Sequelize = require('sequelize');

    const testConnection = new Sequelize(
      dataSource.config.database,
      dataSource.config.username,
      dataSource.config.password,
      {
        host: dataSource.config.host,
        port: dataSource.config.port || 5432,
        dialect: 'postgres',
        logging: false
      }
    );

    await testConnection.authenticate();
    await testConnection.close();

    return { database: dataSource.config.database };
  }

  /**
   * Test REST API connection
   */
  static async _testRestAPI(dataSource) {
    const { baseUrl, headers = {} } = dataSource.config;

    const response = await axios.get(baseUrl, {
      headers,
      timeout: 5000
    });

    return {
      url: baseUrl,
      statusCode: response.status
    };
  }

  /**
   * Get default URL for Exprsn service
   */
  static _getServiceUrl(serviceName) {
    const servicePortMap = {
      'ca': 3000,
      'auth': 3001,
      'spark': 3002,
      'timeline': 3004,
      'prefetch': 3005,
      'moderator': 3006,
      'filevault': 3007,
      'gallery': 3008,
      'live': 3009,
      'bridge': 3010,
      'nexus': 3011,
      'pulse': 3012,
      'vault': 3013,
      'herald': 3014,
      'setup': 3015,
      'forge': 3016,
      'workflow': 3017,
      'svr': 5000
    };

    const port = servicePortMap[serviceName];
    if (!port) {
      throw new Error(`Unknown Exprsn service: ${serviceName}`);
    }

    return `http://localhost:${port}`;
  }

  /**
   * Discover metadata for a data source (tables, columns, endpoints, etc.)
   */
  static async discoverMetadata(dataSourceId) {
    const dataSource = await DataSource.findByPk(dataSourceId);
    if (!dataSource) {
      throw new Error('Data source not found');
    }

    let metadata = {};

    try {
      switch (dataSource.type) {
        case 'exprsn-service':
          metadata = await this._discoverExprsnServiceMetadata(dataSource);
          break;
        case 'postgresql':
          metadata = await this._discoverPostgreSQLMetadata(dataSource);
          break;
        case 'rest-api':
          metadata = await this._discoverRestAPIMetadata(dataSource);
          break;
      }

      await dataSource.update({ metadata });
      return metadata;
    } catch (error) {
      logger.error('Failed to discover metadata', {
        dataSourceId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Discover Exprsn service metadata
   */
  static async _discoverExprsnServiceMetadata(dataSource) {
    const { serviceName } = dataSource;
    const serviceUrl = dataSource.config.url || this._getServiceUrl(serviceName);

    const token = await generateServiceToken({
      serviceName: 'exprsn-pulse',
      resource: `${serviceUrl}/*`,
      permissions: { read: true }
    });

    try {
      // Try to get service info
      const response = await axios.get(serviceUrl, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 5000
      });

      return {
        serviceName,
        endpoints: response.data.endpoints || {},
        description: response.data.description || '',
        version: response.data.version || ''
      };
    } catch (error) {
      return {
        serviceName,
        error: 'Unable to discover endpoints'
      };
    }
  }

  /**
   * Discover PostgreSQL metadata
   */
  static async _discoverPostgreSQLMetadata(dataSource) {
    const { sequelize } = require('../models');
    const Sequelize = require('sequelize');

    const connection = new Sequelize(
      dataSource.config.database,
      dataSource.config.username,
      dataSource.config.password,
      {
        host: dataSource.config.host,
        port: dataSource.config.port || 5432,
        dialect: 'postgres',
        logging: false
      }
    );

    // Get list of tables
    const [tables] = await connection.query(`
      SELECT table_name, table_schema
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_name
    `);

    // Get columns for each table
    const tablesWithColumns = [];
    for (const table of tables) {
      const [columns] = await connection.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = :schema AND table_name = :table
        ORDER BY ordinal_position
      `, {
        replacements: {
          schema: table.table_schema,
          table: table.table_name
        }
      });

      tablesWithColumns.push({
        schema: table.table_schema,
        name: table.table_name,
        columns: columns
      });
    }

    await connection.close();

    return {
      database: dataSource.config.database,
      tables: tablesWithColumns
    };
  }

  /**
   * Discover REST API metadata
   */
  static async _discoverRestAPIMetadata(dataSource) {
    // For REST APIs, we can't auto-discover much, so return basic info
    return {
      baseUrl: dataSource.config.baseUrl,
      authType: dataSource.config.authType || 'none',
      description: 'REST API endpoints must be configured manually'
    };
  }

  /**
   * List all data sources
   */
  static async list(filters = {}) {
    const where = {};

    if (filters.type) where.type = filters.type;
    if (filters.isActive !== undefined) where.isActive = filters.isActive;

    return await DataSource.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });
  }

  /**
   * Get data source by ID
   */
  static async getById(id) {
    return await DataSource.findByPk(id);
  }

  /**
   * Update data source
   */
  static async update(id, data, userId) {
    const dataSource = await DataSource.findByPk(id);
    if (!dataSource) {
      throw new Error('Data source not found');
    }

    await dataSource.update({
      ...data,
      updatedBy: userId
    });

    return dataSource;
  }

  /**
   * Delete data source
   */
  static async delete(id) {
    const dataSource = await DataSource.findByPk(id);
    if (!dataSource) {
      throw new Error('Data source not found');
    }

    await dataSource.destroy();
    logger.info('Data source deleted', { dataSourceId: id });
  }
}

module.exports = DataSourceService;
