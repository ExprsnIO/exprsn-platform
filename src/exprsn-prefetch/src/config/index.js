/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Prefetch - Configuration
 * ═══════════════════════════════════════════════════════════════════════
 */

require('dotenv').config();

module.exports = {
  // Application
  app: {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PREFETCH_SERVICE_PORT || '3005', 10),
    host: process.env.PREFETCH_SERVICE_HOST || 'prefetch.exprsn.io'
  },

  // Worker Configuration
  worker: {
    count: parseInt(process.env.PREFETCH_WORKER_COUNT || '20', 10),
    concurrency: parseInt(process.env.PREFETCH_JOB_CONCURRENCY || '100', 10),
    batchSize: parseInt(process.env.PREFETCH_BATCH_SIZE || '50', 10)
  },

  // Redis (Cache)
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    clusterMode: process.env.REDIS_CLUSTER_MODE === 'true',
    db: {
      hot: parseInt(process.env.REDIS_DB_HOT || '0', 10),
      warm: parseInt(process.env.REDIS_DB_WARM || '1', 10)
    }
  },

  // PostgreSQL (Job Queue & Analytics)
  database: {
    host: process.env.PREFETCH_PG_HOST || 'localhost',
    port: parseInt(process.env.PREFETCH_PG_PORT || '5432', 10),
    database: process.env.PREFETCH_PG_DATABASE || 'exprsn_prefetch',
    username: process.env.PREFETCH_PG_USER || 'prefetch_service',
    password: process.env.PREFETCH_PG_PASSWORD || '',
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: parseInt(process.env.DB_POOL_MAX || '10', 10),
      min: parseInt(process.env.DB_POOL_MIN || '2', 10),
      acquire: parseInt(process.env.DB_POOL_ACQUIRE || '30000', 10),
      idle: parseInt(process.env.DB_POOL_IDLE || '10000', 10)
    }
  },

  // Certificate Authority
  ca: {
    domain: process.env.PREFETCH_CA_DOMAIN || 'prefetch.exprsn.io',
    certificateSerial: process.env.PREFETCH_CERT_SERIAL || '',
    privateKeyPath: process.env.PREFETCH_PRIVATE_KEY_PATH || '/secrets/prefetch-service-key.pem',
    certificatePath: process.env.PREFETCH_CERTIFICATE_PATH || '/secrets/prefetch-service-cert.pem',
    rootCertPath: process.env.CA_ROOT_CERT_PATH || '/secrets/ca-root-cert.pem'
  },

  // Service URLs
  services: {
    ca: process.env.CA_URL || 'http://localhost:3000',
    timeline: process.env.TIMELINE_SERVICE_URL || 'http://localhost:3004',
    auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001'
  },

  // Cache Configuration
  cache: {
    hotTTL: parseInt(process.env.HOT_CACHE_TTL || '300000', 10), // 5 minutes
    warmTTL: parseInt(process.env.WARM_CACHE_TTL || '900000', 10), // 15 minutes
    coldTTL: parseInt(process.env.COLD_CACHE_TTL || '3600000', 10) // 1 hour
  },

  // Prefetch Strategies
  strategies: {
    activityBased: process.env.ENABLE_ACTIVITY_BASED !== 'false',
    eventTriggered: process.env.ENABLE_EVENT_TRIGGERED !== 'false',
    predictive: process.env.ENABLE_PREDICTIVE === 'true',
    activityCheckInterval: parseInt(process.env.ACTIVITY_CHECK_INTERVAL || '60000', 10) // 1 minute
  },

  // Performance
  performance: {
    maxTimelineSize: parseInt(process.env.MAX_TIMELINE_SIZE || '100', 10),
    prefetchTimeout: parseInt(process.env.PREFETCH_TIMEOUT || '10000', 10) // 10 seconds
  }
};
