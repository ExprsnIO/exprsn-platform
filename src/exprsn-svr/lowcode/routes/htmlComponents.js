/**
 * ═══════════════════════════════════════════════════════════
 * HTML Components API Routes
 * REST endpoints for component marketplace
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const HtmlComponentService = require('../services/HtmlComponentService');
const { asyncHandler } = require('../../middleware/errorHandler');
const Joi = require('joi');

/**
 * Validation schemas
 */
const createComponentSchema = Joi.object({
  name: Joi.string().min(1).max(200).required(),
  category: Joi.string().min(1).max(100).required(),
  description: Joi.string().allow('', null),
  htmlTemplate: Joi.string().required(),
  css: Joi.string().allow('', null),
  javascript: Joi.string().allow('', null),
  properties: Joi.array().default([]),
  dependencies: Joi.array().default([]),
  icon: Joi.string().allow('', null),
  isPublic: Joi.boolean().default(false),
  authorId: Joi.string().uuid().required(),
  organizationId: Joi.string().uuid().allow(null)
});

const updateComponentSchema = Joi.object({
  name: Joi.string().min(1).max(200),
  category: Joi.string().min(1).max(100),
  description: Joi.string().allow('', null),
  htmlTemplate: Joi.string(),
  css: Joi.string().allow('', null),
  javascript: Joi.string().allow('', null),
  properties: Joi.array(),
  dependencies: Joi.array(),
  icon: Joi.string().allow('', null),
  isPublic: Joi.boolean(),
  version: Joi.string()
});

/**
 * GET /lowcode/api/html-components
 * List components
 */
router.get('/', asyncHandler(async (req, res) => {
  const {
    category,
    search,
    isPublic,
    isSystem,
    authorId,
    organizationId,
    page,
    limit
  } = req.query;

  const result = await HtmlComponentService.listComponents({
    category,
    search,
    isPublic: isPublic !== undefined ? isPublic === 'true' : undefined,
    isSystem: isSystem !== undefined ? isSystem === 'true' : undefined,
    authorId,
    organizationId,
    page: page ? parseInt(page) : 1,
    limit: limit ? parseInt(limit) : 50
  });

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
}));

/**
 * GET /lowcode/api/html-components/categories
 * Get component categories
 */
router.get('/categories', asyncHandler(async (req, res) => {
  const result = await HtmlComponentService.getCategories();

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
}));

/**
 * GET /lowcode/api/html-components/:id
 * Get component by ID
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await HtmlComponentService.getComponent(id);

  if (!result.success) {
    return res.status(404).json(result);
  }

  res.json(result);
}));

/**
 * POST /lowcode/api/html-components
 * Create component
 */
router.post('/', asyncHandler(async (req, res) => {
  const { error, value } = createComponentSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const result = await HtmlComponentService.createComponent(value);

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.status(201).json(result);
}));

/**
 * PUT /lowcode/api/html-components/:id
 * Update component
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = updateComponentSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const result = await HtmlComponentService.updateComponent(id, value);

  if (!result.success) {
    return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json(result);
  }

  res.json(result);
}));

/**
 * DELETE /lowcode/api/html-components/:id
 * Delete component
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await HtmlComponentService.deleteComponent(id);

  if (!result.success) {
    return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json(result);
  }

  res.json(result);
}));

/**
 * POST /lowcode/api/html-components/:id/install
 * Install component to project
 */
router.post('/:id/install', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { projectId } = req.body;

  if (!projectId) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'projectId is required'
    });
  }

  const result = await HtmlComponentService.installComponent(projectId, id);

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.status(201).json(result);
}));

/**
 * POST /lowcode/api/html-components/:id/uninstall
 * Uninstall component from project
 */
router.post('/:id/uninstall', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { projectId } = req.body;

  if (!projectId) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'projectId is required'
    });
  }

  const result = await HtmlComponentService.uninstallComponent(projectId, id);

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
}));

/**
 * GET /lowcode/api/html-components/projects/:projectId
 * Get components installed in project
 */
router.get('/projects/:projectId', asyncHandler(async (req, res) => {
  const { projectId } = req.params;

  const result = await HtmlComponentService.getProjectComponents(projectId);

  if (!result.success) {
    return res.status(result.error === 'PROJECT_NOT_FOUND' ? 404 : 400).json(result);
  }

  res.json(result);
}));

/**
 * POST /lowcode/api/html-components/:id/rate
 * Rate component
 */
router.post('/:id/rate', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rating } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Rating must be between 1 and 5'
    });
  }

  const result = await HtmlComponentService.rateComponent(id, rating);

  if (!result.success) {
    return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json(result);
  }

  res.json(result);
}));

module.exports = router;
