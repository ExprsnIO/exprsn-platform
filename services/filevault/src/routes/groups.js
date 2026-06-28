/**
 * ═══════════════════════════════════════════════════════════════════════
 * Group File Routes (Phase 3 — Galleries + shared files)
 *
 * Group-scoped file/directory access. Every route runs:
 *   authenticate            -> sets req.userId (CA token)
 *   requireGroupMembership  -> 403 non-member / 404 unknown group / 503 nexus down
 *
 * Files created here are owner_type='group' + group_id=:groupId; user_id still
 * records the uploading user for attribution.
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { requireGroupMembership } = require('@exprsn/shared');
const fileService = require('../services/fileService');
const directoryService = require('../services/directoryService');
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
 * List a group's files (gallery grid backing).
 * GET /api/groups/:groupId/files
 * Query: directoryId, images=true (image/* only) OR mimetype=<prefix>, tags, limit, offset
 * Guard: member
 */
router.get('/:groupId/files',
  authenticate,
  validateUUID('groupId'),
  requireGroupMembership(),
  asyncHandler(async (req, res) => {
    const files = await fileService.listGroupFiles(
      req.params.groupId,
      typeof req.query.directoryId !== 'undefined' ? req.query.directoryId : null,
      {
        limit: parseInt(req.query.limit || '50'),
        offset: parseInt(req.query.offset || '0'),
        imagesOnly: req.query.images === 'true',
        mimetype: req.query.mimetype || null,
        tags: req.query.tags ? req.query.tags.split(',') : []
      }
    );

    res.json({
      success: true,
      files,
      count: files.length
    });
  })
);

/**
 * Upload a file into a group.
 * POST /api/groups/:groupId/files/upload
 * Body (multipart): file, path?, directoryId?, tags?, metadata?
 * Guard: member + token write permission
 */
router.post('/:groupId/files/upload',
  authenticate,
  validateUUID('groupId'),
  requireGroupMembership(),
  requirePermissions({ write: true }),
  uploadSingle,
  handleUploadError,
  validateFile,
  asyncHandler(async (req, res) => {
    const file = await fileService.uploadGroupFile({
      groupId: req.params.groupId,
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
        ownerType: file.ownerType,
        groupId: file.groupId,
        version: file.currentVersion,
        createdAt: file.createdAt
      }
    });
  })
);

/**
 * List a group's directories + files at a level.
 * GET /api/groups/:groupId/directories
 * Query: directoryId (parent; omitted = group root)
 * Guard: member
 */
router.get('/:groupId/directories',
  authenticate,
  validateUUID('groupId'),
  requireGroupMembership(),
  asyncHandler(async (req, res) => {
    const contents = await directoryService.listGroupDirectoryContents(
      req.params.groupId,
      req.query.directoryId || null
    );

    res.json({
      success: true,
      ...contents
    });
  })
);

module.exports = router;
