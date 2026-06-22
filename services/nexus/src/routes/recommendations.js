const express = require('express');
const router = express.Router();
const { requireToken } = require('../middleware/tokenAuth');
const recommendationService = require('../services/recommendationService');
const Joi = require('joi');

/**
 * ═══════════════════════════════════════════════════════════
 * Group Recommendations Routes
 * ═══════════════════════════════════════════════════════════
 */

/**
 * GET /api/recommendations
 * Get personalized group recommendations
 */
router.get('/',
  requireToken,
  async (req, res, next) => {
    try {
      const userId = req.token.data.userId;
      const {
        limit = 20,
        refresh = false,
        excludeDismissed = true
      } = req.query;

      const recommendations = await recommendationService.getRecommendations(userId, {
        limit: Math.min(parseInt(limit), 50),
        refresh: refresh === 'true',
        excludeDismissed: excludeDismissed !== 'false'
      });

      res.json({
        success: true,
        recommendations,
        count: recommendations.length
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/recommendations/generate
 * Manually generate fresh recommendations
 */
router.post('/generate',
  requireToken,
  async (req, res, next) => {
    try {
      const userId = req.token.data.userId;
      const {
        limit = 20,
        minScore = 10
      } = req.body;

      const recommendations = await recommendationService.generateRecommendations(userId, {
        limit: Math.min(parseInt(limit), 50),
        minScore: parseFloat(minScore),
        refreshExisting: true
      });

      res.json({
        success: true,
        recommendations,
        count: recommendations.length,
        message: 'Recommendations generated successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/recommendations/:id/track
 * Track user interaction with a recommendation
 */
router.post('/:id/track',
  requireToken,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { action, metadata = {} } = req.body;

      const validActions = ['shown', 'clicked', 'joined', 'dismissed'];
      if (!validActions.includes(action)) {
        return res.status(400).json({
          error: 'INVALID_ACTION',
          message: `Action must be one of: ${validActions.join(', ')}`
        });
      }

      const recommendation = await recommendationService.trackRecommendationInteraction(
        id,
        action,
        metadata
      );

      res.json({
        success: true,
        recommendation,
        message: `Recommendation interaction tracked: ${action}`
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/recommendations/analytics
 * Get recommendation analytics for the user
 */
router.get('/analytics',
  requireToken,
  async (req, res, next) => {
    try {
      const userId = req.token.data.userId;

      const analytics = await recommendationService.getRecommendationAnalytics(userId);

      res.json({
        success: true,
        analytics
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
