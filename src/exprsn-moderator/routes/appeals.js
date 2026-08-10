/**
 * ═══════════════════════════════════════════════════════════
 * Appeals Routes
 * API endpoints for managing appeals
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const appealService = require('../services/appealService');
const logger = require('../src/utils/logger');

/**
 * POST /api/appeals
 * Submit new appeal
 */
router.post('/', async (req, res) => {
  try {
    const {
      moderationItemId,
      userActionId,
      reason,
      additionalInfo
    } = req.body;

    // Validate required fields
    if (!reason) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Reason is required'
      });
    }

    if (!moderationItemId && !userActionId) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Either moderationItemId or userActionId is required'
      });
    }

    const userId = req.user?.id || req.body.userId; // Get from auth or request

    const appeal = await appealService.submitAppeal(userId, {
      moderationItemId,
      userActionId,
      reason,
      additionalInfo
    });

    res.status(201).json({
      success: true,
      appeal
    });
  } catch (error) {
    logger.error('Failed to submit appeal', { error: error.message });
    res.status(500).json({
      error: 'SUBMIT_FAILED',
      message: error.message
    });
  }
});

/**
 * GET /api/appeals
 * List appeals (with filters)
 */
router.get('/', async (req, res) => {
  try {
    const {
      status,
      userId,
      limit = 50,
      offset = 0
    } = req.query;

    let appeals;

    if (userId) {
      appeals = await appealService.getAppealsForUser(userId, {
        status,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } else {
      appeals = await appealService.getPendingAppeals({
        status,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    }

    res.json({
      success: true,
      appeals,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        count: appeals.length
      }
    });
  } catch (error) {
    logger.error('Failed to list appeals', { error: error.message });
    res.status(500).json({
      error: 'FETCH_FAILED',
      message: error.message
    });
  }
});

/**
 * GET /api/appeals/:id
 * Get specific appeal
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const appeal = await appealService.getAppeal(id);

    res.json({
      success: true,
      appeal
    });
  } catch (error) {
    logger.error('Failed to get appeal', { error: error.message });
    res.status(error.message.includes('not found') ? 404 : 500).json({
      error: error.message.includes('not found') ? 'NOT_FOUND' : 'FETCH_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/appeals/:id/review
 * Review appeal (approve or deny)
 */
router.post('/:id/review', async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, notes } = req.body;

    // Validate required fields
    if (!decision || !['approve', 'deny'].includes(decision)) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Valid decision (approve or deny) is required'
      });
    }

    if (!notes) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Review notes are required'
      });
    }

    const reviewerId = req.user?.id || req.body.reviewerId; // Get from auth or request

    const appeal = await appealService.reviewAppeal(id, reviewerId, decision, notes);

    res.json({
      success: true,
      appeal
    });
  } catch (error) {
    logger.error('Failed to review appeal', { error: error.message });
    res.status(500).json({
      error: 'REVIEW_FAILED',
      message: error.message
    });
  }
});

/**
 * GET /api/appeals/stats
 * Get appeal statistics
 */
router.get('/stats/summary', async (req, res) => {
  try {
    const stats = await appealService.getAppealStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error('Failed to get appeal stats', { error: error.message });
    res.status(500).json({
      error: 'STATS_FAILED',
      message: error.message
    });
  }
});

/**
 * GET /api/appeals/case/:moderationItemId
 * Get appeal history for moderation case
 */
router.get('/case/:moderationItemId', async (req, res) => {
  try {
    const { moderationItemId } = req.params;

    const appeals = await appealService.getAppealHistory(moderationItemId);

    res.json({
      success: true,
      appeals
    });
  } catch (error) {
    logger.error('Failed to get appeal history', { error: error.message });
    res.status(500).json({
      error: 'FETCH_FAILED',
      message: error.message
    });
  }
});

module.exports = router;
