/**
 * ═══════════════════════════════════════════════════════════
 * HTML Libraries API Routes
 * REST endpoints for library management
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const HtmlLibraryService = require('../services/HtmlLibraryService');
const { asyncHandler } = require('../../middleware/errorHandler');
const Joi = require('joi');

/**
 * Validation schemas
 */
const createLibrarySchema = Joi.object({
  name: Joi.string().min(1).max(200).required(),
  version: Joi.string().min(1).max(50).required(),
  description: Joi.string().allow('', null),
  type: Joi.string().valid('css', 'javascript', 'both').required(),
  cdnCssUrl: Joi.string().uri().allow('', null),
  cdnJsUrl: Joi.string().uri().allow('', null),
  localCssPath: Joi.string().allow('', null),
  localJsPath: Joi.string().allow('', null),
  integrityCss: Joi.string().allow('', null),
  integrityJs: Joi.string().allow('', null),
  dependencies: Joi.array().default([]),
  isPopular: Joi.boolean().default(false)
});

const updateLibrarySchema = Joi.object({
  version: Joi.string().min(1).max(50),
  description: Joi.string().allow('', null),
  cdnCssUrl: Joi.string().uri().allow('', null),
  cdnJsUrl: Joi.string().uri().allow('', null),
  localCssPath: Joi.string().allow('', null),
  localJsPath: Joi.string().allow('', null),
  integrityCss: Joi.string().allow('', null),
  integrityJs: Joi.string().allow('', null),
  dependencies: Joi.array(),
  isActive: Joi.boolean(),
  isPopular: Joi.boolean()
});

/**
 * GET /lowcode/api/html-libraries
 * List libraries
 */
router.get('/', asyncHandler(async (req, res) => {
  const {
    type,
    search,
    isActive,
    isPopular,
    page,
    limit
  } = req.query;

  const result = await HtmlLibraryService.listLibraries({
    type,
    search,
    isActive: isActive !== undefined ? isActive === 'true' : undefined,
    isPopular: isPopular !== undefined ? isPopular === 'true' : undefined,
    page: page ? parseInt(page) : 1,
    limit: limit ? parseInt(limit) : 50
  });

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
}));

/**
 * GET /lowcode/api/html-libraries/popular
 * Get popular libraries
 */
router.get('/popular', asyncHandler(async (req, res) => {
  const result = await HtmlLibraryService.getPopularLibraries();

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
}));

/**
 * GET /lowcode/api/html-libraries/:id
 * Get library by ID
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await HtmlLibraryService.getLibrary(id);

  if (!result.success) {
    return res.status(404).json(result);
  }

  res.json(result);
}));

/**
 * POST /lowcode/api/html-libraries
 * Create library (admin only)
 */
router.post('/', asyncHandler(async (req, res) => {
  const { error, value } = createLibrarySchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const result = await HtmlLibraryService.createLibrary(value);

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.status(201).json(result);
}));

/**
 * PUT /lowcode/api/html-libraries/:id
 * Update library
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = updateLibrarySchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const result = await HtmlLibraryService.updateLibrary(id, value);

  if (!result.success) {
    return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json(result);
  }

  res.json(result);
}));

/**
 * DELETE /lowcode/api/html-libraries/:id
 * Delete library
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await HtmlLibraryService.deleteLibrary(id);

  if (!result.success) {
    return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json(result);
  }

  res.json(result);
}));

/**
 * GET /lowcode/api/html-libraries/projects/:projectId
 * Get libraries for project
 */
router.get('/projects/:projectId', asyncHandler(async (req, res) => {
  const { projectId } = req.params;

  const result = await HtmlLibraryService.getProjectLibraries(projectId);

  if (!result.success) {
    return res.status(result.error === 'PROJECT_NOT_FOUND' ? 404 : 400).json(result);
  }

  res.json(result);
}));

/**
 * PUT /lowcode/api/html-libraries/:id/load-order
 * Update library load order in project
 */
router.put('/:id/load-order', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { projectId, loadOrder } = req.body;

  if (!projectId || loadOrder === undefined) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'projectId and loadOrder are required'
    });
  }

  const result = await HtmlLibraryService.updateLoadOrder(projectId, id, parseInt(loadOrder));

  if (!result.success) {
    return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json(result);
  }

  res.json(result);
}));

/**
 * PUT /lowcode/api/html-libraries/:id/toggle
 * Toggle library enabled/disabled in project
 */
router.put('/:id/toggle', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { projectId, isEnabled } = req.body;

  if (!projectId || isEnabled === undefined) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'projectId and isEnabled are required'
    });
  }

  const result = await HtmlLibraryService.toggleLibrary(projectId, id, isEnabled);

  if (!result.success) {
    return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json(result);
  }

  res.json(result);
}));

module.exports = router;
