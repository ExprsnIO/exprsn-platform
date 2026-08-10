/**
 * ═══════════════════════════════════════════════════════════
 * Configuration
 * Central configuration for Timeline service
 * ═══════════════════════════════════════════════════════════
 */

module.exports = {
  // Service configuration
  service: {
    port: process.env.TIMELINE_SERVICE_PORT || 3004,
    host: process.env.TIMELINE_SERVICE_HOST || 'localhost',
    environment: process.env.NODE_ENV || 'development'
  },

  // Database configuration
  database: {
    host: process.env.TIMELINE_DB_HOST || 'localhost',
    port: parseInt(process.env.TIMELINE_DB_PORT) || 5432,
    database: process.env.TIMELINE_DB_NAME || 'exprsn_timeline',
    username: process.env.TIMELINE_DB_USER || 'postgres',
    password: process.env.TIMELINE_DB_PASSWORD || 'postgres',
    dialect: 'postgres',
    logging: process.env.DB_LOGGING === 'true' ? console.log : false,
    pool: {
      max: 20,
      min: 5,
      acquire: 30000,
      idle: 10000
    }
  },

  // Redis configuration
  redis: {
    enabled: process.env.REDIS_ENABLED === 'true',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || null
  },

  // CA configuration
  ca: {
    url: process.env.CA_URL || 'http://localhost:3000',
    ocspUrl: process.env.OCSP_RESPONDER_URL || 'http://localhost:2560'
  },

  // Herald configuration
  herald: {
    url: process.env.HERALD_SERVICE_URL || 'http://localhost:3014',
    enabled: process.env.HERALD_ENABLED !== 'false', // Enabled by default
    timeout: parseInt(process.env.HERALD_TIMEOUT) || 5000
  },

  // Spark configuration (Real-time messaging)
  spark: {
    url: process.env.SPARK_SERVICE_URL || 'http://localhost:3002',
    enabled: process.env.SPARK_ENABLED !== 'false', // Enabled by default
    timeout: parseInt(process.env.SPARK_TIMEOUT) || 5000
  },

  // Prefetch configuration (Timeline caching)
  prefetch: {
    url: process.env.PREFETCH_SERVICE_URL || 'http://localhost:3005',
    enabled: process.env.PREFETCH_ENABLED !== 'false', // Enabled by default
    timeout: parseInt(process.env.PREFETCH_TIMEOUT) || 5000
  },

  // ElasticSearch configuration
  elasticsearch: {
    enabled: process.env.ELASTICSEARCH_ENABLED === 'true',
    node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
    auth: {
      username: process.env.ELASTICSEARCH_USERNAME || 'elastic',
      password: process.env.ELASTICSEARCH_PASSWORD || ''
    },
    maxRetries: 3,
    requestTimeout: 30000,
    sniffOnStart: false,
    indices: {
      posts: process.env.ELASTICSEARCH_POSTS_INDEX || 'exprsn_posts',
      users: process.env.ELASTICSEARCH_USERS_INDEX || 'exprsn_users'
    }
  },

  // Timeline configuration
  timeline: {
    maxPostLength: 5000,
    defaultPageSize: 20,
    maxPageSize: 100,
    feedCacheTTL: 300 // 5 minutes
  }
};
