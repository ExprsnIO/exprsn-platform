const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { validateCAToken, requirePermissions, asyncHandler } = require('@exprsn/shared');
const spatialService = require('../services/spatialService');

/**
 * ═══════════════════════════════════════════════════════════
 * Heatmap Routes
 * Generate heatmap data for location density visualization
 * ═══════════════════════════════════════════════════════════
 */

// Validation schemas
const heatmapSchema = Joi.object({
  bounds: Joi.object({
    swLat: Joi.number().min(-90).max(90).required(),
    swLng: Joi.number().min(-180).max(180).required(),
    neLat: Joi.number().min(-90).max(90).required(),
    neLng: Joi.number().min(-180).max(180).required()
  }).required(),
  entityType: Joi.string().optional(),
  intensity: Joi.string().valid('low', 'medium', 'high').default('medium'),
  gridSize: Joi.number().min(10).max(100).default(50)
});

const densitySchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
  radiusMeters: Joi.number().min(100).max(50000).required(),
  entityType: Joi.string().optional()
});

/**
 * Generate heatmap data for a bounding box
 * POST /api/heatmap/generate
 */
router.post('/generate',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = heatmapSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { bounds, entityType, intensity, gridSize } = value;

    const heatmapData = await spatialService.generateHeatmap(
      bounds,
      entityType,
      gridSize
    );

    // Adjust intensity based on parameter
    const intensityMultipliers = {
      low: 0.5,
      medium: 1.0,
      high: 1.5
    };

    const adjustedData = heatmapData.map(point => ({
      ...point,
      weight: point.weight * intensityMultipliers[intensity]
    }));

    res.json({
      success: true,
      data: {
        bounds,
        gridSize,
        intensity,
        points: adjustedData,
        count: adjustedData.length,
        maxWeight: Math.max(...adjustedData.map(p => p.weight), 0)
      }
    });
  })
);

/**
 * Get location density at a specific point
 * POST /api/heatmap/density
 */
router.post('/density',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = densitySchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { lat, lng, radiusMeters, entityType } = value;

    const nearby = await spatialService.findLocationsNearby(
      lat,
      lng,
      radiusMeters,
      { entityType, limit: 1000 }
    );

    const density = nearby.locations.length;
    const area = Math.PI * Math.pow(radiusMeters, 2); // m²
    const densityPerKm2 = (density / area) * 1000000; // per km²

    // Calculate density classification
    let classification;
    if (densityPerKm2 < 10) {
      classification = 'sparse';
    } else if (densityPerKm2 < 50) {
      classification = 'moderate';
    } else if (densityPerKm2 < 200) {
      classification = 'dense';
    } else {
      classification = 'very_dense';
    }

    res.json({
      success: true,
      data: {
        center: { lat, lng },
        radiusMeters,
        count: density,
        densityPerKm2: parseFloat(densityPerKm2.toFixed(2)),
        classification,
        entityType: entityType || 'all'
      }
    });
  })
);

/**
 * Get hotspot areas (clusters with highest density)
 * POST /api/heatmap/hotspots
 */
router.post('/hotspots',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const schema = Joi.object({
      bounds: Joi.object({
        swLat: Joi.number().min(-90).max(90).required(),
        swLng: Joi.number().min(-180).max(180).required(),
        neLat: Joi.number().min(-90).max(90).required(),
        neLng: Joi.number().min(-180).max(180).required()
      }).required(),
      entityType: Joi.string().optional(),
      clusterRadius: Joi.number().min(100).max(10000).default(1000),
      minDensity: Joi.number().min(1).default(5),
      limit: Joi.number().min(1).max(50).default(10)
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { bounds, entityType, clusterRadius, minDensity, limit } = value;

    const clusters = await spatialService.clusterLocations(
      bounds,
      entityType,
      clusterRadius
    );

    // Filter by minimum density and sort by count
    const hotspots = clusters
      .filter(cluster => cluster.count >= minDensity)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map(cluster => ({
        ...cluster,
        classification: cluster.count < 10 ? 'warm' :
                       cluster.count < 50 ? 'hot' :
                       'very_hot'
      }));

    res.json({
      success: true,
      data: {
        bounds,
        clusterRadius,
        minDensity,
        hotspots,
        count: hotspots.length
      }
    });
  })
);

/**
 * Compare density between two areas
 * POST /api/heatmap/compare
 */
router.post('/compare',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const schema = Joi.object({
      area1: Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required(),
        radiusMeters: Joi.number().min(100).max(50000).required(),
        name: Joi.string().optional()
      }).required(),
      area2: Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required(),
        radiusMeters: Joi.number().min(100).max(50000).required(),
        name: Joi.string().optional()
      }).required(),
      entityType: Joi.string().optional()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { area1, area2, entityType } = value;

    // Get density for both areas
    const [density1Results, density2Results] = await Promise.all([
      spatialService.findLocationsNearby(
        area1.lat,
        area1.lng,
        area1.radiusMeters,
        { entityType, limit: 1000 }
      ),
      spatialService.findLocationsNearby(
        area2.lat,
        area2.lng,
        area2.radiusMeters,
        { entityType, limit: 1000 }
      )
    ]);

    const calculateDensity = (count, radius) => {
      const area = Math.PI * Math.pow(radius, 2);
      return (count / area) * 1000000; // per km²
    };

    const density1 = calculateDensity(density1Results.locations.length, area1.radiusMeters);
    const density2 = calculateDensity(density2Results.locations.length, area2.radiusMeters);

    const percentageDifference = density1 > 0
      ? ((density2 - density1) / density1) * 100
      : 0;

    res.json({
      success: true,
      data: {
        area1: {
          name: area1.name || 'Area 1',
          center: { lat: area1.lat, lng: area1.lng },
          radiusMeters: area1.radiusMeters,
          count: density1Results.locations.length,
          densityPerKm2: parseFloat(density1.toFixed(2))
        },
        area2: {
          name: area2.name || 'Area 2',
          center: { lat: area2.lat, lng: area2.lng },
          radiusMeters: area2.radiusMeters,
          count: density2Results.locations.length,
          densityPerKm2: parseFloat(density2.toFixed(2))
        },
        comparison: {
          percentageDifference: parseFloat(percentageDifference.toFixed(2)),
          denser: density1 > density2 ? 'area1' : density2 > density1 ? 'area2' : 'equal',
          ratio: density2 > 0 ? parseFloat((density1 / density2).toFixed(2)) : null
        },
        entityType: entityType || 'all'
      }
    });
  })
);

module.exports = router;
