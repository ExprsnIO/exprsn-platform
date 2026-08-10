const axios = require('axios');
const polyline = require('@mapbox/polyline');
const logger = require('../utils/logger');
const redis = require('../config/redis');
const config = require('../config');
const { Route } = require('../models');

/**
 * ═══════════════════════════════════════════════════════════
 * Routing Service - Directions and Route Planning
 * Provides turn-by-turn directions using OSRM
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Get directions between two points
 * @param {object} origin - {lat, lng}
 * @param {object} destination - {lat, lng}
 * @param {object} options - Routing options
 * @returns {Promise<object>} Routes with directions
 */
async function getDirections(origin, destination, options = {}) {
  try {
    const {
      mode = 'driving',
      alternatives = false,
      steps = true,
      waypoints = []
    } = options;

    // Build coordinates array [lng, lat]
    const coordinates = [
      [origin.lng, origin.lat],
      ...waypoints.map(w => [w.lng, w.lat]),
      [destination.lng, destination.lat]
    ];

    // Validate waypoint count
    if (coordinates.length > config.routing.maxWaypoints) {
      throw new Error(`Maximum ${config.routing.maxWaypoints} waypoints allowed`);
    }

    // Check cache
    const cacheKey = `route:${mode}:${coordinates.map(c => c.join(',')).join(':')}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      logger.debug('Returning cached route');
      return JSON.parse(cached);
    }

    // Call OSRM API
    const profile = getOSRMProfile(mode);
    const coordsStr = coordinates.map(c => c.join(',')).join(';');
    const url = `${config.routing.osrmUrl}/route/v1/${profile}/${coordsStr}`;

    const params = {
      alternatives: alternatives ? 'true' : 'false',
      steps: steps ? 'true' : 'false',
      geometries: 'geojson',
      overview: 'full',
      annotations: 'true'
    };

    const response = await axios.get(url, {
      params,
      timeout: 10000
    });

    if (response.data.code !== 'Ok') {
      throw new Error(`OSRM error: ${response.data.code}`);
    }

    // Format routes
    const routes = response.data.routes.map((route, index) => {
      return {
        index,
        distanceMeters: route.distance,
        distanceKm: parseFloat((route.distance / 1000).toFixed(2)),
        distanceMiles: parseFloat((route.distance / 1609.34).toFixed(2)),
        durationSeconds: route.duration,
        durationMinutes: parseFloat((route.duration / 60).toFixed(1)),
        durationFormatted: formatDuration(route.duration),
        geometry: route.geometry,
        polyline: polyline.encode(route.geometry.coordinates.map(c => [c[1], c[0]])),
        legs: route.legs.map(leg => ({
          distanceMeters: leg.distance,
          durationSeconds: leg.duration,
          steps: formatSteps(leg.steps)
        })),
        summary: route.legs.map(l => l.summary).join(', ')
      };
    });

    const result = {
      origin,
      destination,
      waypoints,
      mode,
      routes,
      timestamp: Date.now()
    };

    // Cache for 1 hour
    await redis.setex(cacheKey, 3600, JSON.stringify(result));

    logger.info(`Generated ${routes.length} route(s) from (${origin.lat}, ${origin.lng}) to (${destination.lat}, ${destination.lng})`);

    return result;
  } catch (error) {
    logger.error('Error getting directions:', error);
    throw error;
  }
}

/**
 * Calculate distance/time matrix between multiple points
 * @param {Array} sources - Array of {lat, lng} points
 * @param {Array} destinations - Array of {lat, lng} points (optional, defaults to sources)
 * @param {string} mode - Travel mode
 * @returns {Promise<object>} Distance/duration matrix
 */
async function getDistanceMatrix(sources, destinations = null, mode = 'driving') {
  try {
    if (!destinations) {
      destinations = sources;
    }

    if (sources.length > 100 || destinations.length > 100) {
      throw new Error('Maximum 100 sources and 100 destinations');
    }

    const profile = getOSRMProfile(mode);

    // Build coordinates (sources + destinations)
    const allCoords = [...sources, ...destinations];
    const coordsStr = allCoords.map(c => `${c.lng},${c.lat}`).join(';');

    // Build source/destination indices
    const sourceIndices = sources.map((_, i) => i).join(';');
    const destIndices = destinations.map((_, i) => i + sources.length).join(';');

    const url = `${config.routing.osrmUrl}/table/v1/${profile}/${coordsStr}`;

    const params = {
      sources: sourceIndices,
      destinations: destIndices
    };

    const response = await axios.get(url, {
      params,
      timeout: 15000
    });

    if (response.data.code !== 'Ok') {
      throw new Error(`OSRM error: ${response.data.code}`);
    }

    const matrix = {
      sources: sources.map((s, i) => ({ index: i, ...s })),
      destinations: destinations.map((d, i) => ({ index: i, ...d })),
      distances: response.data.distances.map(row =>
        row.map(d => d !== null ? parseFloat(d.toFixed(2)) : null)
      ),
      durations: response.data.durations.map(row =>
        row.map(d => d !== null ? parseFloat(d.toFixed(2)) : null)
      ),
      mode
    };

    logger.info(`Generated distance matrix: ${sources.length} sources × ${destinations.length} destinations`);

    return matrix;
  } catch (error) {
    logger.error('Error getting distance matrix:', error);
    throw error;
  }
}

/**
 * Optimize route with multiple waypoints (TSP solver)
 * @param {Array} waypoints - Array of {lat, lng, name?} points
 * @param {string} mode - Travel mode
 * @returns {Promise<object>} Optimized route
 */
async function optimizeRoute(waypoints, mode = 'driving') {
  try {
    if (waypoints.length < 2) {
      throw new Error('At least 2 waypoints required');
    }

    if (waypoints.length > 12) {
      throw new Error('Maximum 12 waypoints for optimization');
    }

    const profile = getOSRMProfile(mode);
    const coordsStr = waypoints.map(w => `${w.lng},${w.lat}`).join(';');

    const url = `${config.routing.osrmUrl}/trip/v1/${profile}/${coordsStr}`;

    const params = {
      roundtrip: true,
      source: 'first',
      destination: 'last',
      geometries: 'geojson',
      steps: 'true'
    };

    const response = await axios.get(url, {
      params,
      timeout: 15000
    });

    if (response.data.code !== 'Ok') {
      throw new Error(`OSRM error: ${response.data.code}`);
    }

    const trip = response.data.trips[0];

    const result = {
      waypoints: trip.waypoint_index || waypoints.map((_, i) => i),
      distanceMeters: trip.distance,
      distanceKm: parseFloat((trip.distance / 1000).toFixed(2)),
      durationSeconds: trip.duration,
      durationFormatted: formatDuration(trip.duration),
      geometry: trip.geometry,
      legs: trip.legs.map(leg => ({
        distanceMeters: leg.distance,
        durationSeconds: leg.duration
      }))
    };

    logger.info(`Optimized route with ${waypoints.length} waypoints`);

    return result;
  } catch (error) {
    logger.error('Error optimizing route:', error);
    throw error;
  }
}

/**
 * Match GPS trace to road network (map matching)
 * @param {Array} coordinates - Array of {lat, lng, timestamp?} points
 * @param {string} mode - Travel mode
 * @returns {Promise<object>} Matched route
 */
async function matchRoute(coordinates, mode = 'driving') {
  try {
    if (coordinates.length < 2) {
      throw new Error('At least 2 coordinates required');
    }

    const profile = getOSRMProfile(mode);
    const coordsStr = coordinates.map(c => `${c.lng},${c.lat}`).join(';');

    const url = `${config.routing.osrmUrl}/match/v1/${profile}/${coordsStr}`;

    const params = {
      geometries: 'geojson',
      steps: 'true',
      overview: 'full'
    };

    // Add timestamps if available
    if (coordinates[0].timestamp) {
      params.timestamps = coordinates.map(c => c.timestamp).join(';');
    }

    const response = await axios.get(url, {
      params,
      timeout: 10000
    });

    if (response.data.code !== 'Ok') {
      throw new Error(`OSRM error: ${response.data.code}`);
    }

    const matching = response.data.matchings[0];

    const result = {
      confidence: matching.confidence,
      distanceMeters: matching.distance,
      distanceKm: parseFloat((matching.distance / 1000).toFixed(2)),
      durationSeconds: matching.duration,
      geometry: matching.geometry,
      legs: matching.legs.map(leg => ({
        distanceMeters: leg.distance,
        durationSeconds: leg.duration
      }))
    };

    logger.info(`Matched ${coordinates.length} GPS points with confidence ${matching.confidence}`);

    return result;
  } catch (error) {
    logger.error('Error matching route:', error);
    throw error;
  }
}

/**
 * Save route to database
 * @param {object} routeData - Route data
 * @param {string} userId - User ID
 * @returns {Promise<object>} Saved route
 */
async function saveRoute(routeData, userId) {
  try {
    const {
      name,
      type,
      geometry,
      waypoints,
      distanceMeters,
      durationSeconds,
      elevationGainMeters,
      elevationLossMeters,
      difficulty,
      tags,
      properties
    } = routeData;

    const route = await Route.create({
      name,
      type: type || 'custom',
      path: geometry,
      waypoints: waypoints || [],
      distanceMeters,
      durationSeconds,
      elevationGainMeters,
      elevationLossMeters,
      difficulty,
      tags: tags || [],
      properties: properties || {},
      visibility: routeData.visibility || 'public',
      createdBy: userId,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    logger.info(`Saved route: ${route.id}`);

    return route;
  } catch (error) {
    logger.error('Error saving route:', error);
    throw error;
  }
}

/**
 * Get saved route by ID
 * @param {string} routeId - Route ID
 * @returns {Promise<object>} Route
 */
async function getRoute(routeId) {
  try {
    const route = await Route.findByPk(routeId);

    if (!route) {
      throw new Error('ROUTE_NOT_FOUND');
    }

    return route;
  } catch (error) {
    logger.error('Error getting route:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════

/**
 * Get OSRM profile for travel mode
 * @param {string} mode - Travel mode
 * @returns {string} OSRM profile
 */
function getOSRMProfile(mode) {
  const profiles = {
    driving: 'driving',
    car: 'driving',
    walking: 'foot',
    foot: 'foot',
    cycling: 'bike',
    bike: 'bike',
    bicycle: 'bike'
  };

  return profiles[mode.toLowerCase()] || 'driving';
}

/**
 * Format duration in seconds to human-readable string
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration
 */
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes} min`;
}

/**
 * Format routing steps for human consumption
 * @param {Array} steps - OSRM steps
 * @returns {Array} Formatted steps
 */
function formatSteps(steps) {
  if (!steps) return [];

  return steps.map((step, index) => ({
    index,
    instruction: step.maneuver ? formatInstruction(step.maneuver, step.name) : 'Continue',
    distanceMeters: step.distance,
    durationSeconds: step.duration,
    maneuver: step.maneuver?.type,
    location: step.maneuver?.location ? {
      lat: step.maneuver.location[1],
      lng: step.maneuver.location[0]
    } : null
  }));
}

/**
 * Format turn instruction
 * @param {object} maneuver - OSRM maneuver object
 * @param {string} roadName - Road name
 * @returns {string} Formatted instruction
 */
function formatInstruction(maneuver, roadName) {
  const type = maneuver.type;
  const modifier = maneuver.modifier;
  const name = roadName || '';

  const instructions = {
    'turn': {
      'left': `Turn left${name ? ' onto ' + name : ''}`,
      'right': `Turn right${name ? ' onto ' + name : ''}`,
      'slight left': `Turn slightly left${name ? ' onto ' + name : ''}`,
      'slight right': `Turn slightly right${name ? ' onto ' + name : ''}`,
      'sharp left': `Turn sharply left${name ? ' onto ' + name : ''}`,
      'sharp right': `Turn sharply right${name ? ' onto ' + name : ''}`
    },
    'depart': `Head ${modifier || 'forward'}${name ? ' on ' + name : ''}`,
    'arrive': 'Arrive at your destination',
    'merge': `Merge${modifier ? ' ' + modifier : ''}${name ? ' onto ' + name : ''}`,
    'roundabout': `Take roundabout${name ? ' onto ' + name : ''}`,
    'fork': `Take fork ${modifier || 'forward'}${name ? ' onto ' + name : ''}`,
    'continue': `Continue${name ? ' on ' + name : ''}`
  };

  if (instructions[type] && typeof instructions[type] === 'object') {
    return instructions[type][modifier] || `${type} ${modifier}`;
  }

  return instructions[type] || `${type} ${modifier}`;
}

module.exports = {
  getDirections,
  getDistanceMatrix,
  optimizeRoute,
  matchRoute,
  saveRoute,
  getRoute
};
