/**
 * ═══════════════════════════════════════════════════════════════════════
 * Media Routes
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const Media = require('../models/Media');
const Album = require('../models/Album');
const mediaService = require('../services/mediaService');
const albumService = require('../services/albumService');
const timelineService = require('../services/timelineService');
const { requireToken, auditAction } = require('../middleware/auth');
const logger = require('../utils/logger');
const config = require('../config');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.upload.maxFileSize
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
 * POST /api/albums/:albumId/media - Upload media to album
 */
router.post('/albums/:albumId/media',
  requireToken({ write: true }),
  upload.array('files', 10), // Max 10 files at once
  auditAction('media_uploaded', 'media'),
  async (req, res) => {
    try {
      const { albumId } = req.params;
      const files = req.files;

      if (!files || files.length === 0) {
        return res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'No files provided'
        });
      }

      // Check album access
      const access = await albumService.checkAccess(albumId, req.userId, 'write');
      if (!access.hasAccess) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Cannot upload to this album'
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

          // Check for duplicate
          const contentHash = mediaService.calculateHash(file.buffer);
          const duplicate = await mediaService.findDuplicate(contentHash);

          if (duplicate) {
            logger.info('Duplicate media found', {
              originalId: duplicate.id,
              filename: file.originalname
            });
            // Optionally, still create a reference to the duplicate
          }

          // Save media file first
          const storagePath = await mediaService.saveMediaFile(file.buffer, file.originalname);

          // Create media record (to get ID)
          const media = await Media.create({
            albumId,
            uploaderId: req.userId,
            filename: file.originalname,
            originalFilename: file.originalname,
            mediaType,
            mimetype: file.mimetype,
            size: file.size,
            storagePath,
            storageBackend: config.media.storageBackend,
            status: 'pending', // Will be updated after processing
            contentHash: contentHash
          });

          // Process based on media type
          let processed;
          if (mediaType === 'image') {
            processed = await mediaService.processImage(file.buffer, {
              filename: file.originalname,
              mimetype: file.mimetype
            });

            // Update with image processing results
            await Media.update(media.id, {
              width: processed.width,
              height: processed.height,
              status: 'ready',
              thumbnails: processed.thumbnails || [],
              exifData: processed.exifData,
              takenAt: processed.exifData?.dateTime || null,
              locationLat: processed.exifData?.gps?.latitude || null,
              locationLon: processed.exifData?.gps?.longitude || null
            });

          } else if (mediaType === 'video') {
            // Queue video processing (background)
            processed = await mediaService.processVideo(
              file.buffer,
              {
                filename: file.originalname,
                mimetype: file.mimetype
              },
              storagePath,
              media.id
            );

            // Update with basic video info
            await Media.update(media.id, {
              width: processed.width,
              height: processed.height,
              duration: processed.duration,
              status: 'processing' // Background worker will update to 'ready'
            });
          }

          mediaItems.push(media);

          // Optionally post to timeline
          if (req.body.postToTimeline === 'true') {
            await timelineService.autoPostMediaUpload(media.id, req.userId, {
              autoPost: true,
              caption: req.body.caption,
              visibility: req.body.visibility || 'public'
            });
          }

        } catch (error) {
          logger.error('Error processing file:', {
            filename: file.originalname,
            error: error.message
          });

          errors.push({
            filename: file.originalname,
            error: error.message
          });
        }
      }

      res.status(201).json({
        success: true,
        media: mediaItems,
        errors: errors.length > 0 ? errors : undefined
      });

    } catch (error) {
      logger.error('Upload media error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to upload media'
      });
    }
  }
);

/**
 * GET /api/media/:id - Get media metadata
 */
router.get('/:id',
  requireToken({ read: true }),
  auditAction('media_viewed', 'media'),
  async (req, res) => {
    try {
      const { id } = req.params;

      const media = await Media.getWithAlbum(id);

      if (!media) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Media not found'
        });
      }

      // Check album access
      const access = await albumService.checkAccess(media.album_id, req.userId, 'read');
      if (!access.hasAccess) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Access denied'
        });
      }

      // Increment view count
      await Media.incrementViewCount(id);

      res.json({ media });

    } catch (error) {
      logger.error('Get media error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to get media'
      });
    }
  }
);

/**
 * GET /api/media/:id/view - View/download media file
 */
router.get('/:id/view',
  requireToken({ read: true }),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { size = 'original', download = false } = req.query;

      const media = await Media.getWithAlbum(id);

      if (!media) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Media not found'
        });
      }

      // Check album access
      const access = await albumService.checkAccess(media.album_id, req.userId, 'read');
      if (!access.hasAccess) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Access denied'
        });
      }

      // Get appropriate file path
      let filePath;
      if (size === 'original') {
        filePath = media.storage_path;
      } else {
        const thumbnail = media.thumbnails?.find(t => t.size === size);
        if (thumbnail) {
          filePath = thumbnail.path;
        } else {
          return res.status(400).json({
            error: 'BAD_REQUEST',
            message: 'Invalid size parameter'
          });
        }
      }

      // Increment view/download count
      if (download === 'true') {
        await Media.incrementDownloadCount(id);
      } else {
        await Media.incrementViewCount(id);
      }

      // Send file
      res.sendFile(filePath, {
        headers: {
          'Content-Type': media.mimetype,
          'Content-Disposition': download === 'true'
            ? `attachment; filename="${media.filename}"`
            : 'inline'
        }
      });

    } catch (error) {
      logger.error('View media error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to view media'
      });
    }
  }
);

/**
 * PUT /api/media/:id - Update media metadata
 */
router.put('/:id',
  requireToken({ update: true }),
  auditAction('media_updated', 'media'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const media = await Media.getWithAlbum(id);

      if (!media) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Media not found'
        });
      }

      // Check album access
      const access = await albumService.checkAccess(media.album_id, req.userId, 'write');
      if (!access.hasAccess) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Access denied'
        });
      }

      const updated = await Media.update(id, updates);

      res.json({ media: updated });

    } catch (error) {
      logger.error('Update media error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to update media'
      });
    }
  }
);

/**
 * DELETE /api/media/:id - Delete media
 */
router.delete('/:id',
  requireToken({ delete: true }),
  auditAction('media_deleted', 'media'),
  async (req, res) => {
    try {
      const { id } = req.params;

      const media = await Media.getWithAlbum(id);

      if (!media) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Media not found'
        });
      }

      // Check album access
      const access = await albumService.checkAccess(media.album_id, req.userId, 'write');
      if (!access.hasAccess) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Access denied'
        });
      }

      // Delete files
      await mediaService.deleteMediaFile(media.storage_path);
      await mediaService.deleteThumbnails(media.thumbnails || []);

      // Soft delete from database
      await Media.delete(id);

      res.json({
        success: true,
        message: 'Media deleted'
      });

    } catch (error) {
      logger.error('Delete media error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to delete media'
      });
    }
  }
);

/**
 * GET /api/media/:id/status - Get media processing status
 */
router.get('/:id/status',
  requireToken({ read: true }),
  async (req, res) => {
    try {
      const { id } = req.params;

      const media = await Media.findById(id);

      if (!media) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Media not found'
        });
      }

      // Check access
      const access = await albumService.checkAccess(media.album_id, req.userId, 'read');
      if (!access.hasAccess) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Access denied'
        });
      }

      res.json({
        mediaId: id,
        status: media.status,
        processingError: media.processing_error || null,
        progress: {
          isPending: media.status === 'pending',
          isProcessing: media.status === 'processing',
          isReady: media.status === 'ready',
          isFailed: media.status === 'failed'
        },
        metadata: media.status === 'ready' ? {
          width: media.width,
          height: media.height,
          duration: media.duration,
          thumbnails: media.thumbnails
        } : null
      });

    } catch (error) {
      logger.error('Get media status error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to get media status'
      });
    }
  }
);

/**
 * POST /api/media/:id/timeline - Post media to timeline
 */
router.post('/:id/timeline',
  requireToken({ write: true }),
  auditAction('media_posted_to_timeline', 'media'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { caption, visibility } = req.body;

      const media = await Media.getWithAlbum(id);

      if (!media) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Media not found'
        });
      }

      // Post to timeline
      const post = await timelineService.postMediaToTimeline(id, req.userId, {
        caption,
        visibility,
        token: tokenService.extractToken(req)
      });

      if (!post) {
        return res.status(500).json({
          error: 'TIMELINE_ERROR',
          message: 'Failed to post to timeline'
        });
      }

      res.json({
        success: true,
        post
      });

    } catch (error) {
      logger.error('Post media to timeline error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to post to timeline'
      });
    }
  }
);

module.exports = router;
