/**
 * ═══════════════════════════════════════════════════════════
 * atproto — Sequelize database configuration
 * Mirrors services/moderator/config/database.js so the migrate-sync
 * child process (scripts/sync-one.js) and the runtime use the same env.
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();

const base = {
  username: process.env.DB_USER || 'exprsn',
  password: process.env.DB_PASSWORD || 'exprsn',
  database: process.env.DB_NAME || 'exprsn',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  dialect: 'postgres',
};

module.exports = {
  development: {
    ...base,
    logging: process.env.DB_LOGGING === 'true' ? console.log : false,
    pool: { max: 10, min: 2, acquire: 30000, idle: 10000 },
  },
  test: {
    ...base,
    database: process.env.DB_NAME_TEST || 'exprsn_atproto_test',
    logging: false,
  },
  production: {
    ...base,
    logging: false,
    pool: { max: 20, min: 5, acquire: 60000, idle: 10000 },
    dialectOptions: {
      ssl: process.env.DB_SSL === 'true' ? { require: true, rejectUnauthorized: false } : false,
    },
  },
};
