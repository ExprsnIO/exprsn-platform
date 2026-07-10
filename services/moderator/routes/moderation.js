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
 * Fields an UNTRUSTED HTTP caller may set. `moderateContent` also accepts
 * `precomputedResult` — a caller-supplied verdict that SKIPS the AI analyzer
 * entirely — but that is an in-process-only parameter (the FileVault worker
 * hands it the real cortex vision scores via a direct require, never over HTTP).
 * This route is unauthenticated (SPIKE-001/BUG-010), so anything reaching
 * `moderateContent` from the wire must be allowlisted: an attacker must not be
 * able to POST `precomputedResult: { riskScore: 0 }` to launder content as clean
 * (or `{ riskScore: 100 }` to grief someone). Strip everything else here.
 */
function sanitizeModerationInput(body = {}) {
  const {
    contentType, contentId, sourceService, userId,
    contentText, contentUrl, contentMetadata, aiProvider,
  } = body;
  return {
    contentType, contentId, sourceService, userId,
    contentText, contentUrl, contentMetadata, aiProvider,
  };
}

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

    const result = await moderationService.moderateContent(sanitizeModerationInput({
      contentType,
      contentId,
      sourceService,
      userId,
      contentText,
      contentUrl,
      contentMetadata,
      aiProvider
    }));

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

    // Allowlist each item — never pass a wire-supplied object straight through:
    // that would let a caller inject `precomputedResult` and forge a verdict.
    const results = await Promise.all(
      items.map(item => moderationService.moderateContent(sanitizeModerationInput(item)))
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
