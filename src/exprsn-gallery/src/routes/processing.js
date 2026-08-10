/**
 * ═══════════════════════════════════════════════════════════
 * Image Processing Routes
 * Advanced image processing, filters, and transformations
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const imageProcessor = require('../services/imageProcessor');
const { Media } = require('../models');
const logger = require('../utils/logger');

/**
 * POST /api/processing/transform
 * Apply transformations to an image
 */
router.post('/transform', async (req, res) => {
  try {
    const { mediaId, transformations } = req.body;

    if (!mediaId || !transformations) {
      return res.status(400).json({
        success: false,
        error: 'Media ID and transformations required'
      });
    }

    const media = await Media.findByPk(mediaId);
    if (!media) {
      return res.status(404).json({
        success: false,
        error: 'Media not found'
      });
    }

    const result = await imageProcessor.processImage(media.filePath, transformations);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      result
    });

  } catch (error) {
    logger.error('Image transformation failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Image transformation failed'
    });
  }
});

/**
 * POST /api/processing/variants
 * Generate multiple variants of an image
 */
router.post('/variants', async (req, res) => {
  try {
    const { mediaId, variants } = req.body;

    if (!mediaId) {
      return res.status(400).json({
        success: false,
        error: 'Media ID required'
      });
    }

    const media = await Media.findByPk(mediaId);
    if (!media) {
      return res.status(404).json({
        success: false,
        error: 'Media not found'
      });
    }

    const results = await imageProcessor.generateVariants(media.filePath, variants);

    res.json({
      success: true,
      variants: results
    });

  } catch (error) {
    logger.error('Variant generation failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Variant generation failed'
    });
  }
});

/**
 * POST /api/processing/filter
 * Apply advanced filter to image
 */
router.post('/filter', async (req, res) => {
  try {
    const { mediaId, filter, options = {} } = req.body;

    if (!mediaId || !filter) {
      return res.status(400).json({
        success: false,
        error: 'Media ID and filter required'
      });
    }

    const media = await Media.findByPk(mediaId);
    if (!media) {
      return res.status(404).json({
        success: false,
        error: 'Media not found'
      });
    }

    const result = await imageProcessor.processImage(media.filePath, {
      filter,
      ...options
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      result
    });

  } catch (error) {
    logger.error('Filter application failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Filter application failed'
    });
  }
});

/**
 * POST /api/processing/colors
 * Extract dominant colors from image
 */
router.post('/colors', async (req, res) => {
  try {
    const { mediaId, count = 5 } = req.body;

    if (!mediaId) {
      return res.status(400).json({
        success: false,
        error: 'Media ID required'
      });
    }

    const media = await Media.findByPk(mediaId);
    if (!media) {
      return res.status(404).json({
        success: false,
        error: 'Media not found'
      });
    }

    const colors = await imageProcessor.extractDominantColors(media.filePath, count);

    res.json({
      success: true,
      colors
    });

  } catch (error) {
    logger.error('Color extraction failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Color extraction failed'
    });
  }
});

/**
 * POST /api/processing/watermark
 * Apply watermark to image
 */
router.post('/watermark', async (req, res) => {
  try {
    const { mediaId, watermarkId, options = {} } = req.body;

    if (!mediaId || !watermarkId) {
      return res.status(400).json({
        success: false,
        error: 'Media ID and watermark ID required'
      });
    }

    const media = await Media.findByPk(mediaId);
    const watermark = await Media.findByPk(watermarkId);

    if (!media || !watermark) {
      return res.status(404).json({
        success: false,
        error: 'Media or watermark not found'
      });
    }

    const outputPath = await imageProcessor.applyWatermark(
      media.filePath,
      watermark.filePath,
      options
    );

    res.json({
      success: true,
      outputPath
    });

  } catch (error) {
    logger.error('Watermark application failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Watermark application failed'
    });
  }
});

/**
 * POST /api/processing/convert
 * Convert image format
 */
router.post('/convert', async (req, res) => {
  try {
    const { mediaId, format, quality } = req.body;

    if (!mediaId || !format) {
      return res.status(400).json({
        success: false,
        error: 'Media ID and format required'
      });
    }

    const media = await Media.findByPk(mediaId);
    if (!media) {
      return res.status(404).json({
        success: false,
        error: 'Media not found'
      });
    }

    const outputPath = await imageProcessor.convertFormat(
      media.filePath,
      format,
      { quality }
    );

    res.json({
      success: true,
      outputPath,
      format
    });

  } catch (error) {
    logger.error('Format conversion failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Format conversion failed'
    });
  }
});

/**
 * GET /api/processing/filters
 * Get list of available filters
 */
router.get('/filters', (req, res) => {
  const filters = [
    { name: 'sepia', description: 'Classic sepia tone effect' },
    { name: 'vintage', description: 'Vintage/retro look' },
    { name: 'dramatic', description: 'High contrast dramatic look' },
    { name: 'polaroid', description: 'Polaroid camera effect' },
    { name: 'cool', description: 'Cool blue tones' },
    { name: 'warm', description: 'Warm orange/red tones' },
    { name: 'high_contrast', description: 'Increased contrast' },
    { name: 'grayscale', description: 'Black and white' },
    { name: 'normalize', description: 'Auto-enhance contrast' }
  ];

  res.json({
    success: true,
    filters
  });
});

module.exports = router;
