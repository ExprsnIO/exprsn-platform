/**
 * Form Routes
 *
 * RESTful API endpoints for form management in the low-code platform.
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const formService = require('../services/FormService');

// Mock user ID for development (replace with actual auth middleware)
const getCurrentUserId = (req) => req.user?.id || 'mock-user-id';

// Async handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const listFormsSchema = Joi.object({
  applicationId: Joi.string().uuid().optional(),
  status: Joi.string().valid('draft', 'published', 'archived').optional(),
  type: Joi.string().valid('form', 'dialog', 'wizard', 'embedded').optional(),
  limit: Joi.number().integer().min(1).max(100).default(25),
  offset: Joi.number().integer().min(0).default(0),
  sortBy: Joi.string().valid('created_at', 'updated_at', 'name', 'displayName').default('created_at'),
  sortOrder: Joi.string().valid('ASC', 'DESC').default('DESC'),
  search: Joi.string().max(255).optional()
});

const createFormSchema = Joi.object({
  applicationId: Joi.string().uuid().required(),
  name: Joi.string().min(1).max(255).required().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
  displayName: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(10000).allow('', null).optional(),
  type: Joi.string().valid('form', 'dialog', 'wizard', 'embedded').default('form'),
  controls: Joi.array().items(Joi.object()).default([]),
  dataSources: Joi.array().items(Joi.object()).default([]),
  collections: Joi.array().items(Joi.object()).default([]),
  variables: Joi.array().items(Joi.object()).default([]),
  events: Joi.object().default({}),
  validationRules: Joi.array().items(Joi.object()).default([]),
  backgroundServices: Joi.array().items(Joi.object()).default([]),
  settings: Joi.object().default({})
});

const updateFormSchema = Joi.object({
  name: Joi.string().min(1).max(255).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/).optional(),
  displayName: Joi.string().min(1).max(255).optional(),
  description: Joi.string().max(10000).allow('', null).optional(),
  type: Joi.string().valid('form', 'dialog', 'wizard', 'embedded').optional(),
  status: Joi.string().valid('draft', 'published', 'archived').optional(),
  controls: Joi.array().items(Joi.object()).optional(),
  dataSources: Joi.array().items(Joi.object()).optional(),
  collections: Joi.array().items(Joi.object()).optional(),
  variables: Joi.array().items(Joi.object()).optional(),
  events: Joi.object().optional(),
  validationRules: Joi.array().items(Joi.object()).optional(),
  backgroundServices: Joi.array().items(Joi.object()).optional(),
  settings: Joi.object().optional()
}).min(1);

const addControlSchema = Joi.object({
  id: Joi.string().optional(),
  type: Joi.string().required(),
  name: Joi.string().required(),
  props: Joi.object().required(),
  events: Joi.object().optional(),
  validation: Joi.object().optional()
});

const updateControlSchema = Joi.object({
  type: Joi.string().optional(),
  name: Joi.string().optional(),
  props: Joi.object().optional(),
  events: Joi.object().optional(),
  validation: Joi.object().optional()
}).min(1);

const reorderControlsSchema = Joi.object({
  controlIds: Joi.array().items(Joi.string()).min(1).required()
});

const addDataSourceSchema = Joi.object({
  name: Joi.string().required().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  type: Joi.string().valid('entity', 'sql', 'rest', 'soap', 'json', 'xml', 'csv').required(),
  config: Joi.object().required(),
  cachePolicy: Joi.string().valid('none', 'session', 'permanent').default('none'),
  autoLoad: Joi.boolean().default(false)
});

const updateDataSourceSchema = Joi.object({
  type: Joi.string().valid('entity', 'sql', 'rest', 'soap', 'json', 'xml', 'csv').optional(),
  config: Joi.object().optional(),
  cachePolicy: Joi.string().valid('none', 'session', 'permanent').optional(),
  autoLoad: Joi.boolean().optional()
}).min(1);

const addVariableSchema = Joi.object({
  name: Joi.string().required().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  type: Joi.string().valid('string', 'number', 'boolean', 'object', 'array').required(),
  defaultValue: Joi.any().optional(),
  scope: Joi.string().valid('form', 'global').default('form')
});

const updateVariableSchema = Joi.object({
  type: Joi.string().valid('string', 'number', 'boolean', 'object', 'array').optional(),
  defaultValue: Joi.any().optional(),
  scope: Joi.string().valid('form', 'global').optional()
}).min(1);

const duplicateFormSchema = Joi.object({
  newName: Joi.string().min(1).max(255).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/).optional()
});

const getSubmissionsSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(25),
  offset: Joi.number().integer().min(0).default(0),
  sortBy: Joi.string().valid('created_at', 'updated_at', 'status').default('created_at'),
  sortOrder: Joi.string().valid('ASC', 'DESC').default('DESC'),
  status: Joi.string().valid('pending', 'completed', 'failed').optional()
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/forms
 * List all forms with filtering and pagination
 */
router.get('/', asyncHandler(async (req, res) => {
  const { error, value } = listFormsSchema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const result = await formService.listForms(value);

  res.json({
    success: true,
    data: result
  });
}));

/**
 * GET /api/forms/:id
 * Get form by ID
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const includeSubmissions = req.query.includeSubmissions === 'true';

  const form = await formService.getFormById(id, { includeSubmissions });

  res.json({
    success: true,
    data: form
  });
}));

/**
 * POST /api/forms
 * Create new form
 */
router.post('/', asyncHandler(async (req, res) => {
  const { error, value } = createFormSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const userId = getCurrentUserId(req);
  const form = await formService.createForm(value, userId);

  res.status(201).json({
    success: true,
    data: form,
    message: 'Form created successfully'
  });
}));

/**
 * PUT /api/forms/:id
 * Update form
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const { error, value } = updateFormSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const form = await formService.updateForm(id, value, userId);

  res.json({
    success: true,
    data: form,
    message: 'Form updated successfully'
  });
}));

/**
 * DELETE /api/forms/:id
 * Delete form (soft delete)
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const result = await formService.deleteForm(id, userId);

  res.json({
    success: true,
    message: result.message
  });
}));

/**
 * POST /api/forms/:id/duplicate
 * Duplicate form
 */
router.post('/:id/duplicate', asyncHandler(async (req, res) => {
  const { error, value } = duplicateFormSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const form = await formService.duplicateForm(id, userId, value.newName);

  res.status(201).json({
    success: true,
    data: form,
    message: 'Form duplicated successfully'
  });
}));

/**
 * POST /api/forms/:id/controls
 * Add control to form
 */
router.post('/:id/controls', asyncHandler(async (req, res) => {
  const { error, value } = addControlSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const form = await formService.addControl(id, value, userId);

  res.json({
    success: true,
    data: form,
    message: 'Control added successfully'
  });
}));

/**
 * PUT /api/forms/:id/controls/:controlId
 * Update control in form
 */
router.put('/:id/controls/:controlId', asyncHandler(async (req, res) => {
  const { error, value } = updateControlSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id, controlId } = req.params;
  const userId = getCurrentUserId(req);

  const form = await formService.updateControl(id, controlId, value, userId);

  res.json({
    success: true,
    data: form,
    message: 'Control updated successfully'
  });
}));

/**
 * DELETE /api/forms/:id/controls/:controlId
 * Remove control from form
 */
router.delete('/:id/controls/:controlId', asyncHandler(async (req, res) => {
  const { id, controlId } = req.params;
  const userId = getCurrentUserId(req);

  const form = await formService.removeControl(id, controlId, userId);

  res.json({
    success: true,
    data: form,
    message: 'Control removed successfully'
  });
}));

/**
 * POST /api/forms/:id/controls/reorder
 * Reorder controls in form
 */
router.post('/:id/controls/reorder', asyncHandler(async (req, res) => {
  const { error, value } = reorderControlsSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const form = await formService.reorderControls(id, value.controlIds, userId);

  res.json({
    success: true,
    data: form,
    message: 'Controls reordered successfully'
  });
}));

/**
 * POST /api/forms/:id/datasources
 * Add data source to form
 */
router.post('/:id/datasources', asyncHandler(async (req, res) => {
  const { error, value } = addDataSourceSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const form = await formService.addDataSource(id, value, userId);

  res.json({
    success: true,
    data: form,
    message: 'Data source added successfully'
  });
}));

/**
 * PUT /api/forms/:id/datasources/:name
 * Update data source in form
 */
router.put('/:id/datasources/:name', asyncHandler(async (req, res) => {
  const { error, value } = updateDataSourceSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id, name } = req.params;
  const userId = getCurrentUserId(req);

  const form = await formService.updateDataSource(id, name, value, userId);

  res.json({
    success: true,
    data: form,
    message: 'Data source updated successfully'
  });
}));

/**
 * DELETE /api/forms/:id/datasources/:name
 * Remove data source from form
 */
router.delete('/:id/datasources/:name', asyncHandler(async (req, res) => {
  const { id, name } = req.params;
  const userId = getCurrentUserId(req);

  const form = await formService.removeDataSource(id, name, userId);

  res.json({
    success: true,
    data: form,
    message: 'Data source removed successfully'
  });
}));

/**
 * POST /api/forms/:id/variables
 * Add variable to form
 */
router.post('/:id/variables', asyncHandler(async (req, res) => {
  const { error, value } = addVariableSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const form = await formService.addVariable(id, value, userId);

  res.json({
    success: true,
    data: form,
    message: 'Variable added successfully'
  });
}));

/**
 * PUT /api/forms/:id/variables/:name
 * Update variable in form
 */
router.put('/:id/variables/:name', asyncHandler(async (req, res) => {
  const { error, value } = updateVariableSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id, name } = req.params;
  const userId = getCurrentUserId(req);

  const form = await formService.updateVariable(id, name, value, userId);

  res.json({
    success: true,
    data: form,
    message: 'Variable updated successfully'
  });
}));

/**
 * DELETE /api/forms/:id/variables/:name
 * Remove variable from form
 */
router.delete('/:id/variables/:name', asyncHandler(async (req, res) => {
  const { id, name } = req.params;
  const userId = getCurrentUserId(req);

  const form = await formService.removeVariable(id, name, userId);

  res.json({
    success: true,
    data: form,
    message: 'Variable removed successfully'
  });
}));

/**
 * GET /api/forms/:id/validate
 * Validate form structure
 */
router.get('/:id/validate', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const validation = await formService.validateForm(id, userId);

  res.json({
    success: true,
    data: validation
  });
}));

/**
 * POST /api/forms/:id/publish
 * Publish form
 */
router.post('/:id/publish', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const form = await formService.publishForm(id, userId);

  res.json({
    success: true,
    data: form,
    message: 'Form published successfully'
  });
}));

/**
 * POST /api/forms/:id/unpublish
 * Unpublish form
 */
router.post('/:id/unpublish', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const form = await formService.unpublishForm(id, userId);

  res.json({
    success: true,
    data: form,
    message: 'Form unpublished successfully'
  });
}));

/**
 * GET /api/forms/:id/submissions
 * Get form submissions
 */
router.get('/:id/submissions', asyncHandler(async (req, res) => {
  const { error, value } = getSubmissionsSchema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id } = req.params;

  const result = await formService.getFormSubmissions(id, value);

  res.json({
    success: true,
    data: result
  });
}));

/**
 * GET /api/forms/:id/stats
 * Get form statistics
 */
router.get('/:id/stats', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const stats = await formService.getFormStats(id, userId);

  res.json({
    success: true,
    data: stats
  });
}));

// ============================================================================
// ERROR HANDLER
// ============================================================================

// ============================================================================
// AUTOSAVE ENDPOINTS (CRUD Fallback)
// ============================================================================

/**
 * Save form autosave data (fallback when Redis/Socket.IO unavailable)
 * POST /api/forms/:formId/autosave
 */
router.post('/:formId/autosave', asyncHandler(async (req, res) => {
  const { formId } = req.params;
  const { formName, schema, components, customFunctions, variables, timestamp, version } = req.body;

  // Validate required fields
  if (!formId) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Form ID is required'
    });
  }

  // Store in database as fallback
  const db = require('../models');
  const autosaveData = {
    formId,
    formName: formName || 'Untitled Form',
    schema: schema || {},
    components: components || [],
    customFunctions: customFunctions || {},
    variables: variables || [],
    timestamp: timestamp || Date.now(),
    version: version || 1,
    userId: getCurrentUserId(req),
    savedAt: new Date()
  };

  // Use upsert to create or update
  await db.FormAutosave.upsert(autosaveData, {
    where: { formId }
  });

  res.json({
    success: true,
    timestamp: autosaveData.savedAt.getTime(),
    message: 'Form autosaved successfully'
  });
}));

/**
 * Load form autosave data (fallback when Redis/Socket.IO unavailable)
 * GET /api/forms/:formId/autosave
 */
router.get('/:formId/autosave', asyncHandler(async (req, res) => {
  const { formId } = req.params;

  if (!formId) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Form ID is required'
    });
  }

  const db = require('../models');
  const autosaveData = await db.FormAutosave.findOne({
    where: { formId }
  });

  if (!autosaveData) {
    return res.json({
      success: true,
      data: null,
      message: 'No autosave data found'
    });
  }

  res.json({
    success: true,
    data: autosaveData,
    message: 'Autosave data loaded successfully'
  });
}));

/**
 * Clear form autosave data (fallback when Redis/Socket.IO unavailable)
 * DELETE /api/forms/:formId/autosave
 */
router.delete('/:formId/autosave', asyncHandler(async (req, res) => {
  const { formId } = req.params;

  if (!formId) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Form ID is required'
    });
  }

  const db = require('../models');
  await db.FormAutosave.destroy({
    where: { formId }
  });

  res.json({
    success: true,
    message: 'Autosave data cleared successfully'
  });
}));

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================

router.use((err, req, res, next) => {
  console.error('Form API Error:', err);

  // Handle known errors
  if (err.message.includes('not found')) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: err.message
    });
  }

  if (err.message.includes('Unauthorized')) {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: err.message
    });
  }

  if (err.message.includes('already exists')) {
    return res.status(409).json({
      success: false,
      error: 'CONFLICT',
      message: err.message
    });
  }

  // Generic error
  res.status(500).json({
    success: false,
    error: 'INTERNAL_ERROR',
    message: err.message || 'An unexpected error occurred'
  });
});

module.exports = router;
