/**
 * ═══════════════════════════════════════════════════════════
 * Application Runtime Routes
 * Handles application execution and data operations
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const AppRuntimeService = require('../services/AppRuntimeService');

/**
 * Load complete application for runtime
 * GET /api/runtime/:appId
 */
router.get('/:appId', async (req, res) => {
  try {
    const { appId } = req.params;
    const userId = req.user?.id || null;

    const application = await AppRuntimeService.loadApplication(appId, userId);

    res.json({
      success: true,
      data: application
    });
  } catch (error) {
    console.error('Failed to load application:', error);
    res.status(error.message === 'Application not found' ? 404 : 500).json({
      success: false,
      error: error.message === 'Application not found' ? 'NOT_FOUND' : 'LOAD_ERROR',
      message: error.message
    });
  }
});

/**
 * Load specific form for runtime
 * GET /api/runtime/:appId/forms/:formId
 */
router.get('/:appId/forms/:formId', async (req, res) => {
  try {
    const { appId, formId } = req.params;

    const form = await AppRuntimeService.loadForm(appId, formId);

    res.json({
      success: true,
      data: form
    });
  } catch (error) {
    console.error('Failed to load form:', error);
    res.status(error.message === 'Form not found' ? 404 : 500).json({
      success: false,
      error: error.message.includes('not found') ? 'NOT_FOUND' : 'LOAD_ERROR',
      message: error.message
    });
  }
});

/**
 * Load specific grid for runtime
 * GET /api/runtime/:appId/grids/:gridId
 */
router.get('/:appId/grids/:gridId', async (req, res) => {
  try {
    const { appId, gridId } = req.params;

    const grid = await AppRuntimeService.loadGrid(appId, gridId);

    res.json({
      success: true,
      data: grid
    });
  } catch (error) {
    console.error('Failed to load grid:', error);
    res.status(error.message === 'Grid not found' ? 404 : 500).json({
      success: false,
      error: error.message.includes('not found') ? 'NOT_FOUND' : 'LOAD_ERROR',
      message: error.message
    });
  }
});

/**
 * Execute data source query
 * POST /api/runtime/:appId/data/:dataSourceId
 */
router.post('/:appId/data/:dataSourceId', async (req, res) => {
  try {
    const { dataSourceId } = req.params;
    const query = req.body;

    const result = await AppRuntimeService.executeDataSourceQuery(dataSourceId, query);

    res.json(result);
  } catch (error) {
    console.error('Failed to execute query:', error);
    res.status(500).json({
      success: false,
      error: 'QUERY_ERROR',
      message: error.message
    });
  }
});

/**
 * Get application navigation
 * GET /api/runtime/:appId/navigation
 */
router.get('/:appId/navigation', async (req, res) => {
  try {
    const { appId } = req.params;

    const navigation = await AppRuntimeService.getNavigation(appId);

    res.json({
      success: true,
      data: navigation
    });
  } catch (error) {
    console.error('Failed to load navigation:', error);
    res.status(500).json({
      success: false,
      error: 'LOAD_ERROR',
      message: error.message
    });
  }
});

/**
 * Record analytics event
 * POST /api/runtime/:appId/analytics
 */
router.post('/:appId/analytics', async (req, res) => {
  try {
    const { appId } = req.params;
    const userId = req.user?.id || 'anonymous';
    const event = req.body;

    await AppRuntimeService.recordAnalytics(appId, userId, event);

    res.json({
      success: true,
      message: 'Event recorded'
    });
  } catch (error) {
    console.error('Failed to record analytics:', error);
    // Don't fail request for analytics errors
    res.json({
      success: true,
      message: 'Event recording failed (non-fatal)'
    });
  }
});

module.exports = router;
