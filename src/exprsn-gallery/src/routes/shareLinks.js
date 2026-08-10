/**
 * ═══════════════════════════════════════════════════════════════════════
 * Share Links Routes
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const bcrypt = require('bcrypt');
const ShareLink = require('../models/ShareLink');
const Album = require('../models/Album');
const Media = require('../models/Media');
const { requireToken, auditAction } = require('../middleware/auth');
const mediaService = require('../services/mediaService');
const logger = require('../utils/logger');
const config = require('../config');

// Configure multer for file uploads via share links
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.upload?.maxFileSize || 100 * 1024 * 1024 // 100MB default
  },
  fileFilter: (req, file, cb) => {
    if (mediaService.validateFileFormat(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file format'));
    }
  }
});

/**
 * POST /api/share/albums/:albumId - Create share link for album
 */
router.post('/albums/:albumId',
  requireToken({ write: true }),
  auditAction('share_link_created', 'share_link'),
  async (req, res) => {
    try {
      const { albumId } = req.params;
      const {
        password,
        maxViews,
        expiresAt,
        allowDownload = true,
        allowUpload = false,
        permissions = 'view'
      } = req.body;

      // Verify album ownership
      const album = await Album.findById(albumId);
      if (!album) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Album not found'
        });
      }

      if (album.owner_id !== req.userId) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Only album owner can create share links'
        });
      }

      // Hash password if provided
      let passwordHash = null;
      if (password) {
        passwordHash = await bcrypt.hash(password, config.security.bcryptRounds || 10);
      }

      // Parse expiration date
      let expiresAtDate = null;
      if (expiresAt) {
        expiresAtDate = new Date(expiresAt);
        if (isNaN(expiresAtDate.getTime())) {
          return res.status(400).json({
            error: 'BAD_REQUEST',
            message: 'Invalid expiration date'
          });
        }
      }

      // Create share link
      const shareLink = await ShareLink.create({
        albumId,
        caTokenId: req.tokenId || null,
        createdBy: req.userId,
        passwordHash,
        maxViews: maxViews ? parseInt(maxViews) : null,
        allowDownload,
        allowUpload,
        expiresAt: expiresAtDate
      });

      // Return share link (without password hash)
      const response = { ...shareLink };
      delete response.password_hash;

      // Build full share URL
      const shareUrl = `${config.service.baseUrl || `http://${config.service.host}:${config.service.port}`}/api/share/${shareLink.share_code}`;
      response.share_url = shareUrl;

      res.status(201).json({ shareLink: response });

    } catch (error) {
      logger.error('Create share link error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to create share link'
      });
    }
  }
);

/**
 * GET /api/share/:shareCode - Access shared album
 */
router.get('/:shareCode', async (req, res) => {
  try {
    const { shareCode } = req.params;
    const { password } = req.query;

    // Find share link
    const shareLink = await ShareLink.findByShareCode(shareCode);

    if (!shareLink) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Share link not found'
      });
    }

    // Check if link is valid
    const validation = await ShareLink.isValid(shareCode);
    if (!validation.valid) {
      return res.status(410).json({
        error: validation.reason,
        message: this._getValidationMessage(validation.reason)
      });
    }

    // Check password if required
    if (shareLink.password_hash) {
      if (!password) {
        return res.status(401).json({
          error: 'PASSWORD_REQUIRED',
          message: 'This share link is password protected',
          requiresPassword: true
        });
      }

      const passwordValid = await bcrypt.compare(password, shareLink.password_hash);
      if (!passwordValid) {
        return res.status(401).json({
          error: 'INVALID_PASSWORD',
          message: 'Incorrect password'
        });
      }
    }

    // Increment view count
    await ShareLink.incrementViewCount(shareLink.id);

    // Load album with media
    const album = await Album.findById(shareLink.album_id);
    if (!album) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Album not found'
      });
    }

    const media = await Media.findByAlbum(shareLink.album_id);

    // Remove sensitive data
    const cleanedShareLink = { ...shareLink };
    delete cleanedShareLink.password_hash;
    delete cleanedShareLink.ca_token_id;

    res.json({
      shareLink: cleanedShareLink,
      album,
      media,
      permissions: {
        view: true,
        download: shareLink.allow_download,
        upload: shareLink.allow_upload
      }
    });

  } catch (error) {
    logger.error('Access share link error:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to access share link'
    });
  }
});

/**
 * GET /api/share/albums/:albumId/links - List share links for album
 */
router.get('/albums/:albumId/links',
  requireToken({ read: true }),
  async (req, res) => {
    try {
      const { albumId } = req.params;
      const { includeExpired = false } = req.query;

      // Verify album ownership
      const album = await Album.findById(albumId);
      if (!album) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Album not found'
        });
      }

      if (album.owner_id !== req.userId) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Access denied'
        });
      }

      // Get share links
      const shareLinks = await ShareLink.findByAlbum(albumId, {
        includeExpired: includeExpired === 'true'
      });

      // Remove password hashes
      const cleanedLinks = shareLinks.map(link => {
        const cleaned = { ...link };
        delete cleaned.password_hash;

        // Build full share URL
        const shareUrl = `${config.service.baseUrl || `http://${config.service.host}:${config.service.port}`}/api/share/${link.share_code}`;
        cleaned.share_url = shareUrl;

        return cleaned;
      });

      res.json({ shareLinks: cleanedLinks });

    } catch (error) {
      logger.error('List share links error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to list share links'
      });
    }
  }
);

/**
 * PUT /api/share/:shareId - Update share link
 */
router.put('/:shareId',
  requireToken({ update: true }),
  auditAction('share_link_updated', 'share_link'),
  async (req, res) => {
    try {
      const { shareId } = req.params;
      const updates = req.body;

      const shareLink = await ShareLink.findById(shareId);

      if (!shareLink) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Share link not found'
        });
      }

      if (shareLink.created_by !== req.userId) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Access denied'
        });
      }

      // Handle password update
      if (updates.password) {
        updates.passwordHash = await bcrypt.hash(
          updates.password,
          config.security.bcryptRounds || 10
        );
        delete updates.password;
      }

      // Parse expiration date
      if (updates.expiresAt) {
        const expiresAtDate = new Date(updates.expiresAt);
        if (isNaN(expiresAtDate.getTime())) {
          return res.status(400).json({
            error: 'BAD_REQUEST',
            message: 'Invalid expiration date'
          });
        }
        updates.expiresAt = expiresAtDate;
      }

      // Update share link
      const updated = await ShareLink.update(shareId, updates);

      // Remove password hash from response
      const response = { ...updated };
      delete response.password_hash;

      res.json({ shareLink: response });

    } catch (error) {
      logger.error('Update share link error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to update share link'
      });
    }
  }
);

/**
 * DELETE /api/share/:shareId - Revoke share link
 */
router.delete('/:shareId',
  requireToken({ delete: true }),
  auditAction('share_link_revoked', 'share_link'),
  async (req, res) => {
    try {
      const { shareId } = req.params;
      const { reason } = req.body;

      const shareLink = await ShareLink.findById(shareId);

      if (!shareLink) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Share link not found'
        });
      }

      if (shareLink.created_by !== req.userId) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Access denied'
        });
      }

      // Revoke share link
      await ShareLink.revoke(shareId, req.userId, reason);

      res.json({
        success: true,
        message: 'Share link revoked'
      });

    } catch (error) {
      logger.error('Revoke share link error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to revoke share link'
      });
    }
  }
);

/**
 * GET /api/share/user/links - Get all share links created by user
 */
router.get('/user/links',
  requireToken({ read: true }),
  async (req, res) => {
    try {
      const { limit = 50, offset = 0 } = req.query;

      const shareLinks = await ShareLink.getActiveByUser(req.userId, {
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      // Remove password hashes and build URLs
      const cleanedLinks = shareLinks.map(link => {
        const cleaned = { ...link };
        delete cleaned.password_hash;

        const shareUrl = `${config.service.baseUrl || `http://${config.service.host}:${config.service.port}`}/api/share/${link.share_code}`;
        cleaned.share_url = shareUrl;

        return cleaned;
      });

      res.json({ shareLinks: cleanedLinks });

    } catch (error) {
      logger.error('Get user share links error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to get share links'
      });
    }
  }
);

/**
 * POST /api/share/:shareCode/upload - Upload media to shared album (if allowed)
 */
router.post('/:shareCode/upload',
  upload.array('files', 10), // Max 10 files at once
  async (req, res) => {
    try {
      const { shareCode } = req.params;
      const { password } = req.body;

      // Validate share link
      const shareLink = await ShareLink.findByShareCode(shareCode);
      if (!shareLink) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Share link not found'
        });
      }

      // Check if valid and upload is allowed
      const validation = await ShareLink.isValid(shareCode);
      if (!validation.valid) {
        return res.status(410).json({
          error: validation.reason,
          message: this._getValidationMessage(validation.reason)
        });
      }

      if (!shareLink.allow_upload) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Upload not allowed for this share link'
        });
      }

      // Check password if required
      if (shareLink.password_hash) {
        if (!password) {
          return res.status(401).json({
            error: 'PASSWORD_REQUIRED',
            message: 'Password required'
          });
        }

        const passwordValid = await bcrypt.compare(password, shareLink.password_hash);
        if (!passwordValid) {
          return res.status(401).json({
            error: 'INVALID_PASSWORD',
            message: 'Incorrect password'
          });
        }
      }

      // Handle actual file upload
      const files = req.files;

      if (!files || files.length === 0) {
        return res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'No files provided'
        });
      }

      const mediaItems = [];
      const errors = [];

      for (const file of files) {
        try {
          const mediaType = mediaService.getMediaType(file.mimetype);

          // Validate file size
          if (!mediaService.validateFileSize(file.size, mediaType)) {
            errors.push({
              filename: file.originalname,
              error: 'File too large'
            });
            continue;
          }

          // Calculate hash for deduplication
          const contentHash = mediaService.calculateHash(file.buffer);

          // Save media file
          const storagePath = await mediaService.saveMediaFile(file.buffer, file.originalname);

          // Create media record
          const media = await Media.create({
            albumId: shareLink.album_id,
            uploaderId: null, // Anonymous upload via share link
            filename: file.originalname,
            originalFilename: file.originalname,
            mediaType,
            mimetype: file.mimetype,
            fileSize: file.size,
            storagePath,
            contentHash,
            processingStatus: 'pending',
            uploadSource: 'share_link',
            shareCode: shareCode
          });

          // Queue processing job
          if (mediaType === 'image') {
            await mediaService.queueImageProcessing(media.id);
          } else if (mediaType === 'video') {
            await mediaService.queueVideoProcessing(media.id);
          }

          mediaItems.push({
            id: media.id,
            filename: media.filename,
            mediaType: media.mediaType,
            fileSize: media.fileSize,
            processingStatus: media.processingStatus
          });

          logger.info('Media uploaded via share link', {
            mediaId: media.id,
            albumId: shareLink.album_id,
            shareCode: shareCode,
            filename: file.originalname
          });

        } catch (error) {
          logger.error('Failed to process file via share link', {
            filename: file.originalname,
            error: error.message
          });
          errors.push({
            filename: file.originalname,
            error: error.message
          });
        }
      }

      res.json({
        message: `Successfully uploaded ${mediaItems.length} file(s)`,
        albumId: shareLink.album_id,
        uploaded: mediaItems,
        errors: errors.length > 0 ? errors : undefined
      });

    } catch (error) {
      logger.error('Share link upload error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to upload'
      });
    }
  }
);

/**
 * Helper: Get validation error message
 * @private
 */
function _getValidationMessage(reason) {
  const messages = {
    'NOT_FOUND': 'Share link not found',
    'INACTIVE': 'Share link is no longer active',
    'EXPIRED': 'Share link has expired',
    'MAX_VIEWS_REACHED': 'Share link has reached maximum view count'
  };
  return messages[reason] || 'Share link is not valid';
}

module.exports = router;
