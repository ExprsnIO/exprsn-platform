const express = require('express');
const router = express.Router();
const { optionalToken, requireToken } = require('../middleware/tokenAuth');
const { requireAdmin } = require('@exprsn/shared');
const trendingService = require('../services/trendingService');
const Joi = require('joi');

/**
 * ═══════════════════════════════════════════════════════════
 * Trending Groups Routes
 * ═══════════════════════════════════════════════════════════
 */

/**
 * GET /api/trending/groups
 * Get trending groups
 */
router.get('/groups',
  optionalToken,
  async (req, res, next) => {
    try {
      const {
        category,
        limit = 20,
        offset = 0,
        minScore = 0
      } = req.query;

      const groups = await trendingService.getTrendingGroups({
        category,
        limit: Math.min(parseInt(limit), 100),
        offset: parseInt(offset),
        minScore: parseFloat(minScore)
      });

      res.json({
        success: true,
        groups,
        count: groups.length,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/trending/update
 * Manually trigger trending stats update (admin only)
 */
router.post('/update',
  requireToken,
  requireAdmin(),
  async (req, res, next) => {
    try {
      const { groupId } = req.body;

      if (groupId) {
        // Update specific group
        const stats = await trendingService.updateGroupTrendingStats(groupId);
        res.json({
          success: true,
          stats,
          message: 'Trending stats updated for group'
        });
      } else {
        // Update all groups
        const result = await trendingService.updateAllTrendingStats({
          limit: parseInt(req.body.limit) || 1000,
          batchSize: parseInt(req.body.batchSize) || 50
        });

        res.json({
          success: true,
          result,
          message: 'Trending stats updated for all groups'
        });
      }
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
