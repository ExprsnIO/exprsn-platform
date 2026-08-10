const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { validateCAToken, requirePermissions, asyncHandler } = require('@exprsn/shared');
const elevationService = require('../services/elevationService');

/**
 * ═══════════════════════════════════════════════════════════
 * Elevation Routes
 * Terrain elevation queries and slope analysis
 * ═══════════════════════════════════════════════════════════
 */

// Validation schemas
const coordinateSchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required()
});

const elevationSchema = coordinateSchema;

const elevationProfileSchema = Joi.object({
  path: Joi.array().items(coordinateSchema).min(2).max(500).required(),
  samples: Joi.number().min(2).max(100).optional()
});

const elevationBulkSchema = Joi.object({
  points: Joi.array().items(coordinateSchema).min(1).max(100).required()
});

const slopeSchema = Joi.object({
  start: coordinateSchema.required(),
  end: coordinateSchema.required()
});

/**
 * Get elevation at a single point
 * POST /api/elevation/point
 */
router.post('/point',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = elevationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { lat, lng } = value;

    const result = await elevationService.getElevation(lat, lng);

    res.json({
      success: true,
      data: result
    });
  })
);

/**
 * Get elevation at a single point (GET method for convenience)
 * GET /api/elevation/point?lat=40.7128&lng=-74.0060
 */
router.get('/point',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = elevationSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { lat, lng } = value;

    const result = await elevationService.getElevation(lat, lng);

    res.json({
      success: true,
      data: result
    });
  })
);

/**
 * Get elevation profile along a path
 * POST /api/elevation/profile
 */
router.post('/profile',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = elevationProfileSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { path, samples } = value;

    const result = await elevationService.getElevationProfile(path, samples);

    res.json({
      success: true,
      data: result
    });
  })
);

/**
 * Get elevation for multiple points (bulk request)
 * POST /api/elevation/bulk
 */
router.post('/bulk',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = elevationBulkSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { points } = value;

    const results = await elevationService.getElevationBulk(points);

    res.json({
      success: true,
      data: {
        points: results,
        count: results.length
      }
    });
  })
);

/**
 * Calculate slope/grade between two points
 * POST /api/elevation/slope
 */
router.post('/slope',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = slopeSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { start, end } = value;

    const result = await elevationService.getSlope(
      start.lat,
      start.lng,
      end.lat,
      end.lng
    );

    res.json({
      success: true,
      data: result
    });
  })
);

/**
 * Get terrain statistics for a route
 * POST /api/elevation/route-stats
 */
router.post('/route-stats',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = elevationProfileSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { path, samples } = value;

    const result = await elevationService.getElevationProfile(path, samples);

    // Return only statistics (not full profile)
    res.json({
      success: true,
      data: {
        statistics: result.statistics,
        sampleCount: result.profile.length,
        pathPointCount: path.length
      }
    });
  })
);

module.exports = router;
