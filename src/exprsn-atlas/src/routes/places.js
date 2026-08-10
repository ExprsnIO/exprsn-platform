const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { validateCAToken, requirePermissions, asyncHandler } = require('@exprsn/shared');
const { Place, Location } = require('../models');
const sequelize = require('../config/database');

/**
 * ═══════════════════════════════════════════════════════════
 * Places Routes
 * Manage points of interest, landmarks, and locations
 * ═══════════════════════════════════════════════════════════
 */

// Validation schemas
const createPlaceSchema = Joi.object({
  name: Joi.string().min(1).max(200).required(),
  description: Joi.string().max(2000).optional(),
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  category: Joi.string().valid(
    'restaurant', 'cafe', 'bar', 'hotel', 'attraction', 'museum',
    'park', 'beach', 'shopping', 'service', 'transportation', 'other'
  ).required(),
  address: Joi.object({
    street: Joi.string().optional(),
    city: Joi.string().optional(),
    state: Joi.string().optional(),
    country: Joi.string().optional(),
    zipcode: Joi.string().optional()
  }).optional(),
  contact: Joi.object({
    phone: Joi.string().optional(),
    email: Joi.string().email().optional(),
    website: Joi.string().uri().optional()
  }).optional(),
  hours: Joi.object().optional(),
  rating: Joi.number().min(0).max(5).optional(),
  priceLevel: Joi.number().min(1).max(4).optional(),
  tags: Joi.array().items(Joi.string()).default([]),
  metadata: Joi.object().default({})
});

const updatePlaceSchema = Joi.object({
  name: Joi.string().min(1).max(200).optional(),
  description: Joi.string().max(2000).optional(),
  category: Joi.string().optional(),
  address: Joi.object().optional(),
  contact: Joi.object().optional(),
  hours: Joi.object().optional(),
  rating: Joi.number().min(0).max(5).optional(),
  priceLevel: Joi.number().min(1).max(4).optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  metadata: Joi.object().optional(),
  isActive: Joi.boolean().optional()
}).min(1);

const searchPlacesSchema = Joi.object({
  query: Joi.string().min(1).max(200).optional(),
  category: Joi.string().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  lat: Joi.number().min(-90).max(90).when('lng', { is: Joi.exist(), then: Joi.required() }),
  lng: Joi.number().min(-180).max(180).when('lat', { is: Joi.exist(), then: Joi.required() }),
  radiusMeters: Joi.number().min(1).max(100000).default(5000),
  minRating: Joi.number().min(0).max(5).optional(),
  priceLevel: Joi.number().min(1).max(4).optional(),
  limit: Joi.number().min(1).max(100).default(50),
  offset: Joi.number().min(0).default(0)
});

/**
 * Create a new place
 * POST /api/places
 */
router.post('/',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = createPlaceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const userId = req.user?.id;
    const { latitude, longitude, ...placeData } = value;

    // Create location with PostGIS point
    const [locationResult] = await sequelize.query(`
      INSERT INTO locations (id, location, latitude, longitude, entity_type, created_at, updated_at)
      VALUES (
        uuid_generate_v4(),
        ST_SetSRID(ST_MakePoint(:lng, :lat), 4326),
        :lat,
        :lng,
        'place',
        NOW(),
        NOW()
      )
      RETURNING id
    `, {
      replacements: { lat: latitude, lng: longitude },
      type: sequelize.QueryTypes.INSERT
    });

    const locationId = locationResult[0].id;

    // Create place
    const place = await Place.create({
      ...placeData,
      locationId,
      createdBy: userId,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    // Load location data
    await place.reload({ include: [Location] });

    res.status(201).json({
      success: true,
      data: place
    });
  })
);

/**
 * Get place by ID
 * GET /api/places/:id
 */
router.get('/:id',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const placeId = req.params.id;

    if (!placeId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid place ID format'
      });
    }

    const place = await Place.findByPk(placeId, {
      include: [Location]
    });

    if (!place) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Place not found'
      });
    }

    res.json({
      success: true,
      data: place
    });
  })
);

/**
 * Search places
 * GET /api/places/search
 */
router.get('/search/query',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = searchPlacesSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const {
      query,
      category,
      tags,
      lat,
      lng,
      radiusMeters,
      minRating,
      priceLevel,
      limit,
      offset
    } = value;

    let queryString = `
      SELECT p.*, l.latitude, l.longitude,
        ST_Distance(
          l.location::geography,
          ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
        ) as distance
      FROM places p
      JOIN locations l ON p.location_id = l.id
      WHERE p.is_active = true
    `;

    const replacements = { lat: lat || 0, lng: lng || 0 };

    // Add proximity filter if coordinates provided
    if (lat && lng) {
      queryString += `
        AND ST_DWithin(
          l.location::geography,
          ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
          :radius
        )
      `;
      replacements.radius = radiusMeters;
    }

    // Add text search
    if (query) {
      queryString += ` AND (p.name ILIKE :query OR p.description ILIKE :query)`;
      replacements.query = `%${query}%`;
    }

    // Add category filter
    if (category) {
      queryString += ` AND p.category = :category`;
      replacements.category = category;
    }

    // Add tags filter
    if (tags && tags.length > 0) {
      queryString += ` AND p.tags && :tags::text[]`;
      replacements.tags = `{${tags.join(',')}}`;
    }

    // Add rating filter
    if (minRating) {
      queryString += ` AND p.rating >= :minRating`;
      replacements.minRating = minRating;
    }

    // Add price level filter
    if (priceLevel) {
      queryString += ` AND p.price_level = :priceLevel`;
      replacements.priceLevel = priceLevel;
    }

    // Order by distance if coordinates provided
    if (lat && lng) {
      queryString += ` ORDER BY distance ASC`;
    } else {
      queryString += ` ORDER BY p.created_at DESC`;
    }

    queryString += ` LIMIT :limit OFFSET :offset`;
    replacements.limit = limit;
    replacements.offset = offset;

    const places = await sequelize.query(queryString, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      success: true,
      data: {
        places,
        count: places.length,
        pagination: {
          limit,
          offset,
          hasMore: places.length === limit
        }
      }
    });
  })
);

/**
 * Update place
 * PUT /api/places/:id
 */
router.put('/:id',
  validateCAToken,
  requirePermissions({ update: true }),
  asyncHandler(async (req, res) => {
    const placeId = req.params.id;

    if (!placeId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid place ID format'
      });
    }

    const { error, value } = updatePlaceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const place = await Place.findByPk(placeId);

    if (!place) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Place not found'
      });
    }

    await place.update({
      ...value,
      updatedAt: Date.now()
    });

    await place.reload({ include: [Location] });

    res.json({
      success: true,
      data: place
    });
  })
);

/**
 * Delete place (soft delete)
 * DELETE /api/places/:id
 */
router.delete('/:id',
  validateCAToken,
  requirePermissions({ delete: true }),
  asyncHandler(async (req, res) => {
    const placeId = req.params.id;

    if (!placeId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid place ID format'
      });
    }

    const place = await Place.findByPk(placeId);

    if (!place) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Place not found'
      });
    }

    await place.update({
      isActive: false,
      updatedAt: Date.now()
    });

    res.json({
      success: true,
      message: 'Place deleted successfully'
    });
  })
);

module.exports = router;
