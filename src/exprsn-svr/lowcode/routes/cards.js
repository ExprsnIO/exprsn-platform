/**
 * Card Routes
 *
 * RESTful API endpoints for card (reusable component) management.
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const cardService = require('../services/CardService');

// Mock user ID for development
const getCurrentUserId = (req) => req.user?.id || 'mock-user-id';

// Async handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const listCardsSchema = Joi.object({
  applicationId: Joi.string().uuid().optional(),
  type: Joi.string().valid('custom', 'form', 'grid', 'chart', 'widget', 'layout').optional(),
  category: Joi.string().max(100).optional(),
  shared: Joi.boolean().optional(),
  limit: Joi.number().integer().min(1).max(100).default(25),
  offset: Joi.number().integer().min(0).default(0),
  sortBy: Joi.string().valid('created_at', 'updated_at', 'name', 'displayName', 'usageCount').default('created_at'),
  sortOrder: Joi.string().valid('ASC', 'DESC').default('DESC'),
  search: Joi.string().max(255).optional()
});

const createCardSchema = Joi.object({
  applicationId: Joi.string().uuid().required(),
  name: Joi.string().min(1).max(255).required().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
  displayName: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(10000).allow('', null).optional(),
  type: Joi.string().valid('custom', 'form', 'grid', 'chart', 'widget', 'layout').default('custom'),
  category: Joi.string().max(100).default('general'),
  html: Joi.string().allow('').default(''),
  css: Joi.string().allow('').default(''),
  javascript: Joi.string().allow('').default(''),
  controls: Joi.array().items(Joi.object()).default([]),
  props: Joi.object().default({}),
  events: Joi.object().default({}),
  dataBindings: Joi.array().items(Joi.object()).default([]),
  shared: Joi.boolean().default(false),
  version: Joi.string().regex(/^\d+\.\d+\.\d+$/).default('1.0.0'),
  tags: Joi.array().items(Joi.string()).default([])
});

const updateCardSchema = Joi.object({
  name: Joi.string().min(1).max(255).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/).optional(),
  displayName: Joi.string().min(1).max(255).optional(),
  description: Joi.string().max(10000).allow('', null).optional(),
  type: Joi.string().valid('custom', 'form', 'grid', 'chart', 'widget', 'layout').optional(),
  category: Joi.string().max(100).optional(),
  html: Joi.string().allow('').optional(),
  css: Joi.string().allow('').optional(),
  javascript: Joi.string().allow('').optional(),
  controls: Joi.array().items(Joi.object()).optional(),
  props: Joi.object().optional(),
  events: Joi.object().optional(),
  dataBindings: Joi.array().items(Joi.object()).optional(),
  shared: Joi.boolean().optional(),
  version: Joi.string().regex(/^\d+\.\d+\.\d+$/).optional(),
  tags: Joi.array().items(Joi.string()).optional()
}).min(1);

const duplicateCardSchema = Joi.object({
  newName: Joi.string().min(1).max(255).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/).optional()
});

const incrementVersionSchema = Joi.object({
  type: Joi.string().valid('major', 'minor', 'patch').required()
});

const addTagSchema = Joi.object({
  tag: Joi.string().min(1).max(50).required()
});

const removeTagSchema = Joi.object({
  tag: Joi.string().min(1).max(50).required()
});

const getCategorySchema = Joi.object({
  shared: Joi.boolean().default(true),
  limit: Joi.number().integer().min(1).max(100).default(25),
  offset: Joi.number().integer().min(0).default(0)
});

const searchByTagsSchema = Joi.object({
  tags: Joi.array().items(Joi.string()).min(1).required(),
  shared: Joi.boolean().default(true),
  limit: Joi.number().integer().min(1).max(100).default(25),
  offset: Joi.number().integer().min(0).default(0)
});

const getPopularSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(50).default(10),
  category: Joi.string().max(100).optional(),
  period: Joi.string().valid('all', 'month', 'week').default('all')
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/cards
 * List all cards with filtering and pagination
 */
router.get('/', asyncHandler(async (req, res) => {
  const { error, value } = listCardsSchema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const result = await cardService.listCards(value);

  res.json({
    success: true,
    data: result
  });
}));

/**
 * GET /api/cards/popular
 * Get popular cards
 */
router.get('/popular', asyncHandler(async (req, res) => {
  const { error, value } = getPopularSchema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const cards = await cardService.getPopularCards(value);

  res.json({
    success: true,
    data: cards
  });
}));

/**
 * GET /api/cards/category/:category
 * Get cards by category
 */
router.get('/category/:category', asyncHandler(async (req, res) => {
  const { error, value } = getCategorySchema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { category } = req.params;

  const result = await cardService.getCardsByCategory(category, value);

  res.json({
    success: true,
    data: result
  });
}));

/**
 * POST /api/cards/search/tags
 * Search cards by tags
 */
router.post('/search/tags', asyncHandler(async (req, res) => {
  const { error, value } = searchByTagsSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const result = await cardService.searchByTags(value.tags, value);

  res.json({
    success: true,
    data: result
  });
}));

/**
 * GET /api/cards/:id
 * Get card by ID
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const card = await cardService.getCardById(id);

  // Increment usage count (asynchronously, don't wait)
  cardService.incrementUsageCount(id).catch(err =>
    console.error('Failed to increment usage count:', err)
  );

  res.json({
    success: true,
    data: card
  });
}));

/**
 * POST /api/cards
 * Create new card
 */
router.post('/', asyncHandler(async (req, res) => {
  const { error, value } = createCardSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const userId = getCurrentUserId(req);
  const card = await cardService.createCard(value, userId);

  res.status(201).json({
    success: true,
    data: card,
    message: 'Card created successfully'
  });
}));

/**
 * PUT /api/cards/:id
 * Update card
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const { error, value } = updateCardSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const card = await cardService.updateCard(id, value, userId);

  res.json({
    success: true,
    data: card,
    message: 'Card updated successfully'
  });
}));

/**
 * DELETE /api/cards/:id
 * Delete card (soft delete)
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const result = await cardService.deleteCard(id, userId);

  res.json({
    success: true,
    message: result.message
  });
}));

/**
 * POST /api/cards/:id/duplicate
 * Duplicate card
 */
router.post('/:id/duplicate', asyncHandler(async (req, res) => {
  const { error, value } = duplicateCardSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const card = await cardService.duplicateCard(id, userId, value.newName);

  res.status(201).json({
    success: true,
    data: card,
    message: 'Card duplicated successfully'
  });
}));

/**
 * POST /api/cards/:id/publish
 * Publish card (make it shared)
 */
router.post('/:id/publish', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const card = await cardService.publishCard(id, userId);

  res.json({
    success: true,
    data: card,
    message: 'Card published successfully'
  });
}));

/**
 * POST /api/cards/:id/unpublish
 * Unpublish card (make it private)
 */
router.post('/:id/unpublish', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const card = await cardService.unpublishCard(id, userId);

  res.json({
    success: true,
    data: card,
    message: 'Card unpublished successfully'
  });
}));

/**
 * POST /api/cards/:id/version
 * Increment card version
 */
router.post('/:id/version', asyncHandler(async (req, res) => {
  const { error, value } = incrementVersionSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const card = await cardService.incrementVersion(id, value.type, userId);

  res.json({
    success: true,
    data: card,
    message: `Card version incremented to ${card.version}`
  });
}));

/**
 * POST /api/cards/:id/tags
 * Add tag to card
 */
router.post('/:id/tags', asyncHandler(async (req, res) => {
  const { error, value } = addTagSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const card = await cardService.addTag(id, value.tag, userId);

  res.json({
    success: true,
    data: card,
    message: 'Tag added successfully'
  });
}));

/**
 * DELETE /api/cards/:id/tags
 * Remove tag from card
 */
router.delete('/:id/tags', asyncHandler(async (req, res) => {
  const { error, value } = removeTagSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const card = await cardService.removeTag(id, value.tag, userId);

  res.json({
    success: true,
    data: card,
    message: 'Tag removed successfully'
  });
}));

/**
 * GET /api/cards/:id/stats
 * Get card statistics
 */
router.get('/:id/stats', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const stats = await cardService.getCardStats(id, userId);

  res.json({
    success: true,
    data: stats
  });
}));

// ============================================================================
// ERROR HANDLER
// ============================================================================

router.use((err, req, res, next) => {
  console.error('Card API Error:', err);

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
