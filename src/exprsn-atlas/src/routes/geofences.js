const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { validateCAToken, requirePermissions, asyncHandler } = require('@exprsn/shared');
const geofencingService = require('../services/geofencingService');

/**
 * ═══════════════════════════════════════════════════════════
 * Geofence Routes
 * Create and manage geographic boundaries
 * ═══════════════════════════════════════════════════════════
 */

// Validation schemas
const createCircularSchema = Joi.object({
  name: Joi.string().min(1).max(200).required(),
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  radiusMeters: Joi.number().min(1).max(100000).required(),
  purpose: Joi.string().valid('delivery', 'marketing', 'notification', 'restriction', 'custom').default('custom'),
  entityType: Joi.string().optional(),
  entityId: Joi.string().uuid().optional(),
  triggers: Joi.object({
    onEntry: Joi.object({
      enabled: Joi.boolean().default(false),
      action: Joi.string().optional(),
      data: Joi.object().optional()
    }).optional(),
    onExit: Joi.object({
      enabled: Joi.boolean().default(false),
      action: Joi.string().optional(),
      data: Joi.object().optional()
    }).optional()
  }).default({}),
  properties: Joi.object().default({}),
  expiresAt: Joi.number().optional()
});

const createPolygonSchema = Joi.object({
  name: Joi.string().min(1).max(200).required(),
  coordinates: Joi.array().items(
    Joi.array().ordered(
      Joi.number().min(-180).max(180).required(), // lng
      Joi.number().min(-90).max(90).required()    // lat
    ).length(2)
  ).min(4).required(),
  purpose: Joi.string().valid('delivery', 'marketing', 'notification', 'restriction', 'custom').default('custom'),
  entityType: Joi.string().optional(),
  entityId: Joi.string().uuid().optional(),
  triggers: Joi.object().default({}),
  properties: Joi.object().default({}),
  expiresAt: Joi.number().optional()
});

const createRectangularSchema = Joi.object({
  name: Joi.string().min(1).max(200).required(),
  swLat: Joi.number().min(-90).max(90).required(),
  swLng: Joi.number().min(-180).max(180).required(),
  neLat: Joi.number().min(-90).max(90).required(),
  neLng: Joi.number().min(-180).max(180).required(),
  purpose: Joi.string().valid('delivery', 'marketing', 'notification', 'restriction', 'custom').default('custom'),
  entityType: Joi.string().optional(),
  entityId: Joi.string().uuid().optional(),
  triggers: Joi.object().default({}),
  properties: Joi.object().default({}),
  expiresAt: Joi.number().optional()
});

const checkPointSchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
  purpose: Joi.string().optional(),
  entityType: Joi.string().optional(),
  entityId: Joi.string().uuid().optional()
});

const listGeofencesSchema = Joi.object({
  purpose: Joi.string().optional(),
  entityType: Joi.string().optional(),
  entityId: Joi.string().uuid().optional(),
  type: Joi.string().valid('circular', 'polygon', 'rectangular').optional(),
  isActive: Joi.boolean().default(true),
  includeExpired: Joi.boolean().default(false),
  limit: Joi.number().min(1).max(100).default(50),
  offset: Joi.number().min(0).default(0)
});

const updateGeofenceSchema = Joi.object({
  name: Joi.string().min(1).max(200).optional(),
  triggers: Joi.object().optional(),
  properties: Joi.object().optional(),
  expiresAt: Joi.number().allow(null).optional(),
  isActive: Joi.boolean().optional()
}).min(1);

const monitorTransitionsSchema = Joi.object({
  currentLat: Joi.number().min(-90).max(90).required(),
  currentLng: Joi.number().min(-180).max(180).required(),
  previousLat: Joi.number().min(-90).max(90).required(),
  previousLng: Joi.number().min(-180).max(180).required()
});

/**
 * Create a circular geofence
 * POST /api/geofences/circular
 */
router.post('/circular',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = createCircularSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const userId = req.user?.id;
    const geofence = await geofencingService.createCircularGeofence({
      ...value,
      createdBy: userId
    });

    res.status(201).json({
      success: true,
      data: geofence
    });
  })
);

/**
 * Create a polygon geofence
 * POST /api/geofences/polygon
 */
router.post('/polygon',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = createPolygonSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const userId = req.user?.id;
    const geofence = await geofencingService.createPolygonGeofence({
      ...value,
      createdBy: userId
    });

    res.status(201).json({
      success: true,
      data: geofence
    });
  })
);

/**
 * Create a rectangular geofence
 * POST /api/geofences/rectangular
 */
router.post('/rectangular',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = createRectangularSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const userId = req.user?.id;
    const geofence = await geofencingService.createRectangularGeofence({
      ...value,
      createdBy: userId
    });

    res.status(201).json({
      success: true,
      data: geofence
    });
  })
);

/**
 * Check if a point is within geofences
 * POST /api/geofences/check
 */
router.post('/check',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = checkPointSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { lat, lng, purpose, entityType, entityId } = value;

    const geofences = await geofencingService.checkPoint(lat, lng, {
      purpose,
      entityType,
      entityId
    });

    res.json({
      success: true,
      data: {
        point: { lat, lng },
        withinGeofences: geofences.length > 0,
        geofences,
        count: geofences.length
      }
    });
  })
);

/**
 * List geofences with filters
 * GET /api/geofences
 */
router.get('/',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = listGeofencesSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const result = await geofencingService.listGeofences(value);

    res.json({
      success: true,
      data: result
    });
  })
);

/**
 * Get geofence by ID
 * GET /api/geofences/:id
 */
router.get('/:id',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const geofenceId = req.params.id;

    if (!geofenceId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid geofence ID format'
      });
    }

    const geofence = await geofencingService.getGeofence(geofenceId);

    res.json({
      success: true,
      data: geofence
    });
  })
);

/**
 * Update geofence
 * PUT /api/geofences/:id
 */
router.put('/:id',
  validateCAToken,
  requirePermissions({ update: true }),
  asyncHandler(async (req, res) => {
    const geofenceId = req.params.id;

    if (!geofenceId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid geofence ID format'
      });
    }

    const { error, value } = updateGeofenceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const geofence = await geofencingService.updateGeofence(geofenceId, value);

    res.json({
      success: true,
      data: geofence
    });
  })
);

/**
 * Delete geofence (soft delete)
 * DELETE /api/geofences/:id
 */
router.delete('/:id',
  validateCAToken,
  requirePermissions({ delete: true }),
  asyncHandler(async (req, res) => {
    const geofenceId = req.params.id;

    if (!geofenceId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid geofence ID format'
      });
    }

    await geofencingService.deleteGeofence(geofenceId);

    res.json({
      success: true,
      message: 'Geofence deleted successfully'
    });
  })
);

/**
 * Monitor geofence transitions (entry/exit)
 * POST /api/geofences/monitor
 */
router.post('/monitor',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = monitorTransitionsSchema.validate(req.body);
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

    const { currentLat, currentLng, previousLat, previousLng } = value;

    const result = await geofencingService.monitorTransitions(
      userId,
      currentLat,
      currentLng,
      previousLat,
      previousLng
    );

    res.json({
      success: true,
      data: result
    });
  })
);

module.exports = router;
