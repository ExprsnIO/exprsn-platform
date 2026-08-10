require('dotenv').config();

module.exports = {
  env: process.env.NODE_ENV || 'development',

  service: {
    name: 'exprsn-atlas',
    port: parseInt(process.env.PORT) || 3018,
    host: process.env.HOST || '0.0.0.0'
  },

  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    name: process.env.DB_NAME || 'exprsn_atlas',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    dialect: 'postgres',
    logging: process.env.DB_LOGGING === 'true' ? console.log : false,
    pool: {
      max: parseInt(process.env.DB_POOL_MAX) || 10,
      min: parseInt(process.env.DB_POOL_MIN) || 2,
      acquire: 30000,
      idle: 10000
    }
  },

  redis: {
    enabled: process.env.REDIS_ENABLED !== 'false',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB) || 0,
    keyPrefix: 'atlas:'
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
  },

  ca: {
    url: process.env.CA_URL || 'http://localhost:3000',
    ocspUrl: process.env.CA_OCSP_URL || 'http://localhost:2560'
  },

  geocoding: {
    provider: process.env.GEOCODING_PROVIDER || 'openstreetmap',
    apiKey: process.env.GEOCODING_API_KEY || null,
    timeout: parseInt(process.env.GEOCODING_TIMEOUT) || 5000
  },

  mapping: {
    defaultZoom: parseInt(process.env.MAP_DEFAULT_ZOOM) || 12,
    maxZoom: parseInt(process.env.MAP_MAX_ZOOM) || 18,
    minZoom: parseInt(process.env.MAP_MIN_ZOOM) || 1,
    tileProvider: process.env.TILE_PROVIDER || 'openstreetmap',
    tileApiKey: process.env.TILE_API_KEY || null
  },

  routing: {
    provider: process.env.ROUTING_PROVIDER || 'osrm',
    osrmUrl: process.env.OSRM_URL || 'http://router.project-osrm.org',
    maxWaypoints: parseInt(process.env.ROUTING_MAX_WAYPOINTS) || 25
  },

  spatial: {
    defaultSRID: parseInt(process.env.SPATIAL_DEFAULT_SRID) || 4326, // WGS84
    maxSearchRadiusKm: parseInt(process.env.SPATIAL_MAX_RADIUS_KM) || 500,
    defaultSearchRadiusKm: parseInt(process.env.SPATIAL_DEFAULT_RADIUS_KM) || 50,
    elevationProvider: process.env.ELEVATION_PROVIDER || 'open-elevation',
    elevationApiUrl: process.env.ELEVATION_API_URL || 'https://api.open-elevation.com/api/v1/lookup'
  },

  features: {
    geocoding: process.env.FEATURE_GEOCODING !== 'false',
    routing: process.env.FEATURE_ROUTING !== 'false',
    elevation: process.env.FEATURE_ELEVATION !== 'false',
    geofencing: process.env.FEATURE_GEOFENCING !== 'false',
    heatmaps: process.env.FEATURE_HEATMAPS !== 'false'
  },

  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
  }
};
