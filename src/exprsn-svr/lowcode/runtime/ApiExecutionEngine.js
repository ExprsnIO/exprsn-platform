/**
 * API Execution Engine
 *
 * Handles runtime execution of custom API endpoints created in the Low-Code Platform.
 * Supports multiple handler types: JSONLex, External API, Workflow, Custom Code, Entity Query.
 */

const axios = require('axios');
const { VM } = require('vm2');
const FormulaEngine = require('../engine/FormulaEngine');
const { Entity } = require('../models');
const logger = require('../utils/logger');

class ApiExecutionEngine {
  /**
   * Execute an API endpoint based on its configuration
   *
   * @param {Object} api - API endpoint configuration
   * @param {Object} request - Express request object (or mock request)
   * @param {Object} context - Execution context (user, permissions, etc.)
   * @returns {Promise<Object>} - Execution result
   */
  async execute(api, request, context = {}) {
    const startTime = Date.now();
    const executionId = this.generateExecutionId();

    logger.info('API execution started', {
      executionId,
      apiId: api.id,
      path: api.path,
      method: api.method,
      handlerType: api.handlerType
    });

    try {
      // Validate API is enabled
      if (!api.enabled) {
        throw new Error('API endpoint is disabled');
      }

      // Validate request against schema if defined
      if (api.requestSchema && Object.keys(api.requestSchema).length > 0) {
        this.validateRequest(request, api.requestSchema);
      }

      // Execute based on handler type
      let result;
      switch (api.handlerType) {
        case 'jsonlex':
          result = await this.executeJSONLex(api, request, context);
          break;

        case 'external_api':
          result = await this.executeExternalAPI(api, request, context);
          break;

        case 'workflow':
          result = await this.executeWorkflow(api, request, context);
          break;

        case 'custom_code':
          result = await this.executeCustomCode(api, request, context);
          break;

        case 'entity_query':
          result = await this.executeEntityQuery(api, request, context);
          break;

        default:
          throw new Error(`Unknown handler type: ${api.handlerType}`);
      }

      // Validate response against schema if defined
      if (api.responseSchema && Object.keys(api.responseSchema).length > 0) {
        this.validateResponse(result, api.responseSchema);
      }

      const responseTime = Date.now() - startTime;

      logger.info('API execution completed', {
        executionId,
        apiId: api.id,
        responseTime,
        success: true
      });

      return {
        success: true,
        data: result,
        executionId,
        responseTime,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;

      logger.error('API execution failed', {
        executionId,
        apiId: api.id,
        error: error.message,
        stack: error.stack,
        responseTime
      });

      return {
        success: false,
        error: {
          message: error.message,
          type: error.constructor.name,
          code: error.code || 'EXECUTION_ERROR'
        },
        executionId,
        responseTime,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Execute JSONLex expression handler
   */
  async executeJSONLex(api, request, context) {
    const { expression } = api.handlerConfig;

    if (!expression) {
      throw new Error('JSONLex expression is required');
    }

    // Build execution context with request data
    const executionContext = {
      request: {
        body: request.body || {},
        query: request.query || {},
        params: request.params || {},
        headers: request.headers || {}
      },
      user: context.user || null,
      env: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      ...context
    };

    // Execute JSONLex expression
    const formulaEngine = new FormulaEngine();
    const result = await formulaEngine.evaluate(expression, executionContext);

    return result;
  }

  /**
   * Execute external API call handler
   */
  async executeExternalAPI(api, request, context) {
    const {
      url,
      method = 'GET',
      headers = {},
      transformRequest,
      transformResponse,
      timeout = 30000
    } = api.handlerConfig;

    if (!url) {
      throw new Error('External API URL is required');
    }

    // Transform request body if transformer is defined
    let requestBody = request.body;
    if (transformRequest) {
      const formulaEngine = new FormulaEngine();
      requestBody = await formulaEngine.evaluate(transformRequest, {
        body: request.body,
        query: request.query,
        params: request.params
      });
    }

    // Make external API call
    const response = await axios({
      method: method || request.method,
      url,
      data: requestBody,
      params: request.query,
      headers: {
        ...headers,
        'User-Agent': 'Exprsn-LowCode/1.0'
      },
      timeout
    });

    // Transform response if transformer is defined
    let result = response.data;
    if (transformResponse) {
      const formulaEngine = new FormulaEngine();
      result = await formulaEngine.evaluate(transformResponse, {
        response: response.data,
        status: response.status,
        headers: response.headers
      });
    }

    return result;
  }

  /**
   * Execute workflow handler
   */
  async executeWorkflow(api, request, context) {
    const { workflowId, inputMapping = {}, outputMapping = {} } = api.handlerConfig;

    if (!workflowId) {
      throw new Error('Workflow ID is required');
    }

    // Map request data to workflow inputs
    let workflowInput = {
      ...request.body,
      ...request.query
    };

    if (Object.keys(inputMapping).length > 0) {
      const formulaEngine = new FormulaEngine();
      workflowInput = await formulaEngine.evaluate(inputMapping, {
        request: {
          body: request.body,
          query: request.query,
          params: request.params
        }
      });
    }

    // Execute workflow (integration with exprsn-workflow service)
    const ProcessService = require('../services/ProcessService');
    const workflowResult = await ProcessService.executeProcess(workflowId, workflowInput, context.user?.id);

    // Map workflow output to API response
    let result = workflowResult;
    if (Object.keys(outputMapping).length > 0) {
      const formulaEngine = new FormulaEngine();
      result = await formulaEngine.evaluate(outputMapping, {
        workflowResult
      });
    }

    return result;
  }

  /**
   * Execute custom JavaScript code handler
   */
  async executeCustomCode(api, request, context) {
    const { code, allowedModules = [] } = api.handlerConfig;

    if (!code) {
      throw new Error('Custom code is required');
    }

    // Create sandboxed VM
    const vm = new VM({
      timeout: 10000, // 10 second timeout
      sandbox: {
        request: {
          body: request.body || {},
          query: request.query || {},
          params: request.params || {},
          headers: request.headers || {}
        },
        context,
        console: {
          log: (...args) => logger.info('Custom code log', { args }),
          error: (...args) => logger.error('Custom code error', { args }),
          warn: (...args) => logger.warn('Custom code warning', { args })
        },
        // Add safe utilities
        JSON: JSON,
        Date: Date,
        Math: Math,
        String: String,
        Number: Number,
        Array: Array,
        Object: Object
      }
    });

    // Execute code
    const result = vm.run(`
      (async function() {
        ${code}
      })();
    `);

    return result;
  }

  /**
   * Execute entity query handler
   */
  async executeEntityQuery(api, request, context) {
    const {
      entityId,
      operation = 'list',
      filters = {},
      fields = [],
      limit = 25,
      offset = 0,
      sortBy,
      sortOrder = 'DESC'
    } = api.handlerConfig;

    if (!entityId) {
      throw new Error('Entity ID is required');
    }

    // Load entity definition
    const entity = await Entity.findByPk(entityId);
    if (!entity) {
      throw new Error('Entity not found');
    }

    // Use EntityService to query data
    const EntityService = require('../services/EntityService');

    switch (operation) {
      case 'list':
        return await EntityService.queryEntityData(entityId, {
          filters: { ...filters, ...request.query },
          limit: parseInt(request.query.limit) || limit,
          offset: parseInt(request.query.offset) || offset,
          sortBy: request.query.sortBy || sortBy,
          sortOrder: request.query.sortOrder || sortOrder
        });

      case 'get':
        const recordId = request.params.id || request.query.id;
        if (!recordId) {
          throw new Error('Record ID is required for get operation');
        }
        return await EntityService.getEntityRecord(entityId, recordId);

      case 'create':
        return await EntityService.createEntityRecord(entityId, request.body, context.user?.id);

      case 'update':
        const updateId = request.params.id || request.body.id;
        if (!updateId) {
          throw new Error('Record ID is required for update operation');
        }
        return await EntityService.updateEntityRecord(entityId, updateId, request.body, context.user?.id);

      case 'delete':
        const deleteId = request.params.id || request.query.id;
        if (!deleteId) {
          throw new Error('Record ID is required for delete operation');
        }
        return await EntityService.deleteEntityRecord(entityId, deleteId, context.user?.id);

      default:
        throw new Error(`Unknown entity operation: ${operation}`);
    }
  }

  /**
   * Validate request against JSON Schema
   */
  validateRequest(request, schema) {
    // Simple validation - in production use Ajv or similar
    // For now, just check required fields
    if (schema.required && Array.isArray(schema.required)) {
      for (const field of schema.required) {
        if (!request.body || request.body[field] === undefined) {
          throw new Error(`Required field missing: ${field}`);
        }
      }
    }
  }

  /**
   * Validate response against JSON Schema
   */
  validateResponse(response, schema) {
    // Simple validation - in production use Ajv or similar
    // For now, just ensure response is not null if required
    if (schema.required && response === null) {
      throw new Error('Response cannot be null');
    }
  }

  /**
   * Generate unique execution ID
   */
  generateExecutionId() {
    return `exec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

module.exports = new ApiExecutionEngine();
