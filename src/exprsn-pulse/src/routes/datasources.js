/**
 * Data Sources Routes
 */

const express = require('express');
const router = express.Router();
const { validateCAToken, requirePermissions, asyncHandler } = require('@exprsn/shared');
const DataSourceService = require('../services/DataSourceService');
const Joi = require('joi');

// Validation schemas
const createDataSourceSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().allow('', null),
  type: Joi.string().valid('exprsn-service', 'postgresql', 'rest-api', 'custom-query').required(),
  config: Joi.object().required(),
  serviceName: Joi.string().when('type', { is: 'exprsn-service', then: Joi.required() }),
  metadata: Joi.object()
});

// List data sources
router.get('/',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { type, isActive } = req.query;

    const dataSources = await DataSourceService.list({ type, isActive });

    res.json({
      success: true,
      data: dataSources
    });
  })
);

// Get data source by ID
router.get('/:id',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const dataSource = await DataSourceService.getById(req.params.id);

    if (!dataSource) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Data source not found'
      });
    }

    res.json({
      success: true,
      data: dataSource
    });
  })
);

// Create data source
router.post('/',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = createDataSourceSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const dataSource = await DataSourceService.create(value, req.user.id);

    res.status(201).json({
      success: true,
      data: dataSource
    });
  })
);

// Test data source connection
router.post('/:id/test',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const result = await DataSourceService.testConnection(req.params.id);

    res.json({
      success: true,
      data: result
    });
  })
);

// Discover metadata
router.post('/:id/discover',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const metadata = await DataSourceService.discoverMetadata(req.params.id);

    res.json({
      success: true,
      data: metadata
    });
  })
);

// Update data source
router.put('/:id',
  validateCAToken,
  requirePermissions({ update: true }),
  asyncHandler(async (req, res) => {
    const dataSource = await DataSourceService.update(req.params.id, req.body, req.user.id);

    res.json({
      success: true,
      data: dataSource
    });
  })
);

// Delete data source
router.delete('/:id',
  validateCAToken,
  requirePermissions({ delete: true }),
  asyncHandler(async (req, res) => {
    await DataSourceService.delete(req.params.id);

    res.json({
      success: true,
      message: 'Data source deleted successfully'
    });
  })
);

module.exports = router;
