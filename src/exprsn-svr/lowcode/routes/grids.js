/**
 * Grid Routes
 *
 * RESTful API endpoints for grid management in the low-code platform.
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const gridService = require('../services/GridService');

// Mock user ID for development (replace with actual auth middleware)
const getCurrentUserId = (req) => req.user?.id || 'mock-user-id';

// Async handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const listGridsSchema = Joi.object({
  applicationId: Joi.string().uuid().optional(),
  type: Joi.string().valid('main', 'subgrid', 'editable', 'readonly').optional(),
  entityId: Joi.string().uuid().optional(),
  limit: Joi.number().integer().min(1).max(100).default(25),
  offset: Joi.number().integer().min(0).default(0),
  sortBy: Joi.string().valid('created_at', 'updated_at', 'name', 'displayName').default('created_at'),
  sortOrder: Joi.string().valid('ASC', 'DESC').default('DESC'),
  search: Joi.string().max(255).optional()
});

const createGridSchema = Joi.object({
  applicationId: Joi.string().uuid().required(),
  name: Joi.string().min(1).max(255).required().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
  displayName: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(10000).allow('', null).optional(),
  type: Joi.string().valid('main', 'subgrid', 'editable', 'readonly').default('main'),
  entityId: Joi.string().uuid().allow(null).optional(),
  columns: Joi.array().items(Joi.object()).default([]),
  settings: Joi.object().default({}),
  filters: Joi.array().items(Joi.object()).default([]),
  sortOrders: Joi.array().items(Joi.object()).default([]),
  events: Joi.object().default({})
});

const updateGridSchema = Joi.object({
  name: Joi.string().min(1).max(255).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/).optional(),
  displayName: Joi.string().min(1).max(255).optional(),
  description: Joi.string().max(10000).allow('', null).optional(),
  type: Joi.string().valid('main', 'subgrid', 'editable', 'readonly').optional(),
  entityId: Joi.string().uuid().allow(null).optional(),
  columns: Joi.array().items(Joi.object()).optional(),
  settings: Joi.object().optional(),
  filters: Joi.array().items(Joi.object()).optional(),
  sortOrders: Joi.array().items(Joi.object()).optional(),
  events: Joi.object().optional()
}).min(1);

const addColumnSchema = Joi.object({
  name: Joi.string().required().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  displayName: Joi.string().required(),
  dataType: Joi.string().valid('string', 'number', 'boolean', 'date', 'datetime', 'object').default('string'),
  width: Joi.number().integer().min(50).max(1000).optional(),
  visible: Joi.boolean().default(true),
  sortable: Joi.boolean().default(true),
  filterable: Joi.boolean().default(true),
  editable: Joi.boolean().default(false),
  required: Joi.boolean().default(false),
  format: Joi.string().optional(),
  formula: Joi.string().optional(),
  template: Joi.string().optional()
});

const updateColumnSchema = Joi.object({
  displayName: Joi.string().optional(),
  dataType: Joi.string().valid('string', 'number', 'boolean', 'date', 'datetime', 'object').optional(),
  width: Joi.number().integer().min(50).max(1000).optional(),
  visible: Joi.boolean().optional(),
  sortable: Joi.boolean().optional(),
  filterable: Joi.boolean().optional(),
  editable: Joi.boolean().optional(),
  required: Joi.boolean().optional(),
  format: Joi.string().optional(),
  formula: Joi.string().optional(),
  template: Joi.string().optional()
}).min(1);

const reorderColumnsSchema = Joi.object({
  columnNames: Joi.array().items(Joi.string()).min(1).required()
});

const addFilterSchema = Joi.object({
  id: Joi.string().optional(),
  field: Joi.string().required(),
  operator: Joi.string().valid('eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'like', 'iLike', 'in', 'notIn', 'between', 'contains', 'startsWith', 'endsWith').required(),
  value: Joi.any().required(),
  logic: Joi.string().valid('and', 'or').default('and')
});

const updateSettingsSchema = Joi.object({
  pageSize: Joi.number().integer().min(5).max(100).optional(),
  allowPaging: Joi.boolean().optional(),
  allowSorting: Joi.boolean().optional(),
  allowFiltering: Joi.boolean().optional(),
  allowExport: Joi.boolean().optional(),
  allowInlineEdit: Joi.boolean().optional(),
  allowRowSelection: Joi.boolean().optional(),
  showToolbar: Joi.boolean().optional(),
  showSearchBox: Joi.boolean().optional(),
  showColumnChooser: Joi.boolean().optional(),
  alternateRowColor: Joi.boolean().optional()
}).min(1);

const getGridDataSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).optional(),
  sortBy: Joi.string().optional(),
  sortOrder: Joi.string().valid('ASC', 'DESC').default('ASC'),
  filters: Joi.object().optional()
});

const exportGridSchema = Joi.object({
  format: Joi.string().valid('csv', 'excel', 'json').default('csv'),
  filters: Joi.object().optional()
});

const duplicateGridSchema = Joi.object({
  newName: Joi.string().min(1).max(255).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/).optional()
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/grids
 * List all grids with filtering and pagination
 */
router.get('/', asyncHandler(async (req, res) => {
  const { error, value } = listGridsSchema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const result = await gridService.listGrids(value);

  res.json({
    success: true,
    data: result
  });
}));

/**
 * GET /api/grids/:id
 * Get grid by ID
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const grid = await gridService.getGridById(id);

  res.json({
    success: true,
    data: grid
  });
}));

/**
 * POST /api/grids
 * Create new grid
 */
router.post('/', asyncHandler(async (req, res) => {
  const { error, value } = createGridSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const userId = getCurrentUserId(req);
  const grid = await gridService.createGrid(value, userId);

  res.status(201).json({
    success: true,
    data: grid,
    message: 'Grid created successfully'
  });
}));

/**
 * PUT /api/grids/:id
 * Update grid
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const { error, value } = updateGridSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const grid = await gridService.updateGrid(id, value, userId);

  res.json({
    success: true,
    data: grid,
    message: 'Grid updated successfully'
  });
}));

/**
 * DELETE /api/grids/:id
 * Delete grid (soft delete)
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const result = await gridService.deleteGrid(id, userId);

  res.json({
    success: true,
    message: result.message
  });
}));

/**
 * POST /api/grids/:id/duplicate
 * Duplicate grid
 */
router.post('/:id/duplicate', asyncHandler(async (req, res) => {
  const { error, value } = duplicateGridSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const grid = await gridService.duplicateGrid(id, userId, value.newName);

  res.status(201).json({
    success: true,
    data: grid,
    message: 'Grid duplicated successfully'
  });
}));

/**
 * POST /api/grids/:id/columns
 * Add column to grid
 */
router.post('/:id/columns', asyncHandler(async (req, res) => {
  const { error, value } = addColumnSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const grid = await gridService.addColumn(id, value, userId);

  res.json({
    success: true,
    data: grid,
    message: 'Column added successfully'
  });
}));

/**
 * PUT /api/grids/:id/columns/:columnName
 * Update column in grid
 */
router.put('/:id/columns/:columnName', asyncHandler(async (req, res) => {
  const { error, value } = updateColumnSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id, columnName } = req.params;
  const userId = getCurrentUserId(req);

  const grid = await gridService.updateColumn(id, columnName, value, userId);

  res.json({
    success: true,
    data: grid,
    message: 'Column updated successfully'
  });
}));

/**
 * DELETE /api/grids/:id/columns/:columnName
 * Remove column from grid
 */
router.delete('/:id/columns/:columnName', asyncHandler(async (req, res) => {
  const { id, columnName } = req.params;
  const userId = getCurrentUserId(req);

  const grid = await gridService.removeColumn(id, columnName, userId);

  res.json({
    success: true,
    data: grid,
    message: 'Column removed successfully'
  });
}));

/**
 * POST /api/grids/:id/columns/reorder
 * Reorder columns in grid
 */
router.post('/:id/columns/reorder', asyncHandler(async (req, res) => {
  const { error, value } = reorderColumnsSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const grid = await gridService.reorderColumns(id, value.columnNames, userId);

  res.json({
    success: true,
    data: grid,
    message: 'Columns reordered successfully'
  });
}));

/**
 * POST /api/grids/:id/filters
 * Add filter to grid
 */
router.post('/:id/filters', asyncHandler(async (req, res) => {
  const { error, value } = addFilterSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const grid = await gridService.addFilter(id, value, userId);

  res.json({
    success: true,
    data: grid,
    message: 'Filter added successfully'
  });
}));

/**
 * DELETE /api/grids/:id/filters/:filterId
 * Remove filter from grid
 */
router.delete('/:id/filters/:filterId', asyncHandler(async (req, res) => {
  const { id, filterId } = req.params;
  const userId = getCurrentUserId(req);

  const grid = await gridService.removeFilter(id, filterId, userId);

  res.json({
    success: true,
    data: grid,
    message: 'Filter removed successfully'
  });
}));

/**
 * PUT /api/grids/:id/settings
 * Update grid settings
 */
router.put('/:id/settings', asyncHandler(async (req, res) => {
  const { error, value } = updateSettingsSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const grid = await gridService.updateSettings(id, value, userId);

  res.json({
    success: true,
    data: grid,
    message: 'Settings updated successfully'
  });
}));

/**
 * GET /api/grids/:id/data
 * Get grid data with filtering, sorting, pagination
 */
router.get('/:id/data', asyncHandler(async (req, res) => {
  const { error, value } = getGridDataSchema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id } = req.params;

  const result = await gridService.getGridData(id, value);

  res.json({
    success: true,
    data: result
  });
}));

/**
 * POST /api/grids/:id/export
 * Export grid data
 */
router.post('/:id/export', asyncHandler(async (req, res) => {
  const { error, value } = exportGridSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id } = req.params;

  const result = await gridService.exportGridData(id, value.format, value);

  res.json({
    success: true,
    data: result
  });
}));

/**
 * GET /api/grids/:id/stats
 * Get grid statistics
 */
router.get('/:id/stats', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const stats = await gridService.getGridStats(id, userId);

  res.json({
    success: true,
    data: stats
  });
}));

// ============================================================================
// ERROR HANDLER
// ============================================================================

router.use((err, req, res, next) => {
  console.error('Grid API Error:', err);

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
