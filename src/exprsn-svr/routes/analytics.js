/**
 * ═══════════════════════════════════════════════════════════
 * Analytics Routes
 * API endpoints for page analytics and tracking
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const analyticsService = require('../services/analyticsService');
const { requireAuth } = require('../middleware/auth');

/**
 * @route   POST /api/analytics/track
 * @desc    Track a page view (called by client-side JS)
 * @access  Public
 */
router.post('/track', async (req, res, next) => {
  try {
    const { pageId, screenResolution } = req.body;

    if (!pageId) {
      return res.status(400).json({
        success: false,
        error: 'pageId is required'
      });
    }

    const options = {
      userId: req.user ? req.user.id : null,
      screenResolution
    };

    const analytics = await analyticsService.trackPageView(pageId, req, options);

    // Set visitor ID cookie if not already set
    if (!req.cookies.visitor_id) {
      const visitorId = analyticsService.getVisitorId(req);
      res.cookie('visitor_id', visitorId, {
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
        httpOnly: true
      });
    }

    res.json({
      success: true,
      analyticsId: analytics ? analytics.id : null
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/analytics/:id/engagement
 * @desc    Update engagement data for a page view
 * @access  Public
 */
router.put('/:id/engagement', async (req, res, next) => {
  try {
    const { timeOnPage, scrollDepth, bounce, interactions, exitPage } = req.body;

    await analyticsService.updateEngagement(req.params.id, {
      timeOnPage,
      scrollDepth,
      bounce,
      interactions,
      exitPage
    });

    res.json({
      success: true,
      message: 'Engagement data updated'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/analytics/page/:pageId/stats
 * @desc    Get page statistics
 * @access  Private
 */
router.get('/page/:pageId/stats', requireAuth, async (req, res, next) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;

    const stats = await analyticsService.getPageStats(
      req.params.pageId,
      startDate,
      endDate
    );

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/analytics/page/:pageId/referrers
 * @desc    Get top referrers for a page
 * @access  Private
 */
router.get('/page/:pageId/referrers', requireAuth, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const referrers = await analyticsService.getTopReferrers(req.params.pageId, limit);

    res.json({
      success: true,
      count: referrers.length,
      data: referrers
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/analytics/page/:pageId/geographic
 * @desc    Get geographic distribution for a page
 * @access  Private
 */
router.get('/page/:pageId/geographic', requireAuth, async (req, res, next) => {
  try {
    const geoStats = await analyticsService.getGeographicStats(req.params.pageId);

    res.json({
      success: true,
      count: geoStats.length,
      data: geoStats
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/analytics/page/:pageId/devices
 * @desc    Get device type distribution for a page
 * @access  Private
 */
router.get('/page/:pageId/devices', requireAuth, async (req, res, next) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;

    const deviceStats = await analyticsService.getDeviceStats(
      req.params.pageId,
      startDate,
      endDate
    );

    res.json({
      success: true,
      count: deviceStats.length,
      data: deviceStats
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/analytics/page/:pageId/browsers
 * @desc    Get browser distribution for a page
 * @access  Private
 */
router.get('/page/:pageId/browsers', requireAuth, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const browserStats = await analyticsService.getBrowserStats(req.params.pageId, limit);

    res.json({
      success: true,
      count: browserStats.length,
      data: browserStats
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/analytics/page/:pageId/time-series
 * @desc    Get time-series data for page views
 * @access  Private
 */
router.get('/page/:pageId/time-series', requireAuth, async (req, res, next) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;
    const interval = req.query.interval || 'day'; // hour, day, week, month

    const timeSeries = await analyticsService.getViewsTimeSeries(
      req.params.pageId,
      startDate,
      endDate,
      interval
    );

    res.json({
      success: true,
      count: timeSeries.length,
      data: timeSeries
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/analytics/page/:pageId/campaigns
 * @desc    Get UTM campaign performance for a page
 * @access  Private
 */
router.get('/page/:pageId/campaigns', requireAuth, async (req, res, next) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;

    const campaigns = await analyticsService.getCampaignStats(
      req.params.pageId,
      startDate,
      endDate
    );

    res.json({
      success: true,
      count: campaigns.length,
      data: campaigns
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
