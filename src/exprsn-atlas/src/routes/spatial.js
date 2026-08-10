const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { validateCAToken, requirePermissions, asyncHandler } = require('@exprsn/shared');
const spatialService = require('../services/spatialService');

/**
 * ═══════════════════════════════════════════════════════════
 * Spatial Query Routes
 * Proximity search, bounding box queries, geofence checking
 * ═══════════════════════════════════════════════════════════
 */

// Validation schemas
const nearbySchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
  radiusMeters: Joi.number().min(1).max(500000).required(),
  entityType: Joi.string().optional(),
  limit: Joi.number().min(1).max(100).default(50),
  offset: Joi.number().min(0).default(0)
});

const boundingBoxSchema = Joi.object({
  swLat: Joi.number().min(-90).max(90).required(),
  swLng: Joi.number().min(-180).max(180).required(),
  neLat: Joi.number().min(-90).max(90).required(),
  neLng: Joi.number().min(-180).max(180).required(),
  entityType: Joi.string().optional(),
  limit: Joi.number().min(1).max(100).default(50),
  offset: Joi.number().min(0).default(0)
});

const checkGeofenceSchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
  geofenceIds: Joi.array().items(Joi.string().uuid()).optional()
});

const routeSchema = Joi.object({
  path: Joi.array().items(
    Joi.object({
      lat: Joi.number().min(-90).max(90).required(),
      lng: Joi.number().min(-180).max(180).required()
    })
  ).min(2).required(),
  radiusMeters: Joi.number().min(1).max(10000).required()
});

const clusterSchema = Joi.object({
  bounds: Joi.object({
    swLat: Joi.number().min(-90).max(90).required(),
    swLng: Joi.number().min(-180).max(180).required(),
    neLat: Joi.number().min(-90).max(90).required(),
    neLng: Joi.number().min(-180).max(180).required()
  }).required(),
  entityType: Joi.string().optional(),
  clusterRadius: Joi.number().min(100).max(50000).default(5000)
});

/**
 * Find locations near a point
 * GET /api/spatial/nearby?lat=40.7128&lng=-74.0060&radiusMeters=1000
 */
router.get('/nearby',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = nearbySchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { lat, lng, radiusMeters, entityType, limit, offset } = value;

    const results = await spatialService.findLocationsNearby(
      lat,
      lng,
      radiusMeters,
      { entityType, limit, offset }
    );

    res.json({
      success: true,
      data: {
        center: { lat, lng },
        radiusMeters,
        locations: results.locations,
        total: results.total,
        pagination: {
          limit,
          offset,
          hasMore: results.total > offset + results.locations.length
        }
      }
    });
  })
);

/**
 * Find locations within a bounding box
 * GET /api/spatial/bbox?swLat=40.7&swLng=-74.1&neLat=40.8&neLng=-74.0
 */
router.get('/bbox',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = boundingBoxSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { swLat, swLng, neLat, neLng, entityType, limit, offset } = value;

    const results = await spatialService.findLocationsInBoundingBox(
      { swLat, swLng, neLat, neLng },
      { entityType, limit, offset }
    );

    res.json({
      success: true,
      data: {
        bounds: { swLat, swLng, neLat, neLng },
        locations: results.locations,
        total: results.total,
        pagination: {
          limit,
          offset,
          hasMore: results.total > offset + results.locations.length
        }
      }
    });
  })
);

/**
 * Check if a point is within any geofences
 * POST /api/spatial/geofence-check
 */
router.post('/geofence-check',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = checkGeofenceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { lat, lng, geofenceIds } = value;

    const results = await spatialService.checkGeofences(lat, lng, geofenceIds);

    res.json({
      success: true,
      data: {
        point: { lat, lng },
        withinGeofences: results.length > 0,
        geofences: results
      }
    });
  })
);

/**
 * Find locations along a route/path
 * POST /api/spatial/route-search
 */
router.post('/route-search',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = routeSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { path, radiusMeters } = value;

    const locations = await spatialService.findLocationsAlongRoute(path, radiusMeters);

    res.json({
      success: true,
      data: {
        path,
        radiusMeters,
        locations,
        total: locations.length
      }
    });
  })
);

/**
 * Get location clusters for map visualization
 * POST /api/spatial/clusters
 */
router.post('/clusters',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = clusterSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { bounds, entityType, clusterRadius } = value;

    const clusters = await spatialService.clusterLocations(bounds, entityType, clusterRadius);

    res.json({
      success: true,
      data: {
        bounds,
        clusterRadius,
        clusters,
        totalClusters: clusters.length
      }
    });
  })
);

/**
 * Calculate distance between two points
 * GET /api/spatial/distance?lat1=40.7128&lng1=-74.0060&lat2=40.7489&lng2=-73.9680
 */
router.get('/distance',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const schema = Joi.object({
      lat1: Joi.number().min(-90).max(90).required(),
      lng1: Joi.number().min(-180).max(180).required(),
      lat2: Joi.number().min(-90).max(90).required(),
      lng2: Joi.number().min(-180).max(180).required()
    });

    const { error, value } = schema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { lat1, lng1, lat2, lng2 } = value;

    const distance = await spatialService.calculateDistance(
      { lat: lat1, lng: lng1 },
      { lat: lat2, lng: lng2 }
    );

    res.json({
      success: true,
      data: {
        from: { lat: lat1, lng: lng1 },
        to: { lat: lat2, lng: lng2 },
        distanceMeters: distance.meters,
        distanceKm: distance.km,
        distanceMiles: distance.miles
      }
    });
  })
);

module.exports = router;
