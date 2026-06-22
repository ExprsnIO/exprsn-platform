/**
 * ═══════════════════════════════════════════════════════════
 * Moderation Routes
 * API endpoints for content moderation
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const moderationService = require('../services/moderationService');
const logger = require('../src/utils/logger');

/**
 * POST /api/moderate/content
 * Submit content for moderation
 */
router.post('/content', async (req, res) => {
  try {
    const {
      contentType,
      contentId,
      sourceService,
      userId,
      contentText,
      contentUrl,
      contentMetadata,
      aiProvider
    } = req.body;

    // Validate required fields
    if (!contentType || !contentId || !sourceService || !userId) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Missing required fields: contentType, contentId, sourceService, userId'
      });
    }

    if (!contentText && !contentUrl) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Either contentText or contentUrl must be provided'
      });
    }

    const result = await moderationService.moderateContent({
      contentType,
      contentId,
      sourceService,
      userId,
      contentText,
      contentUrl,
      contentMetadata,
      aiProvider
    });

    res.json({
      success: true,
      moderation: result
    });
  } catch (error) {
    logger.error('Moderation endpoint error', { error: error.message });
    res.status(500).json({
      error: 'MODERATION_FAILED',
      message: error.message
    });
  }
});

/**
 * GET /api/moderate/status/:sourceService/:contentType/:contentId
 * Get moderation status for content
 */
router.get('/status/:sourceService/:contentType/:contentId', async (req, res) => {
  try {
    const { sourceService, contentType, contentId } = req.params;

    const result = await moderationService.getModerationStatus(
      sourceService,
      contentType,
      contentId
    );

    if (!result) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'No moderation record found for this content'
      });
    }

    res.json({
      success: true,
      moderation: result
    });
  } catch (error) {
    logger.error('Get status error', { error: error.message });
    res.status(500).json({
      error: 'STATUS_CHECK_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/moderate/batch
 * Batch moderation for multiple items
 */
router.post('/batch', async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Items array is required'
      });
    }

    if (items.length > 100) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Maximum 100 items per batch'
      });
    }

    const results = await Promise.all(
      items.map(item => moderationService.moderateContent(item))
    );

    res.json({
      success: true,
      results
    });
  } catch (error) {
    logger.error('Batch moderation error', { error: error.message });
    res.status(500).json({
      error: 'BATCH_MODERATION_FAILED',
      message: error.message
    });
  }
});

module.exports = router;
