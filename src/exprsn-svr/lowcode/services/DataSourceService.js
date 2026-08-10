/**
 * Data Source Service
 *
 * Business logic for data source management in the low-code platform.
 * Manages connections to PostgreSQL, Forge, REST, SOAP, and file-based sources.
 */

const { Op } = require('sequelize');
const { DataSource, Application } = require('../models');
const { ConnectionManager } = require('../connections');

class DataSourceService {
  /**
   * List data sources with pagination and filtering
   */
  async listDataSources(options = {}) {
    const {
      applicationId,
      type,
      status,
      limit = 25,
      offset = 0,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      search
    } = options;

    const where = {};

    if (applicationId) {
      where.applicationId = applicationId;
    }

    if (type) {
      where.type = type;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { displayName: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await DataSource.findAndCountAll({
      where,
      limit,
      offset,
      order: [[sortBy, sortOrder]],
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'name', 'displayName']
        }
      ]
    });

    return {
      total: count,
      dataSources: rows,
      limit,
      offset,
      hasMore: offset + limit < count
    };
  }

  /**
   * Get data source by ID
   */
  async getDataSourceById(dataSourceId) {
    const dataSource = await DataSource.findByPk(dataSourceId, {
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'name', 'displayName', 'status']
        }
      ]
    });

    if (!dataSource) {
      throw new Error('Data source not found');
    }

    return dataSource;
  }

  /**
   * Create new data source
   */
  async createDataSource(data, userId) {
    const { applicationId, name, displayName, type, config } = data;

    // Verify application exists and user has access
    const application = await Application.findByPk(applicationId);
    if (!application) {
      throw new Error('Application not found');
    }

    if (application.ownerId !== userId) {
      throw new Error('Unauthorized: You do not own this application');
    }

    // Check for duplicate data source name within application
    const existing = await DataSource.findOne({
      where: {
        applicationId,
        name
      }
    });

    if (existing) {
      throw new Error(`Data source with name "${name}" already exists in this application`);
    }

    // Validate connection config
    const validation = ConnectionManager.validateConfig(type, config);
    if (!validation.valid) {
      throw new Error(`Invalid connection configuration: ${validation.error}`);
    }

    // Create data source
    const dataSource = await DataSource.create({
      applicationId,
      name,
      displayName: displayName || name,
      description: data.description || '',
      type,
      config,
      status: 'inactive',
      cachePolicy: data.cachePolicy || 'none',
      cacheTTL: data.cacheTTL || 300000,
      refreshInterval: data.refreshInterval || null
    });

    return dataSource;
  }

  /**
   * Update data source
   */
  async updateDataSource(dataSourceId, data, userId) {
    const dataSource = await DataSource.findByPk(dataSourceId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!dataSource) {
      throw new Error('Data source not found');
    }

    if (dataSource.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // If config is being updated, validate it
    if (data.config) {
      const validation = ConnectionManager.validateConfig(
        data.type || dataSource.type,
        data.config
      );
      if (!validation.valid) {
        throw new Error(`Invalid connection configuration: ${validation.error}`);
      }

      // Disconnect existing connection if active
      if (dataSource.status === 'active') {
        await this.disconnect(dataSourceId, userId);
      }
    }

    // Update allowed fields
    const allowedFields = [
      'name',
      'displayName',
      'description',
      'type',
      'config',
      'cachePolicy',
      'cacheTTL',
      'refreshInterval'
    ];

    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        dataSource[field] = data[field];
      }
    });

    await dataSource.save();
    return dataSource;
  }

  /**
   * Delete data source (soft delete)
   */
  async deleteDataSource(dataSourceId, userId) {
    const dataSource = await DataSource.findByPk(dataSourceId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!dataSource) {
      throw new Error('Data source not found');
    }

    if (dataSource.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Disconnect if active
    if (dataSource.status === 'active') {
      await this.disconnect(dataSourceId, userId);
    }

    // Soft delete
    await dataSource.destroy();

    return { success: true, message: 'Data source deleted successfully' };
  }

  /**
   * Test data source connection
   */
  async testConnection(dataSourceId, userId) {
    const dataSource = await DataSource.findByPk(dataSourceId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!dataSource) {
      throw new Error('Data source not found');
    }

    if (dataSource.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    try {
      // Create temporary connection
      const connectionId = `test_${dataSourceId}_${Date.now()}`;
      await ConnectionManager.createConnection(
        connectionId,
        dataSource.type,
        dataSource.config
      );

      // Test the connection
      const result = await ConnectionManager.testConnection(connectionId);

      // Clean up temporary connection
      await ConnectionManager.removeConnection(connectionId);

      return {
        success: true,
        ...result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Connect to data source
   */
  async connect(dataSourceId, userId) {
    const dataSource = await DataSource.findByPk(dataSourceId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!dataSource) {
      throw new Error('Data source not found');
    }

    if (dataSource.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    if (dataSource.status === 'active') {
      return { success: true, message: 'Data source already connected' };
    }

    try {
      const connectionId = `ds_${dataSourceId}`;

      await ConnectionManager.createConnection(
        connectionId,
        dataSource.type,
        {
          ...dataSource.config,
          cacheEnabled: dataSource.cachePolicy !== 'none',
          cacheTTL: dataSource.cacheTTL
        }
      );

      dataSource.status = 'active';
      dataSource.lastConnectedAt = new Date();
      await dataSource.save();

      return {
        success: true,
        message: 'Data source connected successfully'
      };
    } catch (error) {
      dataSource.status = 'error';
      dataSource.lastError = error.message;
      await dataSource.save();

      throw new Error(`Connection failed: ${error.message}`);
    }
  }

  /**
   * Disconnect from data source
   */
  async disconnect(dataSourceId, userId) {
    const dataSource = await DataSource.findByPk(dataSourceId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!dataSource) {
      throw new Error('Data source not found');
    }

    if (dataSource.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    if (dataSource.status !== 'active') {
      return { success: true, message: 'Data source already disconnected' };
    }

    try {
      const connectionId = `ds_${dataSourceId}`;

      if (ConnectionManager.hasConnection(connectionId)) {
        await ConnectionManager.removeConnection(connectionId);
      }

      dataSource.status = 'inactive';
      await dataSource.save();

      return {
        success: true,
        message: 'Data source disconnected successfully'
      };
    } catch (error) {
      throw new Error(`Disconnect failed: ${error.message}`);
    }
  }

  /**
   * Execute query on data source
   */
  async executeQuery(dataSourceId, queryConfig, userId) {
    const dataSource = await DataSource.findByPk(dataSourceId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!dataSource) {
      throw new Error('Data source not found');
    }

    if (dataSource.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    if (dataSource.status !== 'active') {
      throw new Error('Data source is not connected');
    }

    try {
      const connectionId = `ds_${dataSourceId}`;
      const result = await ConnectionManager.query(connectionId, queryConfig);

      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Clear data source cache
   */
  async clearCache(dataSourceId, userId) {
    const dataSource = await DataSource.findByPk(dataSourceId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!dataSource) {
      throw new Error('Data source not found');
    }

    if (dataSource.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    if (dataSource.status !== 'active') {
      throw new Error('Data source is not connected');
    }

    const connectionId = `ds_${dataSourceId}`;
    const result = ConnectionManager.clearCache(connectionId);

    return result;
  }

  /**
   * Get data source statistics
   */
  async getDataSourceStats(dataSourceId, userId) {
    const dataSource = await DataSource.findByPk(dataSourceId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!dataSource) {
      throw new Error('Data source not found');
    }

    if (dataSource.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    const stats = {
      id: dataSource.id,
      name: dataSource.name,
      type: dataSource.type,
      status: dataSource.status,
      cachePolicy: dataSource.cachePolicy,
      cacheTTL: dataSource.cacheTTL,
      lastConnectedAt: dataSource.lastConnectedAt,
      lastError: dataSource.lastError,
      createdAt: dataSource.createdAt,
      updatedAt: dataSource.updatedAt
    };

    // Get connection info if active
    if (dataSource.status === 'active') {
      try {
        const connectionId = `ds_${dataSourceId}`;
        const connectionInfo = ConnectionManager.getConnectionInfo(connectionId);
        stats.connectionInfo = connectionInfo;
      } catch (error) {
        // Connection not found
      }
    }

    return stats;
  }
}

module.exports = new DataSourceService();
