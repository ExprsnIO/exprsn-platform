/**
 * ═══════════════════════════════════════════════════════════════════════
 * Share Routes
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const shareService = require('../services/shareService');
const fileService = require('../services/fileService');
const { FileModeration } = require('../models');
const imageModeration = require('../services/imageModerationService');

/**
 * FEAT-031 fail-closed visibility for the anonymous share paths.
 *
 * These routes intentionally pass the file OWNER's id into `downloadFileStream`
 * so `getFile`'s private-visibility check passes for a shared private file — but
 * that also makes the visitor look like the uploader, whose moderation exemption
 * must NOT apply. So the moderation state is asserted here, separately.
 *
 * A held image 404s exactly like a missing one: it must not be enumerable.
 */
async function assertShareableImage(fileId) {
  const moderation = await FileModeration.findOne({ where: { fileId } });
  if (!imageModeration.isServableToOthers(moderation)) {
    const err = new Error('FILE_NOT_FOUND');
    err.statusCode = 404;
    throw err;
  }
}
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
 * Mint a file-scoped access token (Vault-style direct access, no share-link row).
 * POST /api/share/files/:fileId/access-token   { expiresIn?, permissions? }
 */
router.post('/files/:fileId/access-token',
  authenticate,
  validateUUID('fileId'),
  asyncHandler(async (req, res) => {
    const result = await shareService.createFileAccessToken(
      req.params.fileId,
      req.userId,
      { expiresIn: req.body.expiresIn, permissions: req.body.permissions }
    );

    res.status(201).json({
      success: true,
      tokenId: result.tokenId,
      expiresAt: result.expiresAt,
      permissions: result.permissions,
      downloadUrl: `/filevault/api/share/file/${req.params.fileId}/download?token=${result.tokenId}`
    });
  })
);

/**
 * Direct token download of a single file (no share link). PUBLIC: the file-scoped
 * CA token in ?token= is the capability.
 * GET /api/share/file/:fileId/download?token=<tokenId>
 */
router.get('/file/:fileId/download',
  validateUUID('fileId'),
  asyncHandler(async (req, res) => {
    const file = await shareService.accessFileByToken(req.params.fileId, req.query.token);

    await assertShareableImage(file.id); // FEAT-031 — see the note below

    const { stream } = await fileService.downloadFileStream(file.id, file.userId);
    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Length', file.size);
    res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
    stream.pipe(res);
  })
);

/**
 * Share-link metadata (does NOT consume a use). PUBLIC, but the matching token
 * is required.
 * GET /api/share/:shareLinkId?token=<tokenId>
 */
router.get('/:shareLinkId',
  validateUUID('shareLinkId'),
  asyncHandler(async (req, res) => {
    const shareLink = await shareService.getShareLink(req.params.shareLinkId, req.query.token);

    // FEAT-031 / BUG-020: a held image must not be enumerable. The download
    // variants already gate on moderation state; this metadata view leaked the
    // file's name/size/mimetype for a held image, disclosing its existence to a
    // share-link holder. 404 it exactly like the download path does.
    if (shareLink.file && shareLink.file.id) {
      await assertShareableImage(shareLink.file.id);
    }

    res.json({
      success: true,
      file: shareLink.file
    });
  })
);

/**
 * Download shared file (consumes a use). PUBLIC, but the matching token is required.
 * GET /api/share/:shareLinkId/download?token=<tokenId>
 */
router.get('/:shareLinkId/download',
  validateUUID('shareLinkId'),
  asyncHandler(async (req, res) => {
    const file = await shareService.accessSharedFile(req.params.shareLinkId, req.query.token);

    // FEAT-031: a share link authorizes access, but the visitor is NOT the
    // uploader, so a held image must not be served. This is checked explicitly
    // rather than by passing a null userId below, because `getFile` uses that
    // same id for its private-visibility check — nulling it would break share
    // links for private files.
    await assertShareableImage(file.id);

    // Get file stream without requiring authentication.
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
