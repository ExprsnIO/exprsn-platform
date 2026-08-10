/**
 * API Service
 *
 * Business logic for custom API endpoint management in the low-code platform.
 * Handles CRUD operations, endpoint execution, and metrics tracking.
 */

const { Op } = require('sequelize');
const { Api, Application } = require('../models');
const logger = require('../utils/logger');

class ApiService {
  /**
   * List APIs with pagination and filtering
   */
  async listAPIs(options = {}) {
    const {
      applicationId,
      method,
      enabled,
      category,
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

    if (method) {
      where.method = method;
    }

    if (enabled !== undefined) {
      where.enabled = enabled;
    }

    if (category) {
      where.category = category;
    }

    if (search) {
      where[Op.or] = [
        { path: { [Op.iLike]: `%${search}%` } },
        { displayName: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await Api.findAndCountAll({
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
      apis: rows.map(api => api.toSafeJSON()),
      limit,
      offset,
      hasMore: offset + limit < count
    };
  }

  /**
   * Get API by ID
   */
  async getApiById(apiId) {
    const api = await Api.findByPk(apiId, {
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'name', 'displayName', 'status']
        }
      ]
    });

    if (!api) {
      throw new Error('API endpoint not found');
    }

    return api;
  }

  /**
   * Create new API endpoint
   */
  async createApi(data, userId) {
    const {
      applicationId,
      path,
      displayName,
      method = 'GET',
      handlerType,
      handlerConfig
    } = data;

    // Verify application exists
    const application = await Application.findByPk(applicationId);
    if (!application) {
      throw new Error('Application not found');
    }

    // Check for duplicate API path+method within application
    const existing = await Api.findOne({
      where: {
        applicationId,
        path,
        method
      }
    });

    if (existing) {
      throw new Error(`API endpoint ${method} ${path} already exists in this application`);
    }

    // Validate handler config based on handler type
    this.validateHandlerConfig(handlerType, handlerConfig);

    // Create API endpoint
    const api = await Api.create({
      applicationId,
      path,
      displayName: displayName || path,
      description: data.description || '',
      method,
      category: data.category || 'custom',
      handlerType,
      handlerConfig,
      requestSchema: data.requestSchema || {},
      responseSchema: data.responseSchema || {},
      authentication: data.authentication || { required: true, permissions: [] },
      rateLimit: data.rateLimit || { enabled: true, maxRequests: 100, windowMs: 60000 },
      cors: data.cors || { enabled: true, allowedOrigins: ['*'], allowedMethods: ['GET', 'POST'] },
      cache: data.cache || { enabled: false, ttl: 300 },
      enabled: data.enabled !== undefined ? data.enabled : true,
      version: data.version || '1.0.0',
      tags: data.tags || [],
      createdBy: userId,
      updatedBy: userId
    });

    logger.info('API endpoint created', {
      id: api.id,
      path: api.path,
      method: api.method,
      applicationId
    });

    return api;
  }

  /**
   * Update API endpoint
   */
  async updateApi(apiId, data, userId) {
    const api = await Api.findByPk(apiId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!api) {
      throw new Error('API endpoint not found');
    }

    // If updating path or method, check for conflicts
    if ((data.path || data.method) && (data.path !== api.path || data.method !== api.method)) {
      const newPath = data.path || api.path;
      const newMethod = data.method || api.method;

      const existing = await Api.findOne({
        where: {
          applicationId: api.applicationId,
          path: newPath,
          method: newMethod,
          id: { [Op.ne]: apiId }
        }
      });

      if (existing) {
        throw new Error(`API endpoint ${newMethod} ${newPath} already exists in this application`);
      }
    }

    // Validate handler config if being updated
    if (data.handlerType || data.handlerConfig) {
      const handlerType = data.handlerType || api.handlerType;
      const handlerConfig = data.handlerConfig || api.handlerConfig;
      this.validateHandlerConfig(handlerType, handlerConfig);
    }

    // Update fields
    const updatedApi = await api.update({
      ...data,
      updatedBy: userId
    });

    logger.info('API endpoint updated', {
      id: api.id,
      path: updatedApi.path,
      method: updatedApi.method
    });

    return updatedApi;
  }

  /**
   * Delete API endpoint
   */
  async deleteApi(apiId, userId) {
    const api = await Api.findByPk(apiId);

    if (!api) {
      throw new Error('API endpoint not found');
    }

    await api.destroy();

    logger.info('API endpoint deleted', {
      id: apiId,
      path: api.path,
      method: api.method,
      deletedBy: userId
    });

    return { success: true, message: 'API endpoint deleted successfully' };
  }

  /**
   * Enable API endpoint
   */
  async enableApi(apiId, userId) {
    const api = await Api.findByPk(apiId);

    if (!api) {
      throw new Error('API endpoint not found');
    }

    await api.enable();
    api.updatedBy = userId;
    await api.save();

    logger.info('API endpoint enabled', {
      id: apiId,
      path: api.path,
      method: api.method
    });

    return api;
  }

  /**
   * Disable API endpoint
   */
  async disableApi(apiId, userId) {
    const api = await Api.findByPk(apiId);

    if (!api) {
      throw new Error('API endpoint not found');
    }

    await api.disable();
    api.updatedBy = userId;
    await api.save();

    logger.info('API endpoint disabled', {
      id: apiId,
      path: api.path,
      method: api.method
    });

    return api;
  }

  /**
   * Test API endpoint execution
   */
  async testApi(apiId, testData) {
    const api = await Api.findByPk(apiId);

    if (!api) {
      throw new Error('API endpoint not found');
    }

    const startTime = Date.now();

    try {
      // Use the actual execution engine
      const ApiExecutionEngine = require('../runtime/ApiExecutionEngine');

      // Build mock request object from test data
      const mockRequest = {
        method: testData.method || api.method,
        body: testData.body || {},
        query: testData.queryParams || {},
        params: {},
        headers: testData.headers || {}
      };

      // Execute with test context
      const context = {
        user: testData.user || null,
        isTest: true
      };

      const result = await ApiExecutionEngine.execute(api, mockRequest, context);

      logger.info('API endpoint test executed', {
        id: apiId,
        responseTime: result.responseTime,
        success: result.success
      });

      return {
        success: result.success,
        statusCode: result.success ? 200 : 500,
        responseTime: result.responseTime,
        response: result.data || result.error,
        executionId: result.executionId,
        headers: {
          'content-type': 'application/json'
        }
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      logger.error('API endpoint test failed', {
        id: apiId,
        error: error.message
      });

      return {
        success: false,
        statusCode: 500,
        responseTime,
        error: error.message
      };
    }
  }

  /**
   * Get API call logs
   */
  async getApiLogs(apiId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    // Mock implementation - would query actual logs in production
    return {
      total: 0,
      logs: [],
      limit,
      offset,
      hasMore: false
    };
  }

  /**
   * Get API performance metrics
   */
  async getApiMetrics(apiId, period = 'day') {
    const api = await Api.findByPk(apiId);

    if (!api) {
      throw new Error('API endpoint not found');
    }

    // Mock implementation - would query actual metrics in production
    return {
      period,
      totalCalls: api.callCount,
      successCalls: api.callCount - api.errorCount,
      errorCalls: api.errorCount,
      avgResponseTime: api.avgResponseTime,
      minResponseTime: 0,
      maxResponseTime: 0,
      p50ResponseTime: api.avgResponseTime,
      p95ResponseTime: api.avgResponseTime * 1.5,
      p99ResponseTime: api.avgResponseTime * 2,
      timeline: []
    };
  }

  /**
   * Get API usage statistics
   */
  async getApiStats(applicationId) {
    const where = applicationId ? { applicationId } : {};

    const totalAPIs = await Api.count({ where });
    const activeAPIs = await Api.count({ where: { ...where, enabled: true } });

    const apis = await Api.findAll({ where });

    const totalCalls = apis.reduce((sum, api) => sum + api.callCount, 0);
    const totalErrors = apis.reduce((sum, api) => sum + api.errorCount, 0);
    const avgResponseTime = apis.length > 0
      ? apis.reduce((sum, api) => sum + api.avgResponseTime, 0) / apis.length
      : 0;

    const errorRate = totalCalls > 0 ? (totalErrors / totalCalls) * 100 : 0;

    // Get top APIs by call count
    const topAPIs = apis
      .sort((a, b) => b.callCount - a.callCount)
      .slice(0, 10)
      .map(api => ({
        id: api.id,
        path: api.path,
        method: api.method,
        displayName: api.displayName,
        callCount: api.callCount,
        avgResponseTime: api.avgResponseTime
      }));

    return {
      totalAPIs,
      activeAPIs,
      totalCalls,
      errorRate,
      avgResponseTime,
      topAPIs
    };
  }

  /**
   * Validate handler configuration based on type
   */
  validateHandlerConfig(handlerType, handlerConfig) {
    if (!handlerConfig || typeof handlerConfig !== 'object') {
      throw new Error('Handler configuration is required');
    }

    switch (handlerType) {
      case 'jsonlex':
        if (!handlerConfig.expression) {
          throw new Error('JSONLex handler requires expression in config');
        }
        break;

      case 'external_api':
        if (!handlerConfig.url) {
          throw new Error('External API handler requires url in config');
        }
        break;

      case 'workflow':
        if (!handlerConfig.workflowId) {
          throw new Error('Workflow handler requires workflowId in config');
        }
        break;

      case 'custom_code':
        if (!handlerConfig.code) {
          throw new Error('Custom code handler requires code in config');
        }
        break;

      case 'entity_query':
        if (!handlerConfig.entityId) {
          throw new Error('Entity query handler requires entityId in config');
        }
        break;

      default:
        throw new Error(`Unknown handler type: ${handlerType}`);
    }
  }
}

module.exports = new ApiService();
