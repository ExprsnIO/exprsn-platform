const Joi = require('joi');
const logger = require('../utils/logger');

/**
 * Validate request body against schema
 */
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));

      logger.warn('Validation failed', {
        path: req.path,
        errors
      });

      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }

    req.validatedBody = value;
    next();
  };
};

/**
 * Validate query parameters
 */
const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));

      return res.status(400).json({
        success: false,
        error: 'Query validation failed',
        details: errors
      });
    }

    req.validatedQuery = value;
    next();
  };
};

/**
 * Workflow creation validation schema
 */
const createWorkflowSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(5000).optional(),
  status: Joi.string().valid('draft', 'active', 'inactive', 'archived').optional(),
  triggerType: Joi.string().valid('manual', 'scheduled', 'webhook', 'event', 'api').optional(),
  triggerConfig: Joi.object().optional(),
  definition: Joi.object({
    version: Joi.string().required(),
    steps: Joi.array().items(Joi.object()).min(1).required(),
    connections: Joi.array().items(Joi.object()).optional(),
    variables: Joi.object().optional(),
    settings: Joi.object().optional()
  }).required(),
  variables: Joi.object().optional(),
  permissions: Joi.object().optional(),
  jsonlexSchema: Joi.object().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  category: Joi.string().max(100).optional(),
  isTemplate: Joi.boolean().optional(),
  templateCategory: Joi.string().max(100).optional(),
  settings: Joi.object().optional()
});

/**
 * Workflow update validation schema
 */
const updateWorkflowSchema = Joi.object({
  name: Joi.string().min(1).max(255).optional(),
  description: Joi.string().max(5000).optional(),
  status: Joi.string().valid('draft', 'active', 'inactive', 'archived').optional(),
  triggerType: Joi.string().valid('manual', 'scheduled', 'webhook', 'event', 'api').optional(),
  triggerConfig: Joi.object().optional(),
  definition: Joi.object({
    version: Joi.string().required(),
    steps: Joi.array().items(Joi.object()).min(1).required(),
    connections: Joi.array().items(Joi.object()).optional(),
    variables: Joi.object().optional(),
    settings: Joi.object().optional()
  }).optional(),
  variables: Joi.object().optional(),
  permissions: Joi.object().optional(),
  jsonlexSchema: Joi.object().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  category: Joi.string().max(100).optional(),
  settings: Joi.object().optional()
});

/**
 * Execute workflow validation schema
 */
const executeWorkflowSchema = Joi.object({
  inputData: Joi.object().optional(),
  priority: Joi.number().min(1).max(10).optional(),
  triggerType: Joi.string().optional(),
  triggerData: Joi.object().optional()
});

/**
 * List workflows query validation
 */
const listWorkflowsQuerySchema = Joi.object({
  status: Joi.string().valid('draft', 'active', 'inactive', 'archived').optional(),
  triggerType: Joi.string().optional(),
  category: Joi.string().optional(),
  isTemplate: Joi.boolean().optional(),
  tags: Joi.alternatives().try(
    Joi.string(),
    Joi.array().items(Joi.string())
  ).optional(),
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
  sortBy: Joi.string().default('created_at'),
  sortOrder: Joi.string().valid('ASC', 'DESC').default('DESC')
});

/**
 * List executions query validation
 */
const listExecutionsQuerySchema = Joi.object({
  workflowId: Joi.string().uuid().optional(),
  status: Joi.string().valid('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout').optional(),
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
  sortBy: Joi.string().default('created_at'),
  sortOrder: Joi.string().valid('ASC', 'DESC').default('DESC')
});

module.exports = {
  validate,
  validateQuery,
  createWorkflowSchema,
  updateWorkflowSchema,
  executeWorkflowSchema,
  listWorkflowsQuerySchema,
  listExecutionsQuerySchema
};
