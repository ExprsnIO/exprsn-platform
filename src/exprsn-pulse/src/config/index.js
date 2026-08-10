/**
 * Exprsn Pulse - Configuration
 */

require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PULSE_PORT || '3012', 10),
  env: process.env.NODE_ENV || 'development',

  // Database
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'exprsn_pulse',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || ''
  },

  // Redis for caching
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10)
  },

  // Analytics retention
  retention: {
    rawEvents: parseInt(process.env.RAW_EVENTS_DAYS || '30', 10),
    aggregates: parseInt(process.env.AGGREGATES_DAYS || '365', 10)
  }
};
