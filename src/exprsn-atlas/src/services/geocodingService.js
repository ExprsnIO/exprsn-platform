const NodeGeocoder = require('node-geocoder');
const logger = require('../utils/logger');
const redis = require('../config/redis');
const config = require('../config');

/**
 * ═══════════════════════════════════════════════════════════
 * Geocoding Service - Address ↔ Coordinates Conversion
 * Forward geocoding (address → coordinates)
 * Reverse geocoding (coordinates → address)
 * ═══════════════════════════════════════════════════════════
 */

// Initialize geocoder based on configuration
let geocoder;

function initializeGeocoder() {
  const options = {
    provider: config.geocoding.provider || 'openstreetmap',
    timeout: config.geocoding.timeout || 5000,
    httpAdapter: 'https'
  };

  // Add API key if available (for Google, Mapbox, etc.)
  if (config.geocoding.apiKey) {
    options.apiKey = config.geocoding.apiKey;
  }

  // Provider-specific options
  if (config.geocoding.provider === 'openstreetmap') {
    options.osmServer = 'https://nominatim.openstreetmap.org';
    options.email = process.env.OSM_EMAIL || 'noreply@exprsn.com';
  }

  geocoder = NodeGeocoder(options);
  logger.info(`Geocoder initialized with provider: ${config.geocoding.provider}`);
}

// Initialize on module load
initializeGeocoder();

/**
 * Geocode an address to coordinates (forward geocoding)
 * @param {string} address - Address string
 * @param {object} options - Additional options
 * @returns {Promise<Array>} Array of geocoding results
 */
async function geocode(address, options = {}) {
  try {
    if (!address || address.trim().length === 0) {
      throw new Error('Address is required');
    }

    // Check cache first
    const cacheKey = `geocode:${address.toLowerCase().trim()}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      logger.debug(`Returning cached geocoding result for: ${address}`);
      return JSON.parse(cached);
    }

    // Geocode the address
    logger.info(`Geocoding address: ${address}`);
    const rawResults = await geocoder.geocode(address);

    if (!rawResults || rawResults.length === 0) {
      return [];
    }

    // Format results
    const results = rawResults.map(result => ({
      latitude: result.latitude,
      longitude: result.longitude,
      formattedAddress: result.formattedAddress,
      address: {
        street: result.streetName,
        streetNumber: result.streetNumber,
        city: result.city,
        state: result.state || result.administrativeLevels?.level1long,
        stateCode: result.stateCode || result.administrativeLevels?.level1short,
        country: result.country,
        countryCode: result.countryCode,
        zipcode: result.zipcode
      },
      extra: {
        confidence: result.extra?.confidence,
        placeId: result.extra?.googlePlaceId || result.extra?.osmId,
        bbox: result.extra?.bbox
      },
      provider: config.geocoding.provider
    }));

    // Cache for 24 hours (addresses don't change)
    await redis.setex(cacheKey, 86400, JSON.stringify(results));

    logger.info(`Geocoded "${address}" to ${results.length} result(s)`);

    return results;
  } catch (error) {
    logger.error('Error geocoding address:', error);
    throw error;
  }
}

/**
 * Reverse geocode coordinates to address
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {object} options - Additional options
 * @returns {Promise<object>} Address information
 */
async function reverseGeocode(lat, lng, options = {}) {
  try {
    // Validate coordinates
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new Error('Invalid coordinates');
    }

    // Check cache first
    const cacheKey = `reverse:${lat.toFixed(6)}:${lng.toFixed(6)}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      logger.debug(`Returning cached reverse geocoding result for (${lat}, ${lng})`);
      return JSON.parse(cached);
    }

    // Reverse geocode
    logger.info(`Reverse geocoding coordinates: (${lat}, ${lng})`);
    const rawResults = await geocoder.reverse({ lat, lon: lng });

    if (!rawResults || rawResults.length === 0) {
      return null;
    }

    const result = rawResults[0];

    const formatted = {
      latitude: lat,
      longitude: lng,
      formattedAddress: result.formattedAddress,
      address: {
        street: result.streetName,
        streetNumber: result.streetNumber,
        city: result.city,
        county: result.county,
        state: result.state || result.administrativeLevels?.level1long,
        stateCode: result.stateCode || result.administrativeLevels?.level1short,
        country: result.country,
        countryCode: result.countryCode,
        zipcode: result.zipcode,
        neighborhood: result.neighborhood
      },
      extra: {
        confidence: result.extra?.confidence,
        placeId: result.extra?.googlePlaceId || result.extra?.osmId,
        type: result.extra?.type
      },
      provider: config.geocoding.provider
    };

    // Cache for 24 hours
    await redis.setex(cacheKey, 86400, JSON.stringify(formatted));

    logger.info(`Reverse geocoded (${lat}, ${lng}) to: ${formatted.formattedAddress}`);

    return formatted;
  } catch (error) {
    logger.error('Error reverse geocoding:', error);
    throw error;
  }
}

/**
 * Batch geocode multiple addresses
 * @param {Array} addresses - Array of address strings
 * @returns {Promise<Array>} Array of geocoding results
 */
async function batchGeocode(addresses) {
  try {
    if (!addresses || addresses.length === 0) {
      return [];
    }

    if (addresses.length > 100) {
      throw new Error('Maximum 100 addresses per batch');
    }

    logger.info(`Batch geocoding ${addresses.length} addresses`);

    // Geocode all addresses in parallel
    const results = await Promise.all(
      addresses.map(async (address, index) => {
        try {
          const geocoded = await geocode(address);
          return {
            index,
            address,
            success: geocoded.length > 0,
            results: geocoded
          };
        } catch (error) {
          return {
            index,
            address,
            success: false,
            error: error.message
          };
        }
      })
    );

    const successCount = results.filter(r => r.success).length;
    logger.info(`Batch geocoding complete: ${successCount}/${addresses.length} successful`);

    return results;
  } catch (error) {
    logger.error('Error in batch geocoding:', error);
    throw error;
  }
}

/**
 * Search for places by name/query
 * @param {string} query - Search query
 * @param {object} bounds - Optional bounding box {swLat, swLng, neLat, neLng}
 * @param {number} limit - Maximum results
 * @returns {Promise<Array>} Search results
 */
async function searchPlaces(query, bounds = null, limit = 10) {
  try {
    if (!query || query.trim().length === 0) {
      throw new Error('Search query is required');
    }

    logger.info(`Searching for places: "${query}"`);

    // Build geocoder options
    const options = {};

    if (bounds) {
      // Add bounding box if provided (format depends on provider)
      if (config.geocoding.provider === 'openstreetmap') {
        options.viewbox = `${bounds.swLng},${bounds.swLat},${bounds.neLng},${bounds.neLat}`;
        options.bounded = 1;
      }
    }

    const rawResults = await geocoder.geocode(query);

    if (!rawResults || rawResults.length === 0) {
      return [];
    }

    // Format and limit results
    const results = rawResults.slice(0, limit).map(result => ({
      name: result.formattedAddress.split(',')[0],
      formattedAddress: result.formattedAddress,
      latitude: result.latitude,
      longitude: result.longitude,
      type: result.extra?.type || 'place',
      address: {
        street: result.streetName,
        city: result.city,
        state: result.state,
        country: result.country,
        countryCode: result.countryCode
      },
      provider: config.geocoding.provider
    }));

    logger.info(`Found ${results.length} place(s) for "${query}"`);

    return results;
  } catch (error) {
    logger.error('Error searching places:', error);
    throw error;
  }
}

/**
 * Geocode structured address components
 * @param {object} components - Address components
 * @returns {Promise<Array>} Geocoding results
 */
async function geocodeComponents(components) {
  try {
    const {
      street,
      streetNumber,
      city,
      state,
      zipcode,
      country
    } = components;

    // Build address string from components
    const parts = [];

    if (streetNumber && street) {
      parts.push(`${streetNumber} ${street}`);
    } else if (street) {
      parts.push(street);
    }

    if (city) parts.push(city);
    if (state) parts.push(state);
    if (zipcode) parts.push(zipcode);
    if (country) parts.push(country);

    const address = parts.join(', ');

    logger.info(`Geocoding structured address: ${address}`);

    return await geocode(address);
  } catch (error) {
    logger.error('Error geocoding components:', error);
    throw error;
  }
}

/**
 * Validate and normalize an address
 * @param {string} address - Address to validate
 * @returns {Promise<object>} Validated and normalized address
 */
async function validateAddress(address) {
  try {
    const results = await geocode(address);

    if (results.length === 0) {
      return {
        valid: false,
        originalAddress: address,
        message: 'Address not found'
      };
    }

    const bestMatch = results[0];

    return {
      valid: true,
      originalAddress: address,
      normalizedAddress: bestMatch.formattedAddress,
      coordinates: {
        latitude: bestMatch.latitude,
        longitude: bestMatch.longitude
      },
      address: bestMatch.address,
      confidence: bestMatch.extra.confidence || 'medium'
    };
  } catch (error) {
    logger.error('Error validating address:', error);
    return {
      valid: false,
      originalAddress: address,
      message: error.message
    };
  }
}

module.exports = {
  geocode,
  reverseGeocode,
  batchGeocode,
  searchPlaces,
  geocodeComponents,
  validateAddress
};
