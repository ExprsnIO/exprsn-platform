/**
 * ═══════════════════════════════════════════════════════════
 * HTML Files API Routes
 * REST endpoints for file and folder management
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const HtmlFileService = require('../services/HtmlFileService');
const { asyncHandler } = require('../../middleware/errorHandler');
const Joi = require('joi');

/**
 * Validation schemas
 */
const createFileSchema = Joi.object({
  projectId: Joi.string().uuid().required(),
  parentId: Joi.string().uuid().allow(null),
  name: Joi.string().min(1).max(255).required(),
  type: Joi.string().valid('folder', 'html', 'css', 'javascript', 'json', 'image', 'font', 'other').required(),
  content: Joi.string().allow('', null),
  userId: Joi.string().uuid().required()
});

const updateFileSchema = Joi.object({
  name: Joi.string().min(1).max(255),
  content: Joi.string().allow('', null),
  userId: Joi.string().uuid().required()
});

/**
 * GET /lowcode/api/html-projects/:projectId/files
 * Get file tree for project
 */
router.get('/projects/:projectId/tree', asyncHandler(async (req, res) => {
  const { projectId } = req.params;

  const result = await HtmlFileService.getFileTree(projectId);

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
}));

/**
 * POST /lowcode/api/html-files
 * Create file or folder
 */
router.post('/', asyncHandler(async (req, res) => {
  const { error, value } = createFileSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const result = await HtmlFileService.createFile(value);

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.status(201).json(result);
}));

/**
 * GET /lowcode/api/html-files/:id
 * Get file by ID
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { includeVersions, versionLimit } = req.query;

  const result = await HtmlFileService.getFile(id, {
    includeVersions: includeVersions === 'true',
    versionLimit: versionLimit ? parseInt(versionLimit) : 10
  });

  if (!result.success) {
    return res.status(404).json(result);
  }

  res.json(result);
}));

/**
 * PUT /lowcode/api/html-files/:id
 * Update file
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = updateFileSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { userId, ...updates } = value;
  const result = await HtmlFileService.updateFile(id, updates, userId);

  if (!result.success) {
    return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json(result);
  }

  res.json(result);
}));

/**
 * DELETE /lowcode/api/html-files/:id
 * Delete file or folder
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await HtmlFileService.deleteFile(id);

  if (!result.success) {
    return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json(result);
  }

  res.json(result);
}));

/**
 * POST /lowcode/api/html-files/:id/move
 * Move file to new location
 */
router.post('/:id/move', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { newParentId, userId } = req.body;

  if (!userId) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'userId is required'
    });
  }

  const result = await HtmlFileService.moveFile(id, newParentId || null, userId);

  if (!result.success) {
    return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json(result);
  }

  res.json(result);
}));

/**
 * POST /lowcode/api/html-files/:id/versions
 * Create new version
 */
router.post('/:id/versions', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { userId, description } = req.body;

  if (!userId) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'userId is required'
    });
  }

  const result = await HtmlFileService.createVersion(id, userId, description);

  if (!result.success) {
    return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json(result);
  }

  res.status(201).json(result);
}));

/**
 * POST /lowcode/api/html-files/:id/restore/:versionNumber
 * Restore file to specific version
 */
router.post('/:id/restore/:versionNumber', asyncHandler(async (req, res) => {
  const { id, versionNumber } = req.params;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'userId is required'
    });
  }

  const result = await HtmlFileService.restoreVersion(id, parseInt(versionNumber), userId);

  if (!result.success) {
    return res.status(result.error === 'VERSION_NOT_FOUND' ? 404 : 400).json(result);
  }

  res.json(result);
}));

module.exports = router;
