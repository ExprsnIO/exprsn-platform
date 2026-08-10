/**
 * ═══════════════════════════════════════════════════════════
 * Configuration
 * Central configuration for Spark service
 * ═══════════════════════════════════════════════════════════
 */

module.exports = {
  // Service configuration
  service: {
    port: process.env.SPARK_SERVICE_PORT || 3002,
    host: process.env.SPARK_SERVICE_HOST || 'localhost',
    environment: process.env.NODE_ENV || 'development'
  },

  // Database configuration
  database: {
    host: process.env.SPARK_DB_HOST || 'localhost',
    port: parseInt(process.env.SPARK_DB_PORT) || 5432,
    database: process.env.SPARK_DB_NAME || 'exprsn_spark',
    username: process.env.SPARK_DB_USER || 'postgres',
    password: process.env.SPARK_DB_PASSWORD || 'postgres',
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

  // Messaging configuration
  messaging: {
    maxGroupMembers: 10000,
    maxMessageLength: 10000,
    maxAttachments: 10,
    maxAttachmentSize: 100 * 1024 * 1024, // 100MB
    typingIndicatorTimeout: 5000, // 5 seconds
    messageHistoryLimit: 100
  },

  // WebSocket configuration
  websocket: {
    pingTimeout: 60000,
    pingInterval: 25000,
    reconnectionAttempts: 5
  }
};
