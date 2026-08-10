const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { validateCAToken, requirePermissions, asyncHandler } = require('@exprsn/shared');
const spatialService = require('../services/spatialService');
const geocodingService = require('../services/geocodingService');
const routingService = require('../services/routingService');
const elevationService = require('../services/elevationService');
const geofencingService = require('../services/geofencingService');

/**
 * ═══════════════════════════════════════════════════════════
 * Bridge Integration Routes
 * Simplified endpoints for service-to-service integration
 * Designed for use by exprsn-bridge and other services
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Quick location lookup - combines nearby search with geocoding
 * POST /api/bridge/location-lookup
 *
 * Use case: When a user provides either an address OR coordinates,
 * return nearby locations and normalized address/coordinates
 */
router.post('/location-lookup',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const schema = Joi.object({
      address: Joi.string().min(1).max(500).optional(),
      lat: Joi.number().min(-90).max(90).optional(),
      lng: Joi.number().min(-180).max(180).optional(),
      radiusMeters: Joi.number().min(1).max(50000).default(1000),
      entityType: Joi.string().optional(),
      limit: Joi.number().min(1).max(100).default(20)
    }).xor('address', 'lat'); // Must have either address or lat (and if lat, then lng)

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { address, lat, lng, radiusMeters, entityType, limit } = value;

    let coordinates;
    let normalizedAddress;

    // If address provided, geocode it
    if (address) {
      const geocodeResults = await geocodingService.geocode(address);
      if (geocodeResults.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Address not found'
        });
      }
      const bestMatch = geocodeResults[0];
      coordinates = { lat: bestMatch.latitude, lng: bestMatch.longitude };
      normalizedAddress = bestMatch.formattedAddress;
    } else {
      // If coordinates provided, reverse geocode
      coordinates = { lat, lng };
      const reverseResult = await geocodingService.reverseGeocode(lat, lng);
      normalizedAddress = reverseResult?.formattedAddress || null;
    }

    // Find nearby locations
    const nearbyResults = await spatialService.findLocationsNearby(
      coordinates.lat,
      coordinates.lng,
      radiusMeters,
      { entityType, limit }
    );

    res.json({
      success: true,
      data: {
        query: address || `${coordinates.lat}, ${coordinates.lng}`,
        coordinates,
        address: normalizedAddress,
        nearby: {
          radiusMeters,
          locations: nearbyResults.locations,
          count: nearbyResults.total
        }
      }
    });
  })
);

/**
 * Quick distance calculation with route
 * POST /api/bridge/distance
 *
 * Use case: Get both straight-line and route distance between two points
 */
router.post('/distance',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const schema = Joi.object({
      from: Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required()
      }).required(),
      to: Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required()
      }).required(),
      mode: Joi.string().valid('driving', 'walking', 'cycling').default('driving'),
      includeRoute: Joi.boolean().default(true)
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { from, to, mode, includeRoute } = value;

    // Calculate straight-line distance
    const straightLine = await spatialService.calculateDistance(from, to);

    const result = {
      from,
      to,
      straightLine
    };

    // Calculate route distance if requested
    if (includeRoute) {
      try {
        const directions = await routingService.getDirections(from, to, {
          mode,
          alternatives: false,
          steps: false
        });

        result.route = {
          mode,
          distanceMeters: directions.routes[0].distanceMeters,
          distanceKm: directions.routes[0].distanceKm,
          distanceMiles: directions.routes[0].distanceMiles,
          durationSeconds: directions.routes[0].durationSeconds,
          durationMinutes: directions.routes[0].durationMinutes,
          durationFormatted: directions.routes[0].durationFormatted
        };

        // Calculate route vs straight-line ratio
        result.routeEfficiency = {
          ratio: (result.route.distanceMeters / straightLine.meters).toFixed(2),
          additionalDistance: result.route.distanceMeters - straightLine.meters,
          note: 'Ratio of 1.0 = straight line, higher values indicate more indirect route'
        };
      } catch (routeError) {
        result.route = {
          error: 'Route calculation failed',
          message: routeError.message
        };
      }
    }

    res.json({
      success: true,
      data: result
    });
  })
);

/**
 * Geocode and validate address
 * POST /api/bridge/geocode
 *
 * Use case: Validate user-entered address and get normalized form
 */
router.post('/geocode',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const schema = Joi.object({
      address: Joi.string().min(1).max(500).required(),
      validate: Joi.boolean().default(true)
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { address, validate } = value;

    if (validate) {
      const validationResult = await geocodingService.validateAddress(address);
      res.json({
        success: true,
        data: validationResult
      });
    } else {
      const results = await geocodingService.geocode(address);
      res.json({
        success: true,
        data: {
          query: address,
          results,
          count: results.length
        }
      });
    }
  })
);

/**
 * Check geofence triggers
 * POST /api/bridge/geofence-check
 *
 * Use case: Check if user/entity entered or exited geofences
 */
router.post('/geofence-check',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const schema = Joi.object({
      userId: Joi.string().uuid().required(),
      currentLocation: Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required()
      }).required(),
      previousLocation: Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required()
      }).optional(),
      entityType: Joi.string().optional(),
      purpose: Joi.string().optional()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { userId, currentLocation, previousLocation, entityType, purpose } = value;

    // Check current geofences
    const currentGeofences = await geofencingService.checkPoint(
      currentLocation.lat,
      currentLocation.lng,
      { entityType, purpose }
    );

    const result = {
      userId,
      currentLocation,
      withinGeofences: currentGeofences.length > 0,
      geofences: currentGeofences
    };

    // If previous location provided, check for transitions
    if (previousLocation) {
      const transitions = await geofencingService.monitorTransitions(
        userId,
        currentLocation.lat,
        currentLocation.lng,
        previousLocation.lat,
        previousLocation.lng
      );

      result.transitions = transitions;
      result.events = transitions.events;
    }

    res.json({
      success: true,
      data: result
    });
  })
);

/**
 * Quick route with elevation profile
 * POST /api/bridge/route-profile
 *
 * Use case: Get route with elevation data for activity tracking
 */
router.post('/route-profile',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const schema = Joi.object({
      from: Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required()
      }).required(),
      to: Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required()
      }).required(),
      mode: Joi.string().valid('driving', 'walking', 'cycling').default('walking'),
      includeElevation: Joi.boolean().default(true),
      elevationSamples: Joi.number().min(10).max(100).default(50)
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { from, to, mode, includeElevation, elevationSamples } = value;

    // Get route
    const directions = await routingService.getDirections(from, to, {
      mode,
      alternatives: false,
      steps: true
    });

    const route = directions.routes[0];
    const result = {
      from,
      to,
      mode,
      route: {
        distanceMeters: route.distanceMeters,
        distanceKm: route.distanceKm,
        durationSeconds: route.durationSeconds,
        durationFormatted: route.durationFormatted,
        geometry: route.geometry,
        steps: route.legs[0].steps
      }
    };

    // Add elevation profile if requested
    if (includeElevation) {
      try {
        // Extract path points from geometry
        const path = route.geometry.coordinates.map(coord => ({
          lat: coord[1],
          lng: coord[0]
        }));

        const elevationProfile = await elevationService.getElevationProfile(
          path,
          elevationSamples
        );

        result.elevation = elevationProfile;
        result.terrain = {
          difficulty: elevationProfile.statistics.elevationGain > 100 ? 'moderate' : 'easy',
          elevationGain: elevationProfile.statistics.elevationGain,
          elevationLoss: elevationProfile.statistics.elevationLoss,
          minElevation: elevationProfile.statistics.minElevation,
          maxElevation: elevationProfile.statistics.maxElevation
        };
      } catch (elevError) {
        result.elevation = {
          error: 'Elevation data unavailable',
          message: elevError.message
        };
      }
    }

    res.json({
      success: true,
      data: result
    });
  })
);

/**
 * Batch geocode addresses
 * POST /api/bridge/geocode-batch
 *
 * Use case: Import/validate multiple addresses at once
 */
router.post('/geocode-batch',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const schema = Joi.object({
      addresses: Joi.array().items(Joi.string().min(1).max(500)).min(1).max(100).required()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { addresses } = value;

    const results = await geocodingService.batchGeocode(addresses);

    const summary = {
      total: addresses.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    };

    res.json({
      success: true,
      data: {
        results,
        summary
      }
    });
  })
);

/**
 * Find optimal route visiting multiple points
 * POST /api/bridge/optimize-route
 *
 * Use case: Delivery routing, multi-stop trip planning
 */
router.post('/optimize-route',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const schema = Joi.object({
      waypoints: Joi.array().items(
        Joi.object({
          lat: Joi.number().min(-90).max(90).required(),
          lng: Joi.number().min(-180).max(180).required(),
          name: Joi.string().optional()
        })
      ).min(2).max(12).required(),
      mode: Joi.string().valid('driving', 'walking', 'cycling').default('driving')
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { waypoints, mode } = value;

    const optimized = await routingService.optimizeRoute(waypoints, mode);

    res.json({
      success: true,
      data: {
        original: {
          waypoints,
          count: waypoints.length
        },
        optimized: {
          ...optimized,
          mode
        },
        savings: {
          note: 'Distance/time savings compared to visiting waypoints in original order'
        }
      }
    });
  })
);

/**
 * Service health check
 * GET /api/bridge/health
 */
router.get('/health',
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      service: 'exprsn-atlas',
      version: '1.0.0',
      endpoints: {
        'location-lookup': 'Geocode + nearby search',
        'distance': 'Straight-line + route distance',
        'geocode': 'Address validation and geocoding',
        'geofence-check': 'Check geofence transitions',
        'route-profile': 'Route with elevation data',
        'geocode-batch': 'Batch address geocoding',
        'optimize-route': 'Multi-waypoint optimization'
      },
      integration: 'bridge',
      timestamp: new Date().toISOString()
    });
  })
);

module.exports = router;
