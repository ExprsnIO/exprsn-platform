/**
 * ═══════════════════════════════════════════════════════════
 * HTML Projects API Routes
 * REST endpoints for HTML project management
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const HtmlProjectService = require('../services/HtmlProjectService');
const { asyncHandler } = require('../../middleware/errorHandler');
const Joi = require('joi');

/**
 * Validation schemas
 */
const createProjectSchema = Joi.object({
  name: Joi.string().min(1).max(200).required(),
  description: Joi.string().allow('', null),
  ownerId: Joi.string().uuid().required(),
  organizationId: Joi.string().uuid().allow(null),
  applicationId: Joi.string().uuid().allow(null),
  settings: Joi.object().default({})
});

const updateProjectSchema = Joi.object({
  name: Joi.string().min(1).max(200),
  description: Joi.string().allow('', null),
  status: Joi.string().valid('draft', 'development', 'staging', 'production', 'archived'),
  settings: Joi.object(),
  metadata: Joi.object()
});

/**
 * GET /lowcode/api/html-projects
 * List HTML projects
 */
router.get('/', asyncHandler(async (req, res) => {
  const {
    ownerId,
    organizationId,
    status,
    search,
    page,
    limit
  } = req.query;

  const result = await HtmlProjectService.listProjects({
    ownerId,
    organizationId,
    status,
    search,
    page: page ? parseInt(page) : 1,
    limit: limit ? parseInt(limit) : 20
  });

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
}));

/**
 * POST /lowcode/api/html-projects
 * Create new HTML project
 */
router.post('/', asyncHandler(async (req, res) => {
  const { error, value } = createProjectSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const result = await HtmlProjectService.createProject(value);

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.status(201).json(result);
}));

/**
 * GET /lowcode/api/html-projects/:id
 * Get project by ID
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { includeFiles, includeLibraries, includeComponents } = req.query;

  const result = await HtmlProjectService.getProject(id, {
    includeFiles: includeFiles === 'true',
    includeLibraries: includeLibraries === 'true',
    includeComponents: includeComponents === 'true'
  });

  if (!result.success) {
    return res.status(404).json(result);
  }

  res.json(result);
}));

/**
 * PUT /lowcode/api/html-projects/:id
 * Update project
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = updateProjectSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const result = await HtmlProjectService.updateProject(id, value);

  if (!result.success) {
    return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json(result);
  }

  res.json(result);
}));

/**
 * DELETE /lowcode/api/html-projects/:id
 * Delete project
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await HtmlProjectService.deleteProject(id);

  if (!result.success) {
    return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json(result);
  }

  res.json(result);
}));

/**
 * POST /lowcode/api/html-projects/:id/duplicate
 * Duplicate project
 */
router.post('/:id/duplicate', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { ownerId, newName } = req.body;

  if (!ownerId) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'ownerId is required'
    });
  }

  const result = await HtmlProjectService.duplicateProject(id, ownerId, newName);

  if (!result.success) {
    return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json(result);
  }

  res.status(201).json(result);
}));

/**
 * POST /lowcode/api/html-projects/:id/libraries
 * Add library to project
 */
router.post('/:id/libraries', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { libraryId, loadOrder } = req.body;

  if (!libraryId) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'libraryId is required'
    });
  }

  const result = await HtmlProjectService.addLibrary(id, libraryId, loadOrder || 0);

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.status(201).json(result);
}));

/**
 * DELETE /lowcode/api/html-projects/:id/libraries/:libraryId
 * Remove library from project
 */
router.delete('/:id/libraries/:libraryId', asyncHandler(async (req, res) => {
  const { id, libraryId } = req.params;

  const result = await HtmlProjectService.removeLibrary(id, libraryId);

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
}));

module.exports = router;
