const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { validateCAToken, requirePermissions, asyncHandler } = require('@exprsn/shared');
const routingService = require('../services/routingService');

/**
 * ═══════════════════════════════════════════════════════════
 * Routing Routes
 * Turn-by-turn directions, route optimization, map matching
 * ═══════════════════════════════════════════════════════════
 */

// Validation schemas
const coordinateSchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required()
});

const directionsSchema = Joi.object({
  origin: coordinateSchema.required(),
  destination: coordinateSchema.required(),
  mode: Joi.string().valid('driving', 'car', 'walking', 'foot', 'cycling', 'bike', 'bicycle').default('driving'),
  alternatives: Joi.boolean().default(false),
  steps: Joi.boolean().default(true),
  waypoints: Joi.array().items(coordinateSchema).max(23).default([])
});

const distanceMatrixSchema = Joi.object({
  sources: Joi.array().items(coordinateSchema).min(1).max(100).required(),
  destinations: Joi.array().items(coordinateSchema).min(1).max(100).optional(),
  mode: Joi.string().valid('driving', 'car', 'walking', 'foot', 'cycling', 'bike').default('driving')
});

const optimizeRouteSchema = Joi.object({
  waypoints: Joi.array().items(
    coordinateSchema.keys({
      name: Joi.string().optional()
    })
  ).min(2).max(12).required(),
  mode: Joi.string().valid('driving', 'car', 'walking', 'foot', 'cycling', 'bike').default('driving')
});

const matchRouteSchema = Joi.object({
  coordinates: Joi.array().items(
    coordinateSchema.keys({
      timestamp: Joi.number().optional()
    })
  ).min(2).required(),
  mode: Joi.string().valid('driving', 'car', 'walking', 'foot', 'cycling', 'bike').default('driving')
});

const saveRouteSchema = Joi.object({
  name: Joi.string().min(1).max(200).required(),
  type: Joi.string().valid('custom', 'drive', 'walk', 'cycle', 'hike', 'run').default('custom'),
  geometry: Joi.object({
    type: Joi.string().valid('LineString').required(),
    coordinates: Joi.array().items(Joi.array().length(2)).min(2).required()
  }).required(),
  waypoints: Joi.array().items(coordinateSchema).default([]),
  distanceMeters: Joi.number().min(0).required(),
  durationSeconds: Joi.number().min(0).required(),
  elevationGainMeters: Joi.number().min(0).optional(),
  elevationLossMeters: Joi.number().min(0).optional(),
  difficulty: Joi.string().valid('easy', 'moderate', 'hard', 'expert').optional(),
  tags: Joi.array().items(Joi.string()).default([]),
  properties: Joi.object().default({}),
  visibility: Joi.string().valid('public', 'private', 'unlisted').default('public')
});

/**
 * Get turn-by-turn directions
 * POST /api/routing/directions
 */
router.post('/directions',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = directionsSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { origin, destination, mode, alternatives, steps, waypoints } = value;

    const result = await routingService.getDirections(origin, destination, {
      mode,
      alternatives,
      steps,
      waypoints
    });

    res.json({
      success: true,
      data: result
    });
  })
);

/**
 * Calculate distance/time matrix
 * POST /api/routing/matrix
 */
router.post('/matrix',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = distanceMatrixSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { sources, destinations, mode } = value;

    const matrix = await routingService.getDistanceMatrix(sources, destinations, mode);

    res.json({
      success: true,
      data: matrix
    });
  })
);

/**
 * Optimize route with multiple waypoints (TSP solver)
 * POST /api/routing/optimize
 */
router.post('/optimize',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = optimizeRouteSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { waypoints, mode } = value;

    const result = await routingService.optimizeRoute(waypoints, mode);

    res.json({
      success: true,
      data: {
        waypoints,
        optimized: result,
        mode
      }
    });
  })
);

/**
 * Match GPS trace to road network (map matching)
 * POST /api/routing/match
 */
router.post('/match',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = matchRouteSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { coordinates, mode } = value;

    const result = await routingService.matchRoute(coordinates, mode);

    res.json({
      success: true,
      data: {
        original: {
          pointCount: coordinates.length
        },
        matched: result,
        mode
      }
    });
  })
);

/**
 * Save route to database
 * POST /api/routing/routes
 */
router.post('/routes',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = saveRouteSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User authentication required'
      });
    }

    const route = await routingService.saveRoute(value, userId);

    res.status(201).json({
      success: true,
      data: route
    });
  })
);

/**
 * Get saved route by ID
 * GET /api/routing/routes/:id
 */
router.get('/routes/:id',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const routeId = req.params.id;

    if (!routeId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid route ID format'
      });
    }

    const route = await routingService.getRoute(routeId);

    res.json({
      success: true,
      data: route
    });
  })
);

/**
 * Quick distance calculation (straight-line)
 * POST /api/routing/distance
 */
router.post('/distance',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const schema = Joi.object({
      from: coordinateSchema.required(),
      to: coordinateSchema.required()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { from, to } = value;

    // Use the spatialService for Haversine calculation
    const spatialService = require('../services/spatialService');
    const distance = await spatialService.calculateDistance(from, to);

    res.json({
      success: true,
      data: {
        from,
        to,
        straight_line: distance,
        note: 'This is straight-line distance. Use /directions for actual travel distance.'
      }
    });
  })
);

module.exports = router;
