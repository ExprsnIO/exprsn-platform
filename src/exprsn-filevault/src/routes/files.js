/**
 * ═══════════════════════════════════════════════════════════════════════
 * File Routes
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const fileService = require('../services/fileService');
const versionService = require('../services/versionService');
const {
  authenticate,
  requirePermissions,
  uploadSingle,
  handleUploadError,
  validateFile,
  validateUUID,
  asyncHandler
} = require('../middleware');

/**
 * Upload file
 * POST /api/files/upload
 */
router.post('/upload',
  authenticate,
  requirePermissions({ write: true }),
  uploadSingle,
  handleUploadError,
  validateFile,
  asyncHandler(async (req, res) => {
    const file = await fileService.uploadFile({
      userId: req.userId,
      buffer: req.file.buffer,
      filename: req.file.originalname,
      path: req.body.path,
      directoryId: req.body.directoryId || null,
      tags: req.body.tags ? JSON.parse(req.body.tags) : [],
      metadata: req.body.metadata ? JSON.parse(req.body.metadata) : {},
      mimetype: req.file.mimetype
    });

    res.status(201).json({
      success: true,
      file: {
        id: file.id,
        name: file.name,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype,
        version: file.currentVersion,
        createdAt: file.createdAt
      }
    });
  })
);

/**
 * Get file metadata
 * GET /api/files/:fileId
 */
router.get('/:fileId',
  authenticate,
  validateUUID('fileId'),
  asyncHandler(async (req, res) => {
    const file = await fileService.getFile(req.params.fileId, req.userId);

    res.json({
      success: true,
      file
    });
  })
);

/**
 * Download file
 * GET /api/files/:fileId/download
 */
router.get('/:fileId/download',
  authenticate,
  requirePermissions({ read: true }),
  validateUUID('fileId'),
  asyncHandler(async (req, res) => {
    const versionNumber = req.query.version ? parseInt(req.query.version) : null;
    const { stream, file } = await fileService.downloadFileStream(
      req.params.fileId,
      req.userId,
      versionNumber
    );

    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Length', file.size);
    res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);

    stream.pipe(res);
  })
);

/**
 * Update file (new version)
 * PUT /api/files/:fileId
 */
router.put('/:fileId',
  authenticate,
  requirePermissions({ write: true }),
  validateUUID('fileId'),
  uploadSingle,
  handleUploadError,
  validateFile,
  asyncHandler(async (req, res) => {
    const file = await fileService.updateFile(
      req.params.fileId,
      req.userId,
      req.file.buffer,
      req.body.changeDescription
    );

    res.json({
      success: true,
      file: {
        id: file.id,
        name: file.name,
        version: file.currentVersion,
        size: file.size,
        updatedAt: file.updatedAt
      }
    });
  })
);

/**
 * Delete file
 * DELETE /api/files/:fileId
 */
router.delete('/:fileId',
  authenticate,
  requirePermissions({ delete: true }),
  validateUUID('fileId'),
  asyncHandler(async (req, res) => {
    await fileService.deleteFile(req.params.fileId, req.userId);

    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  })
);

/**
 * List file versions
 * GET /api/files/:fileId/versions
 */
router.get('/:fileId/versions',
  authenticate,
  validateUUID('fileId'),
  asyncHandler(async (req, res) => {
    const versions = await versionService.getFileVersions(req.params.fileId, req.userId);

    res.json({
      success: true,
      versions
    });
  })
);

/**
 * Restore file version
 * POST /api/files/:fileId/restore/:versionNumber
 */
router.post('/:fileId/restore/:versionNumber',
  authenticate,
  requirePermissions({ write: true }),
  validateUUID('fileId'),
  asyncHandler(async (req, res) => {
    const versionNumber = parseInt(req.params.versionNumber);
    const file = await versionService.restoreVersion(
      req.params.fileId,
      versionNumber,
      req.userId
    );

    res.json({
      success: true,
      file: {
        id: file.id,
        name: file.name,
        version: file.currentVersion,
        restoredFrom: versionNumber
      }
    });
  })
);

/**
 * Get version diff
 * GET /api/files/:fileId/diff
 */
router.get('/:fileId/diff',
  authenticate,
  validateUUID('fileId'),
  asyncHandler(async (req, res) => {
    const fromVersion = parseInt(req.query.from);
    const toVersion = parseInt(req.query.to);

    if (!fromVersion || !toVersion) {
      return res.status(400).json({
        error: 'MISSING_PARAMETERS',
        message: 'Both from and to version parameters are required'
      });
    }

    const diff = await versionService.getVersionDiff(
      req.params.fileId,
      fromVersion,
      toVersion,
      req.userId
    );

    res.json({
      success: true,
      diff
    });
  })
);

/**
 * List files
 * GET /api/files
 */
router.get('/',
  authenticate,
  asyncHandler(async (req, res) => {
    const files = await fileService.listFiles(req.userId, req.query.directoryId, {
      limit: parseInt(req.query.limit || '50'),
      offset: parseInt(req.query.offset || '0'),
      tags: req.query.tags ? req.query.tags.split(',') : []
    });

    res.json({
      success: true,
      files,
      count: files.length
    });
  })
);

module.exports = router;
