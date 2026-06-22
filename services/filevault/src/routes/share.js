/**
 * ═══════════════════════════════════════════════════════════════════════
 * Share Routes
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const shareService = require('../services/shareService');
const fileService = require('../services/fileService');
const {
  authenticate,
  validateUUID,
  asyncHandler
} = require('../middleware');

/**
 * Create share link
 * POST /api/files/:fileId/share
 */
router.post('/files/:fileId/share',
  authenticate,
  validateUUID('fileId'),
  asyncHandler(async (req, res) => {
    const result = await shareService.createShareLink(
      req.params.fileId,
      req.userId,
      {
        permissions: req.body.permissions,
        expiresIn: req.body.expiresIn,
        maxUses: req.body.maxUses
      }
    );

    res.status(201).json({
      success: true,
      shareUrl: result.shareUrl,
      shareLink: result.shareLink,
      token: result.token
    });
  })
);

/**
 * Access shared file
 * GET /api/share/:shareLinkId
 */
router.get('/:shareLinkId',
  validateUUID('shareLinkId'),
  asyncHandler(async (req, res) => {
    const file = await shareService.accessSharedFile(req.params.shareLinkId);

    res.json({
      success: true,
      file
    });
  })
);

/**
 * Download shared file
 * GET /api/share/:shareLinkId/download
 */
router.get('/:shareLinkId/download',
  validateUUID('shareLinkId'),
  asyncHandler(async (req, res) => {
    const file = await shareService.accessSharedFile(req.params.shareLinkId);

    // Get file stream without requiring authentication
    const { stream } = await fileService.downloadFileStream(file.id, file.userId);

    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Length', file.size);
    res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);

    stream.pipe(res);
  })
);

/**
 * Revoke share link
 * DELETE /api/share/:shareLinkId
 */
router.delete('/:shareLinkId',
  authenticate,
  validateUUID('shareLinkId'),
  asyncHandler(async (req, res) => {
    await shareService.revokeShareLink(req.params.shareLinkId, req.userId);

    res.json({
      success: true,
      message: 'Share link revoked successfully'
    });
  })
);

/**
 * List share links for file
 * GET /api/files/:fileId/shares
 */
router.get('/files/:fileId/shares',
  authenticate,
  validateUUID('fileId'),
  asyncHandler(async (req, res) => {
    const shareLinks = await shareService.listShareLinks(req.params.fileId, req.userId);

    res.json({
      success: true,
      shareLinks,
      count: shareLinks.length
    });
  })
);

/**
 * List all user's share links
 * GET /api/share
 */
router.get('/',
  authenticate,
  asyncHandler(async (req, res) => {
    const shareLinks = await shareService.listUserShareLinks(req.userId, {
      limit: parseInt(req.query.limit || '50'),
      offset: parseInt(req.query.offset || '0')
    });

    res.json({
      success: true,
      shareLinks,
      count: shareLinks.length
    });
  })
);

module.exports = router;
