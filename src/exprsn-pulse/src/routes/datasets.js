/**
 * Datasets Routes
 */

const express = require('express');
const router = express.Router();
const { validateCAToken, requirePermissions, asyncHandler } = require('@exprsn/shared');
const DatasetService = require('../services/DatasetService');

// List datasets
router.get('/',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { queryId, isSnapshot, limit, offset } = req.query;

    const result = await DatasetService.list(
      { queryId, isSnapshot, includeQuery: req.query.includeQuery === 'true' },
      { limit: parseInt(limit) || 50, offset: parseInt(offset) || 0 }
    );

    res.json({
      success: true,
      ...result
    });
  })
);

// Get dataset by ID
router.get('/:id',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const dataset = await DatasetService.getById(req.params.id, {
      includeQuery: req.query.includeQuery === 'true',
      autoRefresh: req.query.autoRefresh === 'true'
    });

    res.json({
      success: true,
      data: dataset
    });
  })
);

// Create dataset from query
router.post('/',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const { queryId, parameters, name, isSnapshot, metadata } = req.body;

    if (!queryId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'queryId is required'
      });
    }

    const dataset = await DatasetService.createFromQuery(
      queryId,
      parameters || {},
      req.user.id,
      { name, isSnapshot, metadata }
    );

    res.status(201).json({
      success: true,
      data: dataset
    });
  })
);

// Refresh dataset
router.post('/:id/refresh',
  validateCAToken,
  requirePermissions({ update: true }),
  asyncHandler(async (req, res) => {
    const dataset = await DatasetService.refresh(req.params.id);

    res.json({
      success: true,
      data: dataset
    });
  })
);

// Get dataset statistics
router.get('/:id/statistics',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const stats = await DatasetService.getStatistics(req.params.id);

    res.json({
      success: true,
      data: stats
    });
  })
);

// Transform dataset
router.post('/:id/transform',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const { transformations } = req.body;

    if (!transformations) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'transformations is required'
      });
    }

    const newDataset = await DatasetService.transform(req.params.id, transformations, req.user.id);

    res.status(201).json({
      success: true,
      data: newDataset
    });
  })
);

// Export dataset to CSV
router.get('/:id/export/csv',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const csv = await DatasetService.exportToCSV(req.params.id);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="dataset_${req.params.id}.csv"`);
    res.send(csv);
  })
);

// Export dataset to Excel
router.get('/:id/export/excel',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const buffer = await DatasetService.exportToExcel(req.params.id);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="dataset_${req.params.id}.xlsx"`);
    res.send(buffer);
  })
);

// Delete dataset
router.delete('/:id',
  validateCAToken,
  requirePermissions({ delete: true }),
  asyncHandler(async (req, res) => {
    await DatasetService.delete(req.params.id);

    res.json({
      success: true,
      message: 'Dataset deleted successfully'
    });
  })
);

// Cleanup expired datasets
router.post('/cleanup/expired',
  validateCAToken,
  requirePermissions({ delete: true }),
  asyncHandler(async (req, res) => {
    const count = await DatasetService.cleanupExpired();

    res.json({
      success: true,
      message: `Cleaned up ${count} expired datasets`
    });
  })
);

module.exports = router;
