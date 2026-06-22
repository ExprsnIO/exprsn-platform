const { Sequelize } = require('sequelize');
const config = require('./index');
const logger = require('../utils/logger');

const sequelize = new Sequelize(
  config.database.database,
  config.database.username,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect,
    logging: config.database.logging,
    pool: config.database.pool,
    define: {
      timestamps: false,
      underscored: true,
      // platform: tables namespaced under 'nexus' schema
      schema: 'nexus'
    }
  }
);

// platform: do NOT authenticate at require-time. Running the connection test
// (and calling process.exit on failure) at module load could kill the whole
// in-process platform. Connection verification is performed in init() instead.

module.exports = sequelize;
