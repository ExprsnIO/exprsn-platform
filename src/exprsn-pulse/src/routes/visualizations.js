/**
 * Visualizations Routes
 */

const express = require('express');
const router = express.Router();
const { validateCAToken, requirePermissions, asyncHandler } = require('@exprsn/shared');
const VisualizationService = require('../services/VisualizationService');
const Joi = require('joi');

const createVisualizationSchema = Joi.object({
  datasetId: Joi.string().uuid().required(),
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().allow('', null),
  type: Joi.string().required(),
  renderer: Joi.string().valid('chartjs', 'd3', 'custom').required(),
  config: Joi.object(),
  dataMapping: Joi.object().required(),
  filters: Joi.array(),
  aggregations: Joi.array(),
  width: Joi.number(),
  height: Joi.number(),
  isPublic: Joi.boolean()
});

// List visualizations
router.get('/',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { type, renderer, datasetId, isPublic, includeDataset } = req.query;

    const visualizations = await VisualizationService.list({
      type,
      renderer,
      datasetId,
      isPublic,
      includeDataset: includeDataset === 'true'
    });

    res.json({
      success: true,
      data: visualizations
    });
  })
);

// Get visualization by ID
router.get('/:id',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const visualization = await VisualizationService.getById(req.params.id, {
      includeDataset: req.query.includeDataset === 'true'
    });

    if (!visualization) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Visualization not found'
      });
    }

    res.json({
      success: true,
      data: visualization
    });
  })
);

// Create visualization
router.post('/',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = createVisualizationSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const visualization = await VisualizationService.create(value, req.user.id);

    res.status(201).json({
      success: true,
      data: visualization
    });
  })
);

// Render visualization
router.get('/:id/render',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const rendered = await VisualizationService.render(req.params.id, {
      autoRefresh: req.query.autoRefresh === 'true'
    });

    res.json({
      success: true,
      data: rendered
    });
  })
);

// Update visualization
router.put('/:id',
  validateCAToken,
  requirePermissions({ update: true }),
  asyncHandler(async (req, res) => {
    const visualization = await VisualizationService.update(req.params.id, req.body, req.user.id);

    res.json({
      success: true,
      data: visualization
    });
  })
);

// Clone visualization
router.post('/:id/clone',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const { name } = req.body;

    const cloned = await VisualizationService.clone(req.params.id, req.user.id, name);

    res.status(201).json({
      success: true,
      data: cloned
    });
  })
);

// Delete visualization
router.delete('/:id',
  validateCAToken,
  requirePermissions({ delete: true }),
  asyncHandler(async (req, res) => {
    await VisualizationService.delete(req.params.id);

    res.json({
      success: true,
      message: 'Visualization deleted successfully'
    });
  })
);

module.exports = router;
