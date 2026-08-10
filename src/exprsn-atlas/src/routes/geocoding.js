const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { validateCAToken, requirePermissions, asyncHandler } = require('@exprsn/shared');
const geocodingService = require('../services/geocodingService');

/**
 * ═══════════════════════════════════════════════════════════
 * Geocoding Routes
 * Forward geocoding (address → coordinates)
 * Reverse geocoding (coordinates → address)
 * ═══════════════════════════════════════════════════════════
 */

// Validation schemas
const geocodeSchema = Joi.object({
  address: Joi.string().min(1).max(500).required()
});

const reverseGeocodeSchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required()
});

const batchGeocodeSchema = Joi.object({
  addresses: Joi.array().items(Joi.string().min(1).max(500)).min(1).max(100).required()
});

const searchPlacesSchema = Joi.object({
  query: Joi.string().min(1).max(200).required(),
  bounds: Joi.object({
    swLat: Joi.number().min(-90).max(90).required(),
    swLng: Joi.number().min(-180).max(180).required(),
    neLat: Joi.number().min(-90).max(90).required(),
    neLng: Joi.number().min(-180).max(180).required()
  }).optional(),
  limit: Joi.number().min(1).max(50).default(10)
});

const geocodeComponentsSchema = Joi.object({
  street: Joi.string().optional(),
  streetNumber: Joi.string().optional(),
  city: Joi.string().optional(),
  state: Joi.string().optional(),
  zipcode: Joi.string().optional(),
  country: Joi.string().optional()
}).min(1);

/**
 * Forward geocode an address to coordinates
 * POST /api/geocode/forward
 */
router.post('/forward',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = geocodeSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { address } = value;

    const results = await geocodingService.geocode(address);

    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Address not found'
      });
    }

    res.json({
      success: true,
      data: {
        query: address,
        results,
        count: results.length
      }
    });
  })
);

/**
 * Reverse geocode coordinates to address
 * POST /api/geocode/reverse
 */
router.post('/reverse',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = reverseGeocodeSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { lat, lng } = value;

    const result = await geocodingService.reverseGeocode(lat, lng);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'No address found for coordinates'
      });
    }

    res.json({
      success: true,
      data: {
        coordinates: { lat, lng },
        ...result
      }
    });
  })
);

/**
 * Batch geocode multiple addresses
 * POST /api/geocode/batch
 */
router.post('/batch',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = batchGeocodeSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { addresses } = value;

    const results = await geocodingService.batchGeocode(addresses);

    const successCount = results.filter(r => r.success).length;

    res.json({
      success: true,
      data: {
        results,
        summary: {
          total: addresses.length,
          successful: successCount,
          failed: addresses.length - successCount
        }
      }
    });
  })
);

/**
 * Search for places by name/query
 * POST /api/geocode/search
 */
router.post('/search',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = searchPlacesSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { query, bounds, limit } = value;

    const results = await geocodingService.searchPlaces(query, bounds, limit);

    res.json({
      success: true,
      data: {
        query,
        results,
        count: results.length
      }
    });
  })
);

/**
 * Geocode from structured address components
 * POST /api/geocode/components
 */
router.post('/components',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = geocodeComponentsSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const results = await geocodingService.geocodeComponents(value);

    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Address not found'
      });
    }

    res.json({
      success: true,
      data: {
        components: value,
        results,
        count: results.length
      }
    });
  })
);

/**
 * Validate and normalize an address
 * POST /api/geocode/validate
 */
router.post('/validate',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = geocodeSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { address } = value;

    const result = await geocodingService.validateAddress(address);

    res.json({
      success: true,
      data: result
    });
  })
);

module.exports = router;
