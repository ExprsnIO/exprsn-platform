/**
 * API Routes
 *
 * RESTful API endpoint builder and management for the Low-Code Platform.
 * Allows users to create custom API endpoints that can execute JSONLex expressions,
 * call external APIs, run workflows, or execute custom code.
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { requireLowCodeAdmin } = require('../middleware/caTokenAuth');
const apiService = require('../services/ApiService');
const logger = require('../utils/logger');

// Mock user ID for development
const getCurrentUserId = (req) => req.user?.id || 'mock-user-id';

// Async handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const listAPIsSchema = Joi.object({
  applicationId: Joi.string().uuid().optional(),
  method: Joi.string().valid('GET', 'POST', 'PUT', 'PATCH', 'DELETE').optional(),
  enabled: Joi.boolean().optional(),
  category: Joi.string().max(100).optional(),
  limit: Joi.number().integer().min(1).max(100).default(25),
  offset: Joi.number().integer().min(0).default(0),
  sortBy: Joi.string().valid('created_at', 'updated_at', 'path', 'displayName', 'callCount').default('created_at'),
  sortOrder: Joi.string().valid('ASC', 'DESC').default('DESC'),
  search: Joi.string().max(255).optional()
});

const createAPISchema = Joi.object({
  applicationId: Joi.string().uuid().required(),
  path: Joi.string().min(1).max(255).required().regex(/^\/[a-zA-Z0-9\/_-]*$/),
  displayName: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(10000).allow('', null).optional(),
  method: Joi.string().valid('GET', 'POST', 'PUT', 'PATCH', 'DELETE').default('GET'),
  category: Joi.string().max(100).default('custom'),
  handlerType: Joi.string().valid('jsonlex', 'external_api', 'workflow', 'custom_code', 'entity_query').default('jsonlex'),
  handlerConfig: Joi.object({
    expression: Joi.string().allow(''),
    url: Joi.string().uri().allow(''),
    workflowId: Joi.string().uuid().allow(null),
    code: Joi.string().allow(''),
    entityId: Joi.string().uuid().allow(null),
    query: Joi.object().allow(null)
  }).default({}),
  requestSchema: Joi.object().default({}),
  responseSchema: Joi.object().default({}),
  authentication: Joi.object({
    required: Joi.boolean().default(true),
    permissions: Joi.array().items(Joi.string()).default([])
  }).default({ required: true, permissions: [] }),
  rateLimit: Joi.object({
    enabled: Joi.boolean().default(true),
    maxRequests: Joi.number().integer().min(1).max(10000).default(100),
    windowMs: Joi.number().integer().min(1000).default(60000)
  }).default({ enabled: true, maxRequests: 100, windowMs: 60000 }),
  cors: Joi.object({
    enabled: Joi.boolean().default(true),
    allowedOrigins: Joi.array().items(Joi.string()).default(['*']),
    allowedMethods: Joi.array().items(Joi.string()).default(['GET', 'POST'])
  }).default({ enabled: true, allowedOrigins: ['*'], allowedMethods: ['GET', 'POST'] }),
  cache: Joi.object({
    enabled: Joi.boolean().default(false),
    ttl: Joi.number().integer().min(0).default(300)
  }).default({ enabled: false, ttl: 300 }),
  enabled: Joi.boolean().default(true),
  version: Joi.string().regex(/^\d+\.\d+\.\d+$/).default('1.0.0'),
  tags: Joi.array().items(Joi.string()).default([])
});

const updateAPISchema = Joi.object({
  path: Joi.string().min(1).max(255).regex(/^\/[a-zA-Z0-9\/_-]*$/).optional(),
  displayName: Joi.string().min(1).max(255).optional(),
  description: Joi.string().max(10000).allow('', null).optional(),
  method: Joi.string().valid('GET', 'POST', 'PUT', 'PATCH', 'DELETE').optional(),
  category: Joi.string().max(100).optional(),
  handlerType: Joi.string().valid('jsonlex', 'external_api', 'workflow', 'custom_code', 'entity_query').optional(),
  handlerConfig: Joi.object().optional(),
  requestSchema: Joi.object().optional(),
  responseSchema: Joi.object().optional(),
  authentication: Joi.object().optional(),
  rateLimit: Joi.object().optional(),
  cors: Joi.object().optional(),
  cache: Joi.object().optional(),
  enabled: Joi.boolean().optional(),
  version: Joi.string().regex(/^\d+\.\d+\.\d+$/).optional(),
  tags: Joi.array().items(Joi.string()).optional()
}).min(1);

const testAPISchema = Joi.object({
  method: Joi.string().valid('GET', 'POST', 'PUT', 'PATCH', 'DELETE').required(),
  headers: Joi.object().default({}),
  queryParams: Joi.object().default({}),
  body: Joi.any().default(null)
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/apis
 * List all API endpoints with filtering and pagination
 */
router.get('/', asyncHandler(async (req, res) => {
  const { error, value } = listAPIsSchema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const result = await apiService.listAPIs(value);

  res.json({
    success: true,
    data: result
  });
}));

/**
 * GET /api/apis/stats
 * Get API usage statistics
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const applicationId = req.query.applicationId;

  const stats = await apiService.getApiStats(applicationId);

  res.json({
    success: true,
    data: stats
  });
}));

/**
 * POST /api/apis
 * Create a new API endpoint
 */
router.post('/', requireLowCodeAdmin, asyncHandler(async (req, res) => {
  const { error, value } = createAPISchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const api = await apiService.createApi(value, getCurrentUserId(req));

  res.status(201).json({
    success: true,
    data: api
  });
}));

/**
 * GET /api/apis/:id
 * Get API endpoint by ID
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const api = await apiService.getApiById(id);

    res.json({
      success: true,
      data: api
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: error.message
    });
  }
}));

/**
 * PUT /api/apis/:id
 * Update API endpoint
 */
router.put('/:id', requireLowCodeAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = updateAPISchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  try {
    const api = await apiService.updateApi(id, value, getCurrentUserId(req));

    res.json({
      success: true,
      data: api
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: error.message
    });
  }
}));

/**
 * DELETE /api/apis/:id
 * Delete API endpoint
 */
router.delete('/:id', requireLowCodeAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const result = await apiService.deleteApi(id, getCurrentUserId(req));

    res.json(result);
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: error.message
    });
  }
}));

/**
 * POST /api/apis/:id/enable
 * Enable API endpoint
 */
router.post('/:id/enable', requireLowCodeAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const api = await apiService.enableApi(id, getCurrentUserId(req));

    res.json({
      success: true,
      data: api
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: error.message
    });
  }
}));

/**
 * POST /api/apis/:id/disable
 * Disable API endpoint
 */
router.post('/:id/disable', requireLowCodeAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const api = await apiService.disableApi(id, getCurrentUserId(req));

    res.json({
      success: true,
      data: api
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: error.message
    });
  }
}));

/**
 * POST /api/apis/:id/test
 * Test API endpoint execution
 */
router.post('/:id/test', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = testAPISchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  try {
    const result = await apiService.testApi(id, value);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: error.message
    });
  }
}));

/**
 * GET /api/apis/:id/logs
 * Get API call logs
 */
router.get('/:id/logs', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;

  const logs = await apiService.getApiLogs(id, { limit, offset });

  res.json({
    success: true,
    data: logs
  });
}));

/**
 * GET /api/apis/:id/metrics
 * Get API performance metrics
 */
router.get('/:id/metrics', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const period = req.query.period || 'day';

  try {
    const metrics = await apiService.getApiMetrics(id, period);

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: error.message
    });
  }
}));

/**
 * GET /api/apis/docs/openapi.json
 * Get OpenAPI specification for all APIs in an application
 */
router.get('/docs/openapi.json', asyncHandler(async (req, res) => {
  const applicationId = req.query.applicationId;

  if (!applicationId) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'applicationId query parameter is required'
    });
  }

  const { Application, Api } = require('../models');
  const OpenAPIGenerator = require('../services/OpenAPIGenerator');

  // Get application
  const application = await Application.findByPk(applicationId);
  if (!application) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Application not found'
    });
  }

  // Get all enabled APIs for this application
  const apis = await Api.findAll({
    where: {
      applicationId,
      enabled: true
    }
  });

  // Generate OpenAPI spec
  const spec = OpenAPIGenerator.generateSpec(application, apis);

  res.json(spec);
}));

/**
 * GET /api/apis/docs/swagger
 * Get Swagger UI HTML for API documentation
 */
router.get('/docs/swagger', asyncHandler(async (req, res) => {
  const applicationId = req.query.applicationId;

  if (!applicationId) {
    return res.status(400).send('applicationId query parameter is required');
  }

  const { Application, Api } = require('../models');
  const OpenAPIGenerator = require('../services/OpenAPIGenerator');

  // Get application
  const application = await Application.findByPk(applicationId);
  if (!application) {
    return res.status(404).send('Application not found');
  }

  // Get all enabled APIs for this application
  const apis = await Api.findAll({
    where: {
      applicationId,
      enabled: true
    }
  });

  // Generate OpenAPI spec
  const spec = OpenAPIGenerator.generateSpec(application, apis);

  // Generate Swagger UI HTML
  const html = OpenAPIGenerator.generateSwaggerUI(spec);

  res.header('Content-Type', 'text/html');
  res.send(html);
}));

module.exports = router;
