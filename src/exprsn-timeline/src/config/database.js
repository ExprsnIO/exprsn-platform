/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Timeline - Database Configuration
 * ═══════════════════════════════════════════════════════════════════════
 */

require('dotenv').config();

module.exports = {
  development: {
    username: process.env.TIMELINE_PG_USER || process.env.DB_USER || 'exprsn_ca_user',
    password: process.env.TIMELINE_PG_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.TIMELINE_PG_DATABASE || process.env.DB_NAME || 'exprsn_ca',
    host: process.env.TIMELINE_PG_HOST || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.TIMELINE_PG_PORT || process.env.DB_PORT || '5432', 10),
    dialect: 'postgres',
    logging: console.log
  },
  test: {
    username: process.env.TIMELINE_PG_USER || 'timeline_service',
    password: process.env.TIMELINE_PG_PASSWORD || '',
    database: process.env.TIMELINE_PG_DATABASE_TEST || 'exprsn_timeline_test',
    host: process.env.TIMELINE_PG_HOST || 'localhost',
    port: parseInt(process.env.TIMELINE_PG_PORT || '5432', 10),
    dialect: 'postgres',
    logging: false
  },
  production: {
    username: process.env.TIMELINE_PG_USER,
    password: process.env.TIMELINE_PG_PASSWORD,
    database: process.env.TIMELINE_PG_DATABASE,
    host: process.env.TIMELINE_PG_HOST,
    port: parseInt(process.env.TIMELINE_PG_PORT || '5432', 10),
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 20,
      min: 5,
      acquire: 30000,
      idle: 10000
    }
  }
};
