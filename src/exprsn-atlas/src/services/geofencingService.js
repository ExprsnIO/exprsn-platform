const { Geofence } = require('../models');
const sequelize = require('../config/database');
const logger = require('../utils/logger');
const redis = require('../config/redis');
const { Op } = require('sequelize');

/**
 * ═══════════════════════════════════════════════════════════
 * Geofencing Service - Geographic Boundary Management
 * Create, manage, and monitor geographic boundaries
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Create a circular geofence
 * @param {object} data - Geofence data
 * @returns {Promise<object>} Created geofence
 */
async function createCircularGeofence(data) {
  try {
    const { name, latitude, longitude, radiusMeters, purpose, entityType, entityId, triggers } = data;

    // Validate radius
    if (radiusMeters <= 0 || radiusMeters > 100000) {
      throw new Error('Radius must be between 1 and 100,000 meters');
    }

    // Create circular polygon using PostGIS ST_Buffer
    const [result] = await sequelize.query(`
      SELECT ST_AsGeoJSON(
        ST_Buffer(
          ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
          :radius
        )::geometry
      ) as boundary,
      ST_AsGeoJSON(
        ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)
      ) as center
    `, {
      replacements: { lat: latitude, lng: longitude, radius: radiusMeters },
      type: sequelize.QueryTypes.SELECT
    });

    const boundary = JSON.parse(result.boundary);
    const center = JSON.parse(result.center);

    // Create geofence
    const geofence = await Geofence.create({
      name,
      type: 'circular',
      boundary,
      center,
      radiusMeters,
      purpose: purpose || 'custom',
      entityType,
      entityId,
      triggers: triggers || {},
      properties: data.properties || {},
      expiresAt: data.expiresAt,
      createdBy: data.createdBy,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    logger.info(`Created circular geofence: ${geofence.id} at (${latitude}, ${longitude}) with radius ${radiusMeters}m`);

    return geofence;
  } catch (error) {
    logger.error('Error creating circular geofence:', error);
    throw error;
  }
}

/**
 * Create a polygon geofence from coordinates
 * @param {object} data - Geofence data with coordinates
 * @returns {Promise<object>} Created geofence
 */
async function createPolygonGeofence(data) {
  try {
    const { name, coordinates, purpose, entityType, entityId, triggers } = data;

    // Validate coordinates (must be array of [lng, lat] pairs)
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 4) {
      throw new Error('Polygon must have at least 4 coordinates (including closing point)');
    }

    // Ensure polygon is closed (first and last points must be the same)
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];

    if (first[0] !== last[0] || first[1] !== last[1]) {
      coordinates.push(first); // Close the polygon
    }

    // Create GeoJSON polygon
    const boundary = {
      type: 'Polygon',
      coordinates: [coordinates]
    };

    // Calculate center using PostGIS
    const coordsStr = coordinates.map(c => `${c[0]} ${c[1]}`).join(',');
    const [result] = await sequelize.query(`
      SELECT
        ST_AsGeoJSON(ST_Centroid(
          ST_SetSRID(ST_GeomFromText('POLYGON((${coordsStr}))'), 4326)
        )) as center,
        ST_Area(
          ST_SetSRID(ST_GeomFromText('POLYGON((${coordsStr}))'), 4326)::geography
        ) as area_sqm
    `);

    const center = JSON.parse(result[0].center);
    const areaSqM = parseFloat(result[0].area_sqm);

    // Create geofence
    const geofence = await Geofence.create({
      name,
      type: 'polygon',
      boundary,
      center,
      purpose: purpose || 'custom',
      entityType,
      entityId,
      triggers: triggers || {},
      properties: {
        ...data.properties,
        areaSqM,
        areaSqKm: parseFloat((areaSqM / 1000000).toFixed(2))
      },
      expiresAt: data.expiresAt,
      createdBy: data.createdBy,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    logger.info(`Created polygon geofence: ${geofence.id} with area ${areaSqM.toFixed(0)} sqm`);

    return geofence;
  } catch (error) {
    logger.error('Error creating polygon geofence:', error);
    throw error;
  }
}

/**
 * Create a rectangular geofence from bounding box
 * @param {object} data - Geofence data with bounds
 * @returns {Promise<object>} Created geofence
 */
async function createRectangularGeofence(data) {
  try {
    const { name, swLat, swLng, neLat, neLng, purpose, entityType, entityId, triggers } = data;

    // Create rectangle coordinates (closed polygon)
    const coordinates = [
      [swLng, swLat],
      [neLng, swLat],
      [neLng, neLat],
      [swLng, neLat],
      [swLng, swLat]
    ];

    return await createPolygonGeofence({
      ...data,
      name,
      coordinates,
      type: 'rectangular'
    });
  } catch (error) {
    logger.error('Error creating rectangular geofence:', error);
    throw error;
  }
}

/**
 * Check if a point is within geofences
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {object} filters - Filters (purpose, entityType, entityId)
 * @returns {Promise<Array>} Geofences containing the point
 */
async function checkPoint(lat, lng, filters = {}) {
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

    // Check for non-expired geofences
    whereConditions.push('(expires_at IS NULL OR expires_at > :now)');
    replacements.now = Date.now();

    const whereClause = whereConditions.join(' AND ');

    const query = `
      SELECT
        id,
        name,
        type,
        purpose,
        entity_type,
        entity_id,
        triggers,
        properties,
        radius_meters,
        ST_Distance(
          center::geography,
          ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
        ) as distance_to_center
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

    return geofences.map(g => ({
      ...g,
      distanceToCenter: g.distance_to_center ? parseFloat(g.distance_to_center) : null
    }));
  } catch (error) {
    logger.error('Error checking geofences:', error);
    throw error;
  }
}

/**
 * Get geofence by ID
 * @param {string} geofenceId - Geofence ID
 * @returns {Promise<object>} Geofence
 */
async function getGeofence(geofenceId) {
  try {
    const geofence = await Geofence.findByPk(geofenceId);

    if (!geofence) {
      throw new Error('GEOFENCE_NOT_FOUND');
    }

    // Calculate current area if needed
    if (geofence.type !== 'circular' && !geofence.properties.areaSqM) {
      const area = await geofence.getAreaSquareMeters();
      geofence.properties.areaSqM = area;
      geofence.properties.areaSqKm = parseFloat((area / 1000000).toFixed(2));
      await geofence.save();
    }

    return geofence;
  } catch (error) {
    logger.error('Error getting geofence:', error);
    throw error;
  }
}

/**
 * List geofences with filters
 * @param {object} filters - Filters
 * @returns {Promise<object>} Geofences with pagination
 */
async function listGeofences(filters = {}) {
  try {
    const {
      purpose,
      entityType,
      entityId,
      type,
      isActive = true,
      includeExpired = false,
      limit = 50,
      offset = 0
    } = filters;

    const where = {};

    if (purpose) {
      where.purpose = purpose;
    }

    if (entityType) {
      where.entityType = entityType;
    }

    if (entityId) {
      where.entityId = entityId;
    }

    if (type) {
      where.type = type;
    }

    where.isActive = isActive;

    if (!includeExpired) {
      where[Op.or] = [
        { expiresAt: null },
        { expiresAt: { [Op.gt]: Date.now() } }
      ];
    }

    const { count, rows: geofences } = await Geofence.findAndCountAll({
      where,
      limit: Math.min(limit, 100),
      offset,
      order: [['createdAt', 'DESC']]
    });

    return {
      geofences,
      pagination: {
        total: count,
        limit,
        offset
      }
    };
  } catch (error) {
    logger.error('Error listing geofences:', error);
    throw error;
  }
}

/**
 * Update geofence
 * @param {string} geofenceId - Geofence ID
 * @param {object} updates - Updates
 * @returns {Promise<object>} Updated geofence
 */
async function updateGeofence(geofenceId, updates) {
  try {
    const geofence = await Geofence.findByPk(geofenceId);

    if (!geofence) {
      throw new Error('GEOFENCE_NOT_FOUND');
    }

    const allowedFields = ['name', 'triggers', 'properties', 'expiresAt', 'isActive'];
    const updateData = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    }

    updateData.updatedAt = Date.now();

    await geofence.update(updateData);

    logger.info(`Updated geofence: ${geofenceId}`);

    return geofence;
  } catch (error) {
    logger.error('Error updating geofence:', error);
    throw error;
  }
}

/**
 * Delete geofence (soft delete)
 * @param {string} geofenceId - Geofence ID
 * @returns {Promise<void>}
 */
async function deleteGeofence(geofenceId) {
  try {
    const geofence = await Geofence.findByPk(geofenceId);

    if (!geofence) {
      throw new Error('GEOFENCE_NOT_FOUND');
    }

    await geofence.update({
      isActive: false,
      updatedAt: Date.now()
    });

    logger.info(`Deleted geofence: ${geofenceId}`);
  } catch (error) {
    logger.error('Error deleting geofence:', error);
    throw error;
  }
}

/**
 * Monitor geofence transitions (entry/exit)
 * @param {string} userId - User ID
 * @param {number} lat - Current latitude
 * @param {number} lng - Current longitude
 * @param {number} previousLat - Previous latitude
 * @param {number} previousLng - Previous longitude
 * @returns {Promise<object>} Transition events
 */
async function monitorTransitions(userId, lat, lng, previousLat, previousLng) {
  try {
    // Get current geofences
    const currentGeofences = await checkPoint(lat, lng);
    const currentIds = new Set(currentGeofences.map(g => g.id));

    // Get previous geofences
    const previousGeofences = await checkPoint(previousLat, previousLng);
    const previousIds = new Set(previousGeofences.map(g => g.id));

    // Detect entries
    const entries = currentGeofences.filter(g => !previousIds.has(g.id));

    // Detect exits
    const exits = previousGeofences.filter(g => !currentIds.has(g.id));

    const events = [];

    // Process entry events
    for (const geofence of entries) {
      if (geofence.triggers.onEntry?.enabled) {
        events.push({
          type: 'entry',
          geofenceId: geofence.id,
          geofenceName: geofence.name,
          userId,
          location: { lat, lng },
          timestamp: Date.now(),
          trigger: geofence.triggers.onEntry
        });
      }
    }

    // Process exit events
    for (const geofence of exits) {
      if (geofence.triggers.onExit?.enabled) {
        events.push({
          type: 'exit',
          geofenceId: geofence.id,
          geofenceName: geofence.name,
          userId,
          location: { lat, lng },
          timestamp: Date.now(),
          trigger: geofence.triggers.onExit
        });
      }
    }

    if (events.length > 0) {
      logger.info(`Detected ${events.length} geofence transition(s) for user ${userId}`);
    }

    return {
      entries: entries.map(g => ({ id: g.id, name: g.name })),
      exits: exits.map(g => ({ id: g.id, name: g.name })),
      current: currentGeofences.map(g => ({ id: g.id, name: g.name })),
      events
    };
  } catch (error) {
    logger.error('Error monitoring geofence transitions:', error);
    throw error;
  }
}

module.exports = {
  createCircularGeofence,
  createPolygonGeofence,
  createRectangularGeofence,
  checkPoint,
  getGeofence,
  listGeofences,
  updateGeofence,
  deleteGeofence,
  monitorTransitions
};
