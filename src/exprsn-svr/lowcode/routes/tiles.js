/**
 * Tiles Routes
 *
 * RESTful API endpoints for tile management.
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { Tile, ApplicationTile, Application } = require('../models');

// Middleware
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Validation schemas
const listTilesSchema = Joi.object({
  category: Joi.string().valid('data', 'design', 'automation', 'integration', 'security', 'analytics', 'system'),
  includeInactive: Joi.boolean().default(false),
  sortBy: Joi.string().valid('sortOrder', 'name', 'category', 'created_at').default('sortOrder'),
  sortOrder: Joi.string().valid('ASC', 'DESC').default('ASC'),
});

const enableTileSchema = Joi.object({
  customName: Joi.string().max(255).allow('', null),
  customDescription: Joi.string().allow('', null),
  customIcon: Joi.string().max(100).allow('', null),
  sortOrder: Joi.number().integer().min(0).allow(null),
  settings: Joi.object().default({}),
});

/**
 * @route   GET /lowcode/api/tiles
 * @desc    List all tiles
 * @access  Private
 */
router.get('/', asyncHandler(async (req, res) => {
  const { error, value } = listTilesSchema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message,
    });
  }

  const tiles = await Tile.getAll(value);

  res.json({
    success: true,
    data: tiles,
    count: tiles.length,
  });
}));

/**
 * @route   GET /lowcode/api/tiles/categories
 * @desc    Get tiles grouped by category
 * @access  Private
 */
router.get('/categories', asyncHandler(async (req, res) => {
  const { includeInactive = false } = req.query;

  const where = {};
  if (!includeInactive) where.isActive = true;

  const tiles = await Tile.findAll({
    where,
    order: [['category', 'ASC'], ['sortOrder', 'ASC'], ['name', 'ASC']],
  });

  // Group by category
  const tilesByCategory = tiles.reduce((acc, tile) => {
    if (!acc[tile.category]) {
      acc[tile.category] = [];
    }
    acc[tile.category].push(tile);
    return acc;
  }, {});

  res.json({
    success: true,
    data: tilesByCategory,
  });
}));

/**
 * @route   GET /lowcode/api/tiles/:id
 * @desc    Get tile by ID
 * @access  Private
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const tile = await Tile.findByPk(id);

  if (!tile) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Tile not found',
    });
  }

  res.json({
    success: true,
    data: tile,
  });
}));

/**
 * @route   GET /lowcode/api/tiles/key/:key
 * @desc    Get tile by key
 * @access  Private
 */
router.get('/key/:key', asyncHandler(async (req, res) => {
  const { key } = req.params;

  const tile = await Tile.findOne({ where: { key } });

  if (!tile) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: `Tile with key '${key}' not found`,
    });
  }

  res.json({
    success: true,
    data: tile,
  });
}));

/**
 * @route   GET /lowcode/api/tiles/application/:applicationId
 * @desc    Get enabled tiles for an application
 * @access  Private
 */
router.get('/application/:applicationId', asyncHandler(async (req, res) => {
  const { applicationId } = req.params;

  // Verify application exists
  const application = await Application.findByPk(applicationId);
  if (!application) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Application not found',
    });
  }

  // Get enabled tiles for this application
  const applicationTiles = await ApplicationTile.getEnabledTiles(applicationId);

  // If no custom tiles configured, return all active tiles
  if (applicationTiles.length === 0) {
    const defaultTiles = await Tile.findAll({
      where: { isActive: true },
      order: [['sortOrder', 'ASC'], ['name', 'ASC']],
    });

    return res.json({
      success: true,
      data: defaultTiles,
      isDefault: true,
    });
  }

  // Return custom tiles with effective values
  const tilesWithEffectiveValues = applicationTiles.map(appTile => ({
    ...appTile.tile.toJSON(),
    applicationTileId: appTile.id,
    effectiveName: appTile.getEffectiveName(),
    effectiveDescription: appTile.getEffectiveDescription(),
    effectiveIcon: appTile.getEffectiveIcon(),
    effectiveSortOrder: appTile.getEffectiveSortOrder(),
    customSettings: appTile.settings,
  }));

  res.json({
    success: true,
    data: tilesWithEffectiveValues,
    isDefault: false,
  });
}));

/**
 * @route   POST /lowcode/api/tiles/application/:applicationId/:tileId/enable
 * @desc    Enable a tile for an application
 * @access  Private
 */
router.post('/application/:applicationId/:tileId/enable', asyncHandler(async (req, res) => {
  const { applicationId, tileId } = req.params;
  const { error, value } = enableTileSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message,
    });
  }

  // Verify application exists
  const application = await Application.findByPk(applicationId);
  if (!application) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Application not found',
    });
  }

  // Verify tile exists
  const tile = await Tile.findByPk(tileId);
  if (!tile) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Tile not found',
    });
  }

  // Enable tile for application
  const appTile = await ApplicationTile.enableForApplication(applicationId, tileId, value);

  res.json({
    success: true,
    message: `Tile '${tile.name}' enabled for application`,
    data: appTile,
  });
}));

/**
 * @route   POST /lowcode/api/tiles/application/:applicationId/:tileId/disable
 * @desc    Disable a tile for an application
 * @access  Private
 */
router.post('/application/:applicationId/:tileId/disable', asyncHandler(async (req, res) => {
  const { applicationId, tileId } = req.params;

  // Verify application exists
  const application = await Application.findByPk(applicationId);
  if (!application) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Application not found',
    });
  }

  // Verify tile exists
  const tile = await Tile.findByPk(tileId);
  if (!tile) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Tile not found',
    });
  }

  // Disable tile for application
  const appTile = await ApplicationTile.disableForApplication(applicationId, tileId);

  if (!appTile) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Tile is not configured for this application',
    });
  }

  res.json({
    success: true,
    message: `Tile '${tile.name}' disabled for application`,
    data: appTile,
  });
}));

/**
 * @route   PUT /lowcode/api/tiles/application/:applicationId/:tileId
 * @desc    Update tile configuration for an application
 * @access  Private
 */
router.put('/application/:applicationId/:tileId', asyncHandler(async (req, res) => {
  const { applicationId, tileId } = req.params;
  const { error, value } = enableTileSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message,
    });
  }

  const appTile = await ApplicationTile.findOne({
    where: { applicationId, tileId },
    include: [{ model: Tile, as: 'tile' }],
  });

  if (!appTile) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Tile is not configured for this application',
    });
  }

  // Update tile configuration
  await appTile.update(value);

  res.json({
    success: true,
    message: 'Tile configuration updated',
    data: appTile,
  });
}));

/**
 * @route   POST /lowcode/api/tiles/application/:applicationId/reset
 * @desc    Reset tiles to defaults for an application
 * @access  Private
 */
router.post('/application/:applicationId/reset', asyncHandler(async (req, res) => {
  const { applicationId } = req.params;

  // Verify application exists
  const application = await Application.findByPk(applicationId);
  if (!application) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Application not found',
    });
  }

  // Delete all custom tile configurations
  const deletedCount = await ApplicationTile.destroy({
    where: { applicationId },
  });

  res.json({
    success: true,
    message: 'Tile configuration reset to defaults',
    deletedCount,
  });
}));

module.exports = router;
