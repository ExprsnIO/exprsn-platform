const { Location, Place, Route, Geofence } = require('../models');
const sequelize = require('../config/database');
const logger = require('../utils/logger');
const redis = require('../config/redis');
const { Op } = require('sequelize');

/**
 * ═══════════════════════════════════════════════════════════
 * Spatial Service - Advanced PostGIS Spatial Queries
 * Core spatial operations and geospatial computations
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Find locations within radius of a point
 * @param {number} lat - Center latitude
 * @param {number} lng - Center longitude
 * @param {number} radiusMeters - Search radius in meters
 * @param {object} filters - Additional filters
 * @returns {Promise<Array>} Locations within radius
 */
async function findLocationsNearby(lat, lng, radiusMeters, filters = {}) {
  try {
    const { type, visibility, limit = 50, offset = 0 } = filters;

    // Build WHERE clause
    const whereConditions = ['is_active = true'];
    const replacements = { lat, lng, radius: radiusMeters, limit, offset };

    if (type) {
      whereConditions.push('type = :type');
      replacements.type = type;
    }

    if (visibility) {
      whereConditions.push('visibility = :visibility');
      replacements.visibility = visibility;
    } else {
      whereConditions.push("visibility IN ('public', 'unlisted')");
    }

    const whereClause = whereConditions.join(' AND ');

    // PostGIS spatial query with distance calculation
    const query = `
      SELECT
        id,
        name,
        description,
        latitude,
        longitude,
        altitude,
        type,
        entity_id,
        address,
        properties,
        visibility,
        ST_Distance(
          location::geography,
          ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
        ) as distance
      FROM locations
      WHERE ${whereClause}
        AND ST_DWithin(
          location::geography,
          ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
          :radius
        )
      ORDER BY distance ASC
      LIMIT :limit
      OFFSET :offset
    `;

    const locations = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    logger.info(`Found ${locations.length} locations within ${radiusMeters}m of (${lat}, ${lng})`);

    return locations.map(loc => ({
      ...loc,
      distance: parseFloat(loc.distance),
      distanceKm: parseFloat((loc.distance / 1000).toFixed(2))
    }));
  } catch (error) {
    logger.error('Error finding nearby locations:', error);
    throw error;
  }
}

/**
 * Find places within radius with category filtering
 * @param {number} lat - Center latitude
 * @param {number} lng - Center longitude
 * @param {number} radiusMeters - Search radius
 * @param {object} filters - Filters (category, tags, etc.)
 * @returns {Promise<Array>} Places within radius
 */
async function findPlacesNearby(lat, lng, radiusMeters, filters = {}) {
  try {
    const { category, tags, minRating, limit = 50, offset = 0 } = filters;

    const whereConditions = ['is_active = true', "visibility = 'public'"];
    const replacements = { lat, lng, radius: radiusMeters, limit, offset };

    if (category) {
      whereConditions.push('category = :category');
      replacements.category = category;
    }

    if (tags && tags.length > 0) {
      whereConditions.push('tags && :tags');
      replacements.tags = tags;
    }

    if (minRating) {
      whereConditions.push('rating >= :minRating');
      replacements.minRating = minRating;
    }

    const whereClause = whereConditions.join(' AND ');

    const query = `
      SELECT
        id,
        name,
        slug,
        description,
        latitude,
        longitude,
        category,
        tags,
        address,
        contact,
        rating,
        rating_count,
        verified,
        ST_Distance(
          location::geography,
          ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
        ) as distance
      FROM places
      WHERE ${whereClause}
        AND ST_DWithin(
          location::geography,
          ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
          :radius
        )
      ORDER BY distance ASC
      LIMIT :limit
      OFFSET :offset
    `;

    const places = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    return places.map(place => ({
      ...place,
      distance: parseFloat(place.distance),
      distanceKm: parseFloat((place.distance / 1000).toFixed(2))
    }));
  } catch (error) {
    logger.error('Error finding nearby places:', error);
    throw error;
  }
}

/**
 * Find locations within a bounding box
 * @param {number} swLat - Southwest latitude
 * @param {number} swLng - Southwest longitude
 * @param {number} neLat - Northeast latitude
 * @param {number} neLng - Northeast longitude
 * @param {object} filters - Additional filters
 * @returns {Promise<Array>} Locations within bounds
 */
async function findLocationsInBounds(swLat, swLng, neLat, neLng, filters = {}) {
  try {
    const { type, limit = 200 } = filters;

    const whereConditions = ['is_active = true'];
    const replacements = { swLat, swLng, neLat, neLng, limit };

    if (type) {
      whereConditions.push('type = :type');
      replacements.type = type;
    }

    const whereClause = whereConditions.join(' AND ');

    const query = `
      SELECT
        id, name, latitude, longitude, type, entity_id, properties
      FROM locations
      WHERE ${whereClause}
        AND location && ST_MakeEnvelope(:swLng, :swLat, :neLng, :neLat, 4326)
      LIMIT :limit
    `;

    const locations = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    return locations;
  } catch (error) {
    logger.error('Error finding locations in bounds:', error);
    throw error;
  }
}

/**
 * Check if a point is within any active geofences
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {object} filters - Filters (purpose, entityId, etc.)
 * @returns {Promise<Array>} Geofences containing the point
 */
async function checkGeofences(lat, lng, filters = {}) {
  try {
    const { purpose, entityType, entityId } = filters;

    const whereConditions = ['is_active = true'];
    const replacements = { lat, lng };

    if (purpose) {
      whereConditions.push('purpose = :purpose');
      replacements.purpose = purpose;
    }

    if (entityType) {
      whereConditions.push('entity_type = :entityType');
      replacements.entityType = entityType;
    }

    if (entityId) {
      whereConditions.push('entity_id = :entityId');
      replacements.entityId = entityId;
    }

    // Check for expiration
    whereConditions.push('(expires_at IS NULL OR expires_at > :now)');
    replacements.now = Date.now();

    const whereClause = whereConditions.join(' AND ');

    const query = `
      SELECT
        id, name, type, purpose, entity_type, entity_id, triggers, properties
      FROM geofences
      WHERE ${whereClause}
        AND ST_Contains(
          boundary,
          ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)
        )
    `;

    const geofences = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    logger.info(`Point (${lat}, ${lng}) is within ${geofences.length} geofence(s)`);

    return geofences;
  } catch (error) {
    logger.error('Error checking geofences:', error);
    throw error;
  }
}

/**
 * Calculate distance between two points
 * @param {number} lat1 - First point latitude
 * @param {number} lng1 - First point longitude
 * @param {number} lat2 - Second point latitude
 * @param {number} lng2 - Second point longitude
 * @returns {Promise<object>} Distance info
 */
async function calculateDistance(lat1, lng1, lat2, lng2) {
  try {
    const query = `
      SELECT
        ST_Distance(
          ST_SetSRID(ST_MakePoint(:lng1, :lat1), 4326)::geography,
          ST_SetSRID(ST_MakePoint(:lng2, :lat2), 4326)::geography
        ) as distance_meters,
        ST_Azimuth(
          ST_SetSRID(ST_MakePoint(:lng1, :lat1), 4326),
          ST_SetSRID(ST_MakePoint(:lng2, :lat2), 4326)
        ) * 180 / pi() as bearing_degrees
    `;

    const [result] = await sequelize.query(query, {
      replacements: { lat1, lng1, lat2, lng2 },
      type: sequelize.QueryTypes.SELECT
    });

    return {
      distanceMeters: parseFloat(result.distance_meters),
      distanceKm: parseFloat((result.distance_meters / 1000).toFixed(2)),
      distanceMiles: parseFloat((result.distance_meters / 1609.34).toFixed(2)),
      bearingDegrees: result.bearing_degrees ? parseFloat(result.bearing_degrees.toFixed(2)) : null
    };
  } catch (error) {
    logger.error('Error calculating distance:', error);
    throw error;
  }
}

/**
 * Find nearest N locations to a point
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} limit - Number of results
 * @param {object} filters - Additional filters
 * @returns {Promise<Array>} Nearest locations
 */
async function findNearestLocations(lat, lng, limit = 10, filters = {}) {
  try {
    const { type } = filters;
    const whereConditions = ['is_active = true'];
    const replacements = { lat, lng, limit: Math.min(limit, 100) };

    if (type) {
      whereConditions.push('type = :type');
      replacements.type = type;
    }

    const whereClause = whereConditions.join(' AND ');

    const query = `
      SELECT
        id, name, latitude, longitude, type, entity_id,
        ST_Distance(
          location::geography,
          ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
        ) as distance
      FROM locations
      WHERE ${whereClause}
      ORDER BY location <-> ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)
      LIMIT :limit
    `;

    const locations = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    return locations.map(loc => ({
      ...loc,
      distance: parseFloat(loc.distance),
      distanceKm: parseFloat((loc.distance / 1000).toFixed(2))
    }));
  } catch (error) {
    logger.error('Error finding nearest locations:', error);
    throw error;
  }
}

/**
 * Calculate centroid of multiple points
 * @param {Array} points - Array of {lat, lng} objects
 * @returns {Promise<object>} Centroid coordinates
 */
async function calculateCentroid(points) {
  try {
    if (!points || points.length === 0) {
      throw new Error('At least one point required');
    }

    // Build MULTIPOINT geometry from array of points
    const pointsStr = points.map(p => `${p.lng} ${p.lat}`).join(',');

    const query = `
      SELECT
        ST_Y(centroid) as latitude,
        ST_X(centroid) as longitude
      FROM (
        SELECT ST_Centroid(
          ST_SetSRID(ST_GeomFromText('MULTIPOINT(${pointsStr})'), 4326)
        ) as centroid
      ) as subquery
    `;

    const [result] = await sequelize.query(query, {
      type: sequelize.QueryTypes.SELECT
    });

    return {
      latitude: parseFloat(result.latitude),
      longitude: parseFloat(result.longitude)
    };
  } catch (error) {
    logger.error('Error calculating centroid:', error);
    throw error;
  }
}

/**
 * Generate heatmap data for locations
 * @param {number} swLat - Southwest latitude (bounds)
 * @param {number} swLng - Southwest longitude
 * @param {number} neLat - Northeast latitude
 * @param {number} neLng - Northeast longitude
 * @param {object} options - Options (gridSize, type, etc.)
 * @returns {Promise<Array>} Heatmap grid data
 */
async function generateHeatmap(swLat, swLng, neLat, neLng, options = {}) {
  try {
    const { gridSize = 0.01, type } = options; // gridSize in degrees (~1.1km at equator)

    const whereConditions = ['is_active = true'];
    const replacements = { swLat, swLng, neLat, neLng, gridSize };

    if (type) {
      whereConditions.push('type = :type');
      replacements.type = type;
    }

    const whereClause = whereConditions.join(' AND ');

    const query = `
      SELECT
        FLOOR(latitude / :gridSize) * :gridSize as grid_lat,
        FLOOR(longitude / :gridSize) * :gridSize as grid_lng,
        COUNT(*) as count,
        AVG(latitude) as center_lat,
        AVG(longitude) as center_lng
      FROM locations
      WHERE ${whereClause}
        AND location && ST_MakeEnvelope(:swLng, :swLat, :neLng, :neLat, 4326)
      GROUP BY grid_lat, grid_lng
      HAVING COUNT(*) > 0
      ORDER BY count DESC
    `;

    const heatmapData = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    return heatmapData.map(cell => ({
      latitude: parseFloat(cell.center_lat),
      longitude: parseFloat(cell.center_lng),
      count: parseInt(cell.count),
      intensity: parseInt(cell.count) // Can be normalized based on max
    }));
  } catch (error) {
    logger.error('Error generating heatmap:', error);
    throw error;
  }
}

module.exports = {
  findLocationsNearby,
  findPlacesNearby,
  findLocationsInBounds,
  checkGeofences,
  calculateDistance,
  findNearestLocations,
  calculateCentroid,
  generateHeatmap
};
