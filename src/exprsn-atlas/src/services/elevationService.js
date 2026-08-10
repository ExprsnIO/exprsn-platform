const axios = require('axios');
const logger = require('../utils/logger');
const redis = require('../config/redis');
const config = require('../config');

/**
 * ═══════════════════════════════════════════════════════════
 * Elevation Service - Terrain and Elevation Queries
 * Provides elevation data, terrain profiles, and slope analysis
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Get elevation at a single point
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<object>} Elevation data
 */
async function getElevation(lat, lng) {
  try {
    // Check cache first
    const cacheKey = `elevation:${lat.toFixed(6)}:${lng.toFixed(6)}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // Call elevation API
    let elevation;

    switch (config.spatial.elevationProvider) {
      case 'open-elevation':
        elevation = await getElevationOpenElevation([{ lat, lng }]);
        elevation = elevation[0];
        break;

      case 'mapbox':
        elevation = await getElevationMapbox(lat, lng);
        break;

      case 'google':
        elevation = await getElevationGoogle(lat, lng);
        break;

      default:
        elevation = await getElevationOpenElevation([{ lat, lng }]);
        elevation = elevation[0];
    }

    const result = {
      latitude: lat,
      longitude: lng,
      elevation: elevation,
      unit: 'meters',
      provider: config.spatial.elevationProvider
    };

    // Cache for 24 hours (elevation doesn't change)
    await redis.setex(cacheKey, 86400, JSON.stringify(result));

    return result;
  } catch (error) {
    logger.error('Error getting elevation:', error);
    throw error;
  }
}

/**
 * Get elevation profile along a path
 * @param {Array} path - Array of {lat, lng} points
 * @param {number} samples - Number of samples (optional, auto-calculated)
 * @returns {Promise<object>} Elevation profile with statistics
 */
async function getElevationProfile(path, samples = null) {
  try {
    if (!path || path.length < 2) {
      throw new Error('Path must contain at least 2 points');
    }

    // Auto-calculate samples based on path length
    if (!samples) {
      samples = Math.min(Math.max(path.length, 10), 100);
    }

    // Sample points along the path
    const sampledPoints = samplePath(path, samples);

    // Get elevations for all sampled points
    const elevations = await getElevationBulk(sampledPoints);

    // Calculate cumulative distances
    let cumulativeDistance = 0;
    const profile = elevations.map((point, index) => {
      if (index > 0) {
        const dist = calculateDistanceHaversine(
          elevations[index - 1].latitude,
          elevations[index - 1].longitude,
          point.latitude,
          point.longitude
        );
        cumulativeDistance += dist;
      }

      return {
        latitude: point.latitude,
        longitude: point.longitude,
        elevation: point.elevation,
        distanceMeters: cumulativeDistance,
        distanceKm: parseFloat((cumulativeDistance / 1000).toFixed(2))
      };
    });

    // Calculate statistics
    const elevations_only = profile.map(p => p.elevation);
    const minElevation = Math.min(...elevations_only);
    const maxElevation = Math.max(...elevations_only);

    // Calculate elevation gain/loss
    let elevationGain = 0;
    let elevationLoss = 0;

    for (let i = 1; i < profile.length; i++) {
      const diff = profile[i].elevation - profile[i - 1].elevation;
      if (diff > 0) {
        elevationGain += diff;
      } else {
        elevationLoss += Math.abs(diff);
      }
    }

    // Calculate average slope
    const totalDistance = profile[profile.length - 1].distanceMeters;
    const totalElevationChange = profile[profile.length - 1].elevation - profile[0].elevation;
    const averageSlopePercent = totalDistance > 0
      ? (totalElevationChange / totalDistance) * 100
      : 0;

    logger.info(`Generated elevation profile with ${profile.length} points`);

    return {
      profile,
      statistics: {
        minElevation: parseFloat(minElevation.toFixed(2)),
        maxElevation: parseFloat(maxElevation.toFixed(2)),
        elevationGain: parseFloat(elevationGain.toFixed(2)),
        elevationLoss: parseFloat(elevationLoss.toFixed(2)),
        totalDistanceMeters: parseFloat(totalDistance.toFixed(2)),
        totalDistanceKm: parseFloat((totalDistance / 1000).toFixed(2)),
        averageSlopePercent: parseFloat(averageSlopePercent.toFixed(2)),
        startElevation: parseFloat(profile[0].elevation.toFixed(2)),
        endElevation: parseFloat(profile[profile.length - 1].elevation.toFixed(2))
      }
    };
  } catch (error) {
    logger.error('Error getting elevation profile:', error);
    throw error;
  }
}

/**
 * Get slope/grade between two points
 * @param {number} lat1 - Start latitude
 * @param {number} lng1 - Start longitude
 * @param {number} lat2 - End latitude
 * @param {number} lng2 - End longitude
 * @returns {Promise<object>} Slope information
 */
async function getSlope(lat1, lng1, lat2, lng2) {
  try {
    // Get elevations for both points
    const [elev1, elev2] = await Promise.all([
      getElevation(lat1, lng1),
      getElevation(lat2, lng2)
    ]);

    // Calculate horizontal distance
    const distance = calculateDistanceHaversine(lat1, lng1, lat2, lng2);

    // Calculate elevation change
    const elevationChange = elev2.elevation - elev1.elevation;

    // Calculate slope (rise/run)
    const slopePercent = distance > 0 ? (elevationChange / distance) * 100 : 0;
    const slopeDegrees = Math.atan(elevationChange / distance) * (180 / Math.PI);

    // Classify difficulty
    let difficulty;
    const absSlope = Math.abs(slopePercent);

    if (absSlope < 5) {
      difficulty = 'flat';
    } else if (absSlope < 10) {
      difficulty = 'gentle';
    } else if (absSlope < 15) {
      difficulty = 'moderate';
    } else if (absSlope < 25) {
      difficulty = 'steep';
    } else {
      difficulty = 'very_steep';
    }

    return {
      start: {
        latitude: lat1,
        longitude: lng1,
        elevation: elev1.elevation
      },
      end: {
        latitude: lat2,
        longitude: lng2,
        elevation: elev2.elevation
      },
      distance: {
        meters: parseFloat(distance.toFixed(2)),
        km: parseFloat((distance / 1000).toFixed(2))
      },
      elevationChange: parseFloat(elevationChange.toFixed(2)),
      slope: {
        percent: parseFloat(slopePercent.toFixed(2)),
        degrees: parseFloat(slopeDegrees.toFixed(2)),
        ratio: distance > 0 ? `1:${parseFloat((distance / elevationChange).toFixed(1))}` : 'N/A'
      },
      difficulty,
      direction: elevationChange > 0 ? 'uphill' : elevationChange < 0 ? 'downhill' : 'flat'
    };
  } catch (error) {
    logger.error('Error calculating slope:', error);
    throw error;
  }
}

/**
 * Get elevation data for multiple points (bulk request)
 * @param {Array} points - Array of {lat, lng} objects
 * @returns {Promise<Array>} Array of elevation data
 */
async function getElevationBulk(points) {
  try {
    if (!points || points.length === 0) {
      return [];
    }

    // Check for cached values
    const uncachedPoints = [];
    const results = new Array(points.length);

    for (let i = 0; i < points.length; i++) {
      const cacheKey = `elevation:${points[i].lat.toFixed(6)}:${points[i].lng.toFixed(6)}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        results[i] = JSON.parse(cached);
      } else {
        uncachedPoints.push({ index: i, ...points[i] });
      }
    }

    // Fetch uncached elevations
    if (uncachedPoints.length > 0) {
      const elevations = await getElevationOpenElevation(
        uncachedPoints.map(p => ({ lat: p.lat, lng: p.lng }))
      );

      for (let i = 0; i < uncachedPoints.length; i++) {
        const point = uncachedPoints[i];
        const result = {
          latitude: point.lat,
          longitude: point.lng,
          elevation: elevations[i],
          unit: 'meters'
        };

        results[point.index] = result;

        // Cache result
        const cacheKey = `elevation:${point.lat.toFixed(6)}:${point.lng.toFixed(6)}`;
        await redis.setex(cacheKey, 86400, JSON.stringify(result));
      }
    }

    return results;
  } catch (error) {
    logger.error('Error getting bulk elevation:', error);
    throw error;
  }
}

/**
 * Sample points evenly along a path
 * @param {Array} path - Original path points
 * @param {number} numSamples - Number of samples to generate
 * @returns {Array} Sampled points
 */
function samplePath(path, numSamples) {
  if (path.length <= numSamples) {
    return path;
  }

  const sampled = [path[0]]; // Always include start
  const segmentLength = (path.length - 1) / (numSamples - 1);

  for (let i = 1; i < numSamples - 1; i++) {
    const index = Math.round(i * segmentLength);
    sampled.push(path[index]);
  }

  sampled.push(path[path.length - 1]); // Always include end

  return sampled;
}

/**
 * Call Open-Elevation API
 * @param {Array} points - Array of {lat, lng} points
 * @returns {Promise<Array>} Array of elevations in meters
 */
async function getElevationOpenElevation(points) {
  try {
    const locations = points.map(p => ({
      latitude: p.lat,
      longitude: p.lng
    }));

    const response = await axios.post(
      config.spatial.elevationApiUrl,
      { locations },
      {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' }
      }
    );

    return response.data.results.map(r => r.elevation);
  } catch (error) {
    logger.error('Open-Elevation API error:', error.message);
    throw new Error('Elevation service unavailable');
  }
}

/**
 * Call Mapbox Elevation API (if configured)
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<number>} Elevation in meters
 */
async function getElevationMapbox(lat, lng) {
  // Placeholder - implement if Mapbox API key available
  throw new Error('Mapbox elevation not implemented - use Open-Elevation');
}

/**
 * Call Google Elevation API (if configured)
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<number>} Elevation in meters
 */
async function getElevationGoogle(lat, lng) {
  // Placeholder - implement if Google API key available
  throw new Error('Google elevation not implemented - use Open-Elevation');
}

/**
 * Calculate distance using Haversine formula
 * @param {number} lat1 - Start latitude
 * @param {number} lng1 - Start longitude
 * @param {number} lat2 - End latitude
 * @param {number} lng2 - End longitude
 * @returns {number} Distance in meters
 */
function calculateDistanceHaversine(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

module.exports = {
  getElevation,
  getElevationProfile,
  getSlope,
  getElevationBulk
};
