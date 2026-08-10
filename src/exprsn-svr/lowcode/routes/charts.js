/**
 * Chart Routes - API endpoints for chart management
 */

const express = require('express');
const router = express.Router();
const ChartService = require('../services/ChartService');

/**
 * GET /api/charts - List charts for application
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

    const result = await ChartService.getCharts(applicationId, {
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
    console.error('Failed to list charts:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/charts/:id - Get chart by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await ChartService.getChartById(req.params.id);

    if (!result.success) {
      return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Failed to get chart:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * POST /api/charts - Create new chart
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

    const result = await ChartService.createChart({
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
    console.error('Failed to create chart:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * PUT /api/charts/:id - Update chart
 */
router.put('/:id', async (req, res) => {
  try {
    const { displayName, description, status, config } = req.body;

    const result = await ChartService.updateChart(
      req.params.id,
      { displayName, description, status, config },
      req.user?.id
    );

    if (!result.success) {
      return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Failed to update chart:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * DELETE /api/charts/:id - Delete chart
 */
router.delete('/:id', async (req, res) => {
  try {
    const result = await ChartService.deleteChart(req.params.id);

    if (!result.success) {
      return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Failed to delete chart:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * POST /api/charts/:id/duplicate - Duplicate chart
 */
router.post('/:id/duplicate', async (req, res) => {
  try {
    const result = await ChartService.duplicateChart(req.params.id, req.user?.id);

    if (!result.success) {
      return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json(result);
    }

    res.status(201).json(result);
  } catch (error) {
    console.error('Failed to duplicate chart:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

module.exports = router;
