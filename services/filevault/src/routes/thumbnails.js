/**
 * ═══════════════════════════════════════════════════════════════════════
 * Thumbnail Routes (Phase 3 — Galleries + shared files)
 *
 * Serves the generated thumbnail bytes for a file. Thumbnails are produced by
 * thumbnailService.generateThumbnails() but, until now, no HTTP route exposed
 * them.
 *
 * AUTH SPLIT (per file owner_type — groupId is resolved from the file, not the
 * URL, so the requireGroupMembership() middleware can't be used directly):
 *   - owner_type='group' : requester must be a member of the file's group
 *     (resolveMembership). 403 non-member, 404 unknown group, 503 nexus down.
 *   - owner_type='user'  : requester must be the owner, OR a platform admin, OR
 *     the file's visibility is 'shared'/'public'. Mirrors fileService.getFile().
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { resolveMembership } = require('@exprsn/shared/middleware/groupMembership');
const thumbnailService = require('../services/thumbnailService');
const { File, FileModeration } = require('../models');
const imageModeration = require('../services/imageModerationService');
const {
  authenticate,
  validateUUID,
  asyncHandler
} = require('../middleware');

const VALID_SIZES = ['small', 'medium', 'large'];

/**
 * Get a file's thumbnail bytes.
 * GET /api/thumbnails/:fileId?size=small|medium|large  (default: medium)
 * Response: 200 image/jpeg (raw bytes) | 404 if file/thumbnail missing |
 *           403 if unauthorized | 503 if membership service unavailable
 */
router.get('/:fileId',
  authenticate,
  validateUUID('fileId'),
  asyncHandler(async (req, res) => {
    const size = VALID_SIZES.includes(req.query.size) ? req.query.size : 'medium';

    const file = await File.findOne({
      where: { id: req.params.fileId, isDeleted: false },
      include: [{ model: FileModeration, as: 'moderation' }]
    });

    if (!file) {
      return res.status(404).json({ error: 'FILE_NOT_FOUND', message: 'File not found' });
    }

    // FEAT-031: this route queries File directly rather than going through
    // fileService.getFile, so it needs its own fail-closed visibility check —
    // a thumbnail of a held image is still the image.
    if (!imageModeration.canServe(file, file.moderation, req.userId)) {
      return res.status(404).json({ error: 'FILE_NOT_FOUND', message: 'File not found' });
    }

    // Authorize per owner type.
    if (file.ownerType === 'group') {
      const membership = await resolveMembership(file.groupId, req.userId);
      if (membership._error === 'not_found') {
        return res.status(404).json({ error: 'GROUP_NOT_FOUND', message: 'Group not found' });
      }
      if (membership._error === 'unavailable') {
        return res.status(503).json({
          error: 'MEMBERSHIP_SERVICE_UNAVAILABLE',
          message: 'Unable to verify group membership'
        });
      }
      if (!membership.isMember) {
        return res.status(403).json({
          error: 'NOT_GROUP_MEMBER',
          message: 'You must be a member of this group'
        });
      }
    } else {
      const isOwner = file.userId === req.userId;
      const isShared = file.visibility === 'shared' || file.visibility === 'public';
      if (!isOwner && !isShared && !req.isPlatformAdmin) {
        return res.status(403).json({
          error: 'INSUFFICIENT_PERMISSIONS',
          message: 'You do not have access to this file'
        });
      }
    }

    const result = await thumbnailService.getThumbnailBuffer(req.params.fileId, size);
    if (!result) {
      return res.status(404).json({
        error: 'THUMBNAIL_NOT_FOUND',
        message: `No ${size} thumbnail for this file`
      });
    }

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Length', result.buffer.length);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(result.buffer);
  })
);

module.exports = router;
