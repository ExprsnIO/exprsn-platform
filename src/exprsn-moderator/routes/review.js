/**
 * ═══════════════════════════════════════════════════════════
 * Review Queue Routes
 * API endpoints for manual review workflow
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const moderationService = require('../services/moderationService');
const moderationActions = require('../services/moderationActions');
const ReviewQueue = require('../models/ReviewQueue');
const ModerationCase = require('../models/ModerationCase');
const logger = require('../src/utils/logger');

/**
 * GET /api/queue/pending
 * Get pending review items
 */
router.get('/pending', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const items = await moderationService.getPendingReviews(limit, offset);

    res.json({
      success: true,
      items,
      pagination: {
        limit,
        offset,
        count: items.length
      }
    });
  } catch (error) {
    logger.error('Get pending reviews error', { error: error.message });
    res.status(500).json({
      error: 'QUEUE_FETCH_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/queue/:itemId/approve
 * Approve content in review queue
 */
router.post('/:itemId/approve', async (req, res) => {
  try {
    const { itemId } = req.params;
    const { moderatorId, notes } = req.body;

    if (!moderatorId) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'moderatorId is required'
      });
    }

    const result = await moderationService.reviewContent(
      itemId,
      moderatorId,
      'approve',
      notes || ''
    );

    res.json({
      success: true,
      moderation: result
    });
  } catch (error) {
    logger.error('Approve review error', { error: error.message });
    res.status(500).json({
      error: 'REVIEW_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/queue/:itemId/reject
 * Reject content in review queue
 */
router.post('/:itemId/reject', async (req, res) => {
  try {
    const { itemId } = req.params;
    const { moderatorId, notes } = req.body;

    if (!moderatorId) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'moderatorId is required'
      });
    }

    const result = await moderationService.reviewContent(
      itemId,
      moderatorId,
      'reject',
      notes || ''
    );

    res.json({
      success: true,
      moderation: result
    });
  } catch (error) {
    logger.error('Reject review error', { error: error.message });
    res.status(500).json({
      error: 'REVIEW_FAILED',
      message: error.message
    });
  }
});

/**
 * GET /api/queue
 * Get all queue items with optional filtering
 * Query params: priority (high, medium, low), status, limit, offset
 */
router.get('/', async (req, res) => {
  try {
    const { priority, status = 'pending', limit = 50, offset = 0 } = req.query;

    const where = { status };
    if (priority) {
      where.priority = priority;
    }

    const items = await ReviewQueue.findAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [
        ['priority', 'DESC'], // high priority first
        ['created_at', 'ASC']  // oldest first
      ],
      include: [{
        model: ModerationCase,
        as: 'moderationCase'
      }]
    });

    const total = await ReviewQueue.count({ where });

    res.json({
      success: true,
      items,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total,
        hasMore: total > (parseInt(offset) + parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Get queue items error', { error: error.message });
    res.status(500).json({
      error: 'QUEUE_FETCH_FAILED',
      message: error.message
    });
  }
});

/**
 * GET /api/queue/:id
 * Get detailed information about a specific queue item
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const item = await ReviewQueue.findByPk(id, {
      include: [{
        model: ModerationCase,
        as: 'moderationCase'
      }]
    });

    if (!item) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Queue item not found'
      });
    }

    res.json({
      success: true,
      item
    });
  } catch (error) {
    logger.error('Get queue item error', { error: error.message });
    res.status(500).json({
      error: 'QUEUE_ITEM_FETCH_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/queue/:id/analyze
 * Run on-demand AI analysis for a queue item
 */
router.post('/:id/analyze', async (req, res) => {
  try {
    const { id } = req.params;

    const item = await ReviewQueue.findByPk(id, {
      include: [{
        model: ModerationCase,
        as: 'moderationCase'
      }]
    });

    if (!item) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Queue item not found'
      });
    }

    const moderationCase = item.moderationCase;
    if (!moderationCase) {
      return res.status(400).json({
        error: 'INVALID_STATE',
        message: 'No moderation case associated with this queue item'
      });
    }

    // Re-run AI analysis
    const analysis = await moderationService.analyzeContent({
      content: moderationCase.content,
      contentType: moderationCase.content_type,
      metadata: moderationCase.metadata
    });

    // Update the moderation case with new analysis
    await moderationCase.update({
      ai_analysis: analysis,
      risk_score: analysis.riskScore || moderationCase.risk_score
    });

    res.json({
      success: true,
      analysis,
      item: await ReviewQueue.findByPk(id, {
        include: [{
          model: ModerationCase,
          as: 'moderationCase'
        }]
      })
    });
  } catch (error) {
    logger.error('AI analysis error', { error: error.message });
    res.status(500).json({
      error: 'ANALYSIS_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/queue/:id/warn
 * Issue a warning for content
 */
router.post('/:id/warn', async (req, res) => {
  try {
    const { id } = req.params;
    const { moderatorId, reason } = req.body;

    const item = await ReviewQueue.findByPk(id, {
      include: [{
        model: ModerationCase,
        as: 'moderationCase'
      }]
    });

    if (!item) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Queue item not found'
      });
    }

    const moderationCase = item.moderationCase;

    // Execute warn action
    const result = await moderationActions.executeAction({
      action: 'warn',
      contentType: moderationCase.content_type,
      contentId: moderationCase.content_id,
      sourceService: moderationCase.source_service,
      userId: moderationCase.metadata?.userId,
      reason: reason || 'Content flagged for policy violation',
      moderatorId: moderatorId || 'system'
    });

    // Update queue item status
    await item.update({ status: 'resolved' });
    await moderationCase.update({ status: 'warned' });

    res.json({
      success: true,
      result,
      item: await ReviewQueue.findByPk(id, {
        include: [{
          model: ModerationCase,
          as: 'moderationCase'
        }]
      })
    });
  } catch (error) {
    logger.error('Warn action error', { error: error.message });
    res.status(500).json({
      error: 'ACTION_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/queue/:id/remove
 * Remove content
 */
router.post('/:id/remove', async (req, res) => {
  try {
    const { id } = req.params;
    const { moderatorId, reason } = req.body;

    const item = await ReviewQueue.findByPk(id, {
      include: [{
        model: ModerationCase,
        as: 'moderationCase'
      }]
    });

    if (!item) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Queue item not found'
      });
    }

    const moderationCase = item.moderationCase;

    // Execute remove action
    const result = await moderationActions.executeAction({
      action: 'remove',
      contentType: moderationCase.content_type,
      contentId: moderationCase.content_id,
      sourceService: moderationCase.source_service,
      userId: moderationCase.metadata?.userId,
      reason: reason || 'Content removed for policy violation',
      moderatorId: moderatorId || 'system'
    });

    // Update queue item status
    await item.update({ status: 'resolved' });
    await moderationCase.update({ status: 'removed' });

    res.json({
      success: true,
      result,
      item: await ReviewQueue.findByPk(id, {
        include: [{
          model: ModerationCase,
          as: 'moderationCase'
        }]
      })
    });
  } catch (error) {
    logger.error('Remove action error', { error: error.message });
    res.status(500).json({
      error: 'ACTION_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/queue/:id/ban
 * Ban user who created the content
 */
router.post('/:id/ban', async (req, res) => {
  try {
    const { id } = req.params;
    const { moderatorId, reason, duration } = req.body;

    const item = await ReviewQueue.findByPk(id, {
      include: [{
        model: ModerationCase,
        as: 'moderationCase'
      }]
    });

    if (!item) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Queue item not found'
      });
    }

    const moderationCase = item.moderationCase;

    // Execute ban action
    const result = await moderationActions.executeAction({
      action: 'ban',
      contentType: moderationCase.content_type,
      contentId: moderationCase.content_id,
      sourceService: moderationCase.source_service,
      userId: moderationCase.metadata?.userId,
      reason: reason || 'User banned for policy violation',
      moderatorId: moderatorId || 'system',
      metadata: { duration: duration || 'permanent' }
    });

    // Update queue item status
    await item.update({ status: 'resolved' });
    await moderationCase.update({ status: 'banned' });

    res.json({
      success: true,
      result,
      item: await ReviewQueue.findByPk(id, {
        include: [{
          model: ModerationCase,
          as: 'moderationCase'
        }]
      })
    });
  } catch (error) {
    logger.error('Ban action error', { error: error.message });
    res.status(500).json({
      error: 'ACTION_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/queue/:id/skip
 * Skip queue item (mark for later review)
 */
router.post('/:id/skip', async (req, res) => {
  try {
    const { id } = req.params;

    const item = await ReviewQueue.findByPk(id);

    if (!item) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Queue item not found'
      });
    }

    // Move item to end of queue by updating timestamp
    await item.update({
      updated_at: new Date(),
      priority: 'low' // Downgrade priority when skipped
    });

    res.json({
      success: true,
      message: 'Item skipped and moved to end of queue'
    });
  } catch (error) {
    logger.error('Skip item error', { error: error.message });
    res.status(500).json({
      error: 'SKIP_FAILED',
      message: error.message
    });
  }
});

module.exports = router;
