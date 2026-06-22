/**
 * ═══════════════════════════════════════════════════════════════════════
 * Directory Routes
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const directoryService = require('../services/directoryService');
const {
  authenticate,
  requirePermissions,
  validateUUID,
  validateBody,
  asyncHandler
} = require('../middleware');

/**
 * Create directory
 * POST /api/directories
 */
router.post('/',
  authenticate,
  requirePermissions({ write: true }),
  validateBody(['name']),
  asyncHandler(async (req, res) => {
    const directory = await directoryService.createDirectory(
      req.userId,
      req.body.name,
      req.body.parentId || null
    );

    res.status(201).json({
      success: true,
      directory
    });
  })
);

/**
 * Get directory
 * GET /api/directories/:directoryId
 */
router.get('/:directoryId',
  authenticate,
  validateUUID('directoryId'),
  asyncHandler(async (req, res) => {
    const directory = await directoryService.getDirectory(req.params.directoryId, req.userId);

    res.json({
      success: true,
      directory
    });
  })
);

/**
 * List directory contents
 * GET /api/directories
 */
router.get('/',
  authenticate,
  asyncHandler(async (req, res) => {
    const contents = await directoryService.listDirectoryContents(
      req.userId,
      req.query.directoryId || null
    );

    res.json({
      success: true,
      ...contents
    });
  })
);

/**
 * Rename directory
 * PUT /api/directories/:directoryId/rename
 */
router.put('/:directoryId/rename',
  authenticate,
  requirePermissions({ write: true }),
  validateUUID('directoryId'),
  validateBody(['name']),
  asyncHandler(async (req, res) => {
    const directory = await directoryService.renameDirectory(
      req.params.directoryId,
      req.userId,
      req.body.name
    );

    res.json({
      success: true,
      directory
    });
  })
);

/**
 * Move directory
 * PUT /api/directories/:directoryId/move
 */
router.put('/:directoryId/move',
  authenticate,
  requirePermissions({ write: true }),
  validateUUID('directoryId'),
  asyncHandler(async (req, res) => {
    const directory = await directoryService.moveDirectory(
      req.params.directoryId,
      req.userId,
      req.body.newParentId || null
    );

    res.json({
      success: true,
      directory
    });
  })
);

/**
 * Delete directory
 * DELETE /api/directories/:directoryId
 */
router.delete('/:directoryId',
  authenticate,
  requirePermissions({ delete: true }),
  validateUUID('directoryId'),
  asyncHandler(async (req, res) => {
    const recursive = req.query.recursive === 'true';

    await directoryService.deleteDirectory(
      req.params.directoryId,
      req.userId,
      recursive
    );

    res.json({
      success: true,
      message: 'Directory deleted successfully'
    });
  })
);

module.exports = router;
