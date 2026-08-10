/**
 * Dashboard Routes - API endpoints for dashboard management
 */

const express = require('express');
const router = express.Router();
const DashboardService = require('../services/DashboardService');

/**
 * GET /api/dashboards - List dashboards for application
 */
router.get('/', async (req, res) => {
  try {
    const { applicationId, status, page, limit, sortBy, sortOrder } = req.query;

    if (!applicationId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETER',
        message: 'applicationId is required'
      });
    }

    const result = await DashboardService.getDashboards(applicationId, {
      status,
      page,
      limit,
      sortBy,
      sortOrder
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Failed to list dashboards:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/dashboards/:id - Get dashboard by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await DashboardService.getDashboardById(req.params.id);

    if (!result.success) {
      return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Failed to get dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * POST /api/dashboards - Create new dashboard
 */
router.post('/', async (req, res) => {
  try {
    const { displayName, description, applicationId, status, config } = req.body;

    if (!displayName || !applicationId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'displayName and applicationId are required'
      });
    }

    const result = await DashboardService.createDashboard({
      displayName,
      description,
      applicationId,
      status,
      config
    }, req.user?.id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(201).json(result);
  } catch (error) {
    console.error('Failed to create dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * PUT /api/dashboards/:id - Update dashboard
 */
router.put('/:id', async (req, res) => {
  try {
    const { displayName, description, status, config } = req.body;

    const result = await DashboardService.updateDashboard(
      req.params.id,
      { displayName, description, status, config },
      req.user?.id
    );

    if (!result.success) {
      return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Failed to update dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * DELETE /api/dashboards/:id - Delete dashboard
 */
router.delete('/:id', async (req, res) => {
  try {
    const result = await DashboardService.deleteDashboard(req.params.id);

    if (!result.success) {
      return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Failed to delete dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * POST /api/dashboards/:id/duplicate - Duplicate dashboard
 */
router.post('/:id/duplicate', async (req, res) => {
  try {
    const result = await DashboardService.duplicateDashboard(req.params.id, req.user?.id);

    if (!result.success) {
      return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json(result);
    }

    res.status(201).json(result);
  } catch (error) {
    console.error('Failed to duplicate dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

module.exports = router;
