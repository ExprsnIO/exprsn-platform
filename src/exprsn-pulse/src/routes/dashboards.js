/**
 * Dashboards Routes
 */

const express = require('express');
const router = express.Router();
const { validateCAToken, requirePermissions, asyncHandler } = require('@exprsn/shared');
const DashboardService = require('../services/DashboardService');
const Joi = require('joi');

const createDashboardSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().allow('', null),
  layout: Joi.object(),
  theme: Joi.object(),
  refreshInterval: Joi.number().min(0),
  isRealtime: Joi.boolean(),
  isPublic: Joi.boolean(),
  isTemplate: Joi.boolean(),
  category: Joi.string(),
  tags: Joi.array().items(Joi.string())
});

// List dashboards
router.get('/',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { category, isPublic, isTemplate, tags, orderBy, orderDirection, limit, offset } = req.query;

    const result = await DashboardService.list(
      {
        category,
        isPublic,
        isTemplate,
        tags: tags ? tags.split(',') : undefined,
        orderBy,
        orderDirection
      },
      {
        limit: parseInt(limit) || 50,
        offset: parseInt(offset) || 0
      }
    );

    res.json({
      success: true,
      ...result
    });
  })
);

// Get dashboard by ID
router.get('/:id',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const dashboard = await DashboardService.getById(req.params.id, {
      includeData: req.query.includeData === 'true'
    });

    res.json({
      success: true,
      data: dashboard
    });
  })
);

// Create dashboard
router.post('/',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = createDashboardSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const dashboard = await DashboardService.create(value, req.user.id);

    res.status(201).json({
      success: true,
      data: dashboard
    });
  })
);

// Render dashboard with all visualizations
router.get('/:id/render',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const rendered = await DashboardService.render(req.params.id, {
      autoRefresh: req.query.autoRefresh === 'true'
    });

    res.json({
      success: true,
      data: rendered
    });
  })
);

// Add item to dashboard
router.post('/:id/items',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const item = await DashboardService.addItem(req.params.id, req.body, req.user.id);

    res.status(201).json({
      success: true,
      data: item
    });
  })
);

// Update dashboard item
router.put('/:dashboardId/items/:itemId',
  validateCAToken,
  requirePermissions({ update: true }),
  asyncHandler(async (req, res) => {
    const item = await DashboardService.updateItem(req.params.itemId, req.body, req.user.id);

    res.json({
      success: true,
      data: item
    });
  })
);

// Remove item from dashboard
router.delete('/:dashboardId/items/:itemId',
  validateCAToken,
  requirePermissions({ delete: true }),
  asyncHandler(async (req, res) => {
    await DashboardService.removeItem(req.params.itemId, req.user.id);

    res.json({
      success: true,
      message: 'Dashboard item removed successfully'
    });
  })
);

// Reorder dashboard items
router.post('/:id/items/reorder',
  validateCAToken,
  requirePermissions({ update: true }),
  asyncHandler(async (req, res) => {
    const { itemOrders } = req.body;

    if (!Array.isArray(itemOrders)) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'itemOrders must be an array'
      });
    }

    await DashboardService.reorderItems(req.params.id, itemOrders, req.user.id);

    res.json({
      success: true,
      message: 'Dashboard items reordered successfully'
    });
  })
);

// Update dashboard layout
router.post('/:id/layout',
  validateCAToken,
  requirePermissions({ update: true }),
  asyncHandler(async (req, res) => {
    const { itemPositions } = req.body;

    if (!Array.isArray(itemPositions)) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'itemPositions must be an array'
      });
    }

    await DashboardService.updateLayout(req.params.id, itemPositions, req.user.id);

    res.json({
      success: true,
      message: 'Dashboard layout updated successfully'
    });
  })
);

// Get dashboard statistics
router.get('/:id/statistics',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const stats = await DashboardService.getStatistics(req.params.id);

    res.json({
      success: true,
      data: stats
    });
  })
);

// Clone dashboard
router.post('/:id/clone',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const { name } = req.body;

    const cloned = await DashboardService.clone(req.params.id, req.user.id, name);

    res.status(201).json({
      success: true,
      data: cloned
    });
  })
);

// Create dashboard from template
router.post('/from-template/:templateId',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const dashboard = await DashboardService.createFromTemplate(
      req.params.templateId,
      req.user.id,
      req.body
    );

    res.status(201).json({
      success: true,
      data: dashboard
    });
  })
);

// Update dashboard
router.put('/:id',
  validateCAToken,
  requirePermissions({ update: true }),
  asyncHandler(async (req, res) => {
    const dashboard = await DashboardService.update(req.params.id, req.body, req.user.id);

    res.json({
      success: true,
      data: dashboard
    });
  })
);

// Delete dashboard
router.delete('/:id',
  validateCAToken,
  requirePermissions({ delete: true }),
  asyncHandler(async (req, res) => {
    await DashboardService.delete(req.params.id);

    res.json({
      success: true,
      message: 'Dashboard deleted successfully'
    });
  })
);

module.exports = router;
