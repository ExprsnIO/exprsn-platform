/**
 * Exprsn Bridge - Configuration
 */

require('dotenv').config();

module.exports = {
  port: parseInt(process.env.BRIDGE_PORT || '3010', 10),
  env: process.env.NODE_ENV || 'development',

  // Service URLs
  services: {
    ca: process.env.CA_SERVICE_URL || 'http://localhost:3000',
    auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    spark: process.env.SPARK_SERVICE_URL || 'http://localhost:3002',
    timeline: process.env.TIMELINE_SERVICE_URL || 'http://localhost:3004',
    prefetch: process.env.PREFETCH_SERVICE_URL || 'http://localhost:3005',
    moderator: process.env.MODERATOR_SERVICE_URL || 'http://localhost:3006',
    filevault: process.env.FILEVAULT_SERVICE_URL || 'http://localhost:3007',
    gallery: process.env.GALLERY_SERVICE_URL || 'http://localhost:3008',
    live: process.env.LIVE_SERVICE_URL || 'http://localhost:3009',
    nexus: process.env.NEXUS_SERVICE_URL || 'http://localhost:3011',
    pulse: process.env.PULSE_SERVICE_URL || 'http://localhost:3012',
    vault: process.env.VAULT_SERVICE_URL || 'http://localhost:3013',
    herald: process.env.HERALD_SERVICE_URL || 'http://localhost:3014',
    setup: process.env.SETUP_SERVICE_URL || 'http://localhost:3015',
    forge: process.env.FORGE_SERVICE_URL || 'http://localhost:3016',
    workflow: process.env.WORKFLOW_SERVICE_URL || 'http://localhost:3017',
    payments: process.env.PAYMENTS_SERVICE_URL || 'http://localhost:3018',
    atlas: process.env.ATLAS_SERVICE_URL || 'http://localhost:3019',
    dbadmin: process.env.DBADMIN_SERVICE_URL || 'http://localhost:3020',
    bluesky: process.env.BLUESKY_SERVICE_URL || 'http://localhost:3021'
  },

  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10)
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  }
};
