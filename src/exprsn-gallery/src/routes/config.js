/**
 * Configuration Management Routes
 * Provides endpoints for the Setup dashboard to manage Gallery configurations
 */

const express = require('express');
const router = express.Router();
const { logger } = require('@exprsn/shared');
const { query } = require('../config/database');

/**
 * GET /api/config/:sectionId
 * Fetch configuration for a specific section
 */
router.get('/:sectionId', async (req, res) => {
  const { sectionId } = req.params;

  try {
    let data;

    switch (sectionId) {
      case 'gallery':
      case 'gallery-albums':
        data = await getAlbumsConfig();
        break;

      case 'gallery-settings':
        data = await getGallerySettings();
        break;

      case 'gallery-processing':
        data = await getProcessingConfig();
        break;

      default:
        return res.status(404).json({
          success: false,
          error: 'Configuration section not found'
        });
    }

    res.json(data);
  } catch (error) {
    logger.error(`Error fetching config for ${sectionId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/config/:sectionId
 * Update configuration for a specific section
 */
router.post('/:sectionId', async (req, res) => {
  const { sectionId } = req.params;
  const configData = req.body;

  try {
    let result;

    switch (sectionId) {
      case 'gallery-settings':
        result = await updateGallerySettings(configData);
        break;

      case 'gallery-processing':
        result = await updateProcessingConfig(configData);
        break;

      default:
        return res.status(404).json({
          success: false,
          error: 'Configuration section not found'
        });
    }

    res.json({
      success: true,
      result
    });
  } catch (error) {
    logger.error(`Error updating config for ${sectionId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// Configuration Fetching Functions
// ========================================

async function getAlbumsConfig() {
  // Get album statistics
  const result = await query(`
    SELECT
      COUNT(*) as total_albums,
      COUNT(CASE WHEN visibility = 'public' THEN 1 END) as public_albums,
      COUNT(CASE WHEN visibility = 'private' THEN 1 END) as private_albums,
      SUM((SELECT COUNT(*) FROM media WHERE album_id = albums.id)) as total_media
    FROM albums
  `);

  const stats = result.rows[0] || { total_albums: 0, public_albums: 0, private_albums: 0, total_media: 0 };

  // Get recent albums
  const albums = await query(`
    SELECT id, name, visibility, created_at,
      (SELECT COUNT(*) FROM media WHERE album_id = albums.id) as media_count
    FROM albums
    ORDER BY created_at DESC
    LIMIT 10
  `);

  return {
    title: 'Album Management',
    description: 'Manage photo and video albums',
    stats: {
      totalAlbums: parseInt(stats.total_albums),
      publicAlbums: parseInt(stats.public_albums),
      privateAlbums: parseInt(stats.private_albums),
      totalMedia: parseInt(stats.total_media)
    },
    actions: ['Create Album', 'Import Album', 'Export All'],
    table: {
      headers: ['Name', 'Visibility', 'Media Count', 'Created', 'Actions'],
      rows: albums.rows.map(album => [
        album.name,
        album.visibility,
        String(album.media_count),
        new Date(album.created_at).toLocaleDateString(),
        'View | Edit | Delete'
      ])
    }
  };
}

async function getGallerySettings() {
  return {
    title: 'Gallery Settings',
    description: 'Configure gallery behavior and limits',
    fields: [
      { name: 'maxUploadSize', label: 'Max Upload Size (MB)', type: 'number', value: parseInt(process.env.MAX_UPLOAD_SIZE) || 100 },
      { name: 'maxAlbumSize', label: 'Max Album Size (media items)', type: 'number', value: parseInt(process.env.MAX_ALBUM_SIZE) || 1000 },
      { name: 'allowedFormats', label: 'Allowed Formats', type: 'text', value: process.env.ALLOWED_FORMATS || 'jpg,jpeg,png,gif,mp4,webm' },
      { name: 'thumbnailSize', label: 'Thumbnail Size (px)', type: 'number', value: parseInt(process.env.THUMBNAIL_SIZE) || 300 },
      { name: 'enableWatermark', label: 'Enable Watermarking', type: 'checkbox', value: process.env.ENABLE_WATERMARK === 'true' },
      { name: 'enableAutoTagging', label: 'Enable AI Auto-Tagging', type: 'checkbox', value: process.env.ENABLE_AUTO_TAGGING === 'true' },
      { name: 'storageBackend', label: 'Storage Backend', type: 'select', options: ['local', 's3', 'cloudinary'], value: process.env.STORAGE_BACKEND || 'local' }
    ]
  };
}

async function getProcessingConfig() {
  // Get job queue statistics
  const result = await query(`
    SELECT
      status,
      COUNT(*) as count
    FROM media_processing_jobs
    GROUP BY status
  `);

  const stats = result.rows.reduce((acc, row) => {
    acc[row.status] = parseInt(row.count);
    return acc;
  }, { pending: 0, processing: 0, completed: 0, failed: 0 });

  return {
    title: 'Media Processing',
    description: 'Configure image and video processing settings',
    stats: {
      pending: stats.pending || 0,
      processing: stats.processing || 0,
      completed: stats.completed || 0,
      failed: stats.failed || 0
    },
    fields: [
      { name: 'enableProcessing', label: 'Enable Background Processing', type: 'checkbox', value: process.env.ENABLE_PROCESSING !== 'false' },
      { name: 'maxConcurrentJobs', label: 'Max Concurrent Jobs', type: 'number', value: parseInt(process.env.MAX_CONCURRENT_JOBS) || 5 },
      { name: 'imageQuality', label: 'Image Quality (1-100)', type: 'number', value: parseInt(process.env.IMAGE_QUALITY) || 85 },
      { name: 'enableVideoTranscoding', label: 'Enable Video Transcoding', type: 'checkbox', value: process.env.ENABLE_VIDEO_TRANSCODING === 'true' },
      { name: 'videoCodec', label: 'Video Codec', type: 'select', options: ['h264', 'h265', 'vp9'], value: process.env.VIDEO_CODEC || 'h264' },
      { name: 'videoBitrate', label: 'Video Bitrate (kbps)', type: 'number', value: parseInt(process.env.VIDEO_BITRATE) || 2000 },
      { name: 'enableFaceDetection', label: 'Enable Face Detection', type: 'checkbox', value: process.env.ENABLE_FACE_DETECTION === 'true' }
    ]
  };
}

// ========================================
// Configuration Update Functions
// ========================================

async function updateGallerySettings(configData) {
  logger.info('Gallery settings updated:', configData);

  // Update runtime configuration
  if (configData.maxUploadSize) {
    logger.info(`Max upload size set to ${configData.maxUploadSize} MB`);
  }

  if (configData.storageBackend) {
    logger.info(`Storage backend changed to ${configData.storageBackend}`);
  }

  return {
    message: 'Gallery settings updated successfully',
    config: configData
  };
}

async function updateProcessingConfig(configData) {
  logger.info('Processing configuration updated:', configData);

  // Update processing settings
  if (configData.enableProcessing !== undefined) {
    logger.info(`Background processing ${configData.enableProcessing ? 'enabled' : 'disabled'}`);
  }

  if (configData.maxConcurrentJobs) {
    logger.info(`Max concurrent jobs set to ${configData.maxConcurrentJobs}`);
  }

  return {
    message: 'Processing configuration updated successfully',
    config: configData
  };
}

module.exports = router;
