const { Sequelize } = require('sequelize');
const config = require('./index');
const logger = require('../utils/logger');

/**
 * ═══════════════════════════════════════════════════════════
 * Database Configuration with PostGIS Support
 * ═══════════════════════════════════════════════════════════
 */

const sequelize = new Sequelize(
  config.database.name,
  config.database.user,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect,
    logging: config.database.logging,
    pool: config.database.pool,
    define: {
      timestamps: false,
      underscored: true
    },
    dialectOptions: {
      // Enable PostGIS extension support
      application_name: 'exprsn-atlas',
      statement_timeout: 30000
    }
  }
);

/**
 * Initialize PostGIS extension
 * Run this during initial setup
 */
async function initializePostGIS() {
  try {
    // Check if PostGIS is already enabled
    const [results] = await sequelize.query(
      "SELECT COUNT(*) as count FROM pg_extension WHERE extname = 'postgis'"
    );

    if (results[0].count === '0') {
      logger.info('Enabling PostGIS extension...');
      await sequelize.query('CREATE EXTENSION IF NOT EXISTS postgis');
      await sequelize.query('CREATE EXTENSION IF NOT EXISTS postgis_topology');
      logger.info('PostGIS extension enabled successfully');
    } else {
      logger.info('PostGIS extension already enabled');
    }

    // Verify PostGIS version
    const [version] = await sequelize.query('SELECT PostGIS_Version()');
    logger.info(`PostGIS version: ${version[0].postgis_version}`);

    return true;
  } catch (error) {
    logger.error('Error initializing PostGIS:', error);
    throw error;
  }
}

/**
 * Test database connection and PostGIS
 */
async function testConnection() {
  try {
    await sequelize.authenticate();
    logger.info('Database connection established successfully');

    // Test PostGIS availability
    const [result] = await sequelize.query("SELECT PostGIS_Version() as version");
    logger.info(`PostGIS available: ${result[0].version}`);

    return true;
  } catch (error) {
    logger.error('Unable to connect to database:', error);
    throw error;
  }
}

/**
 * Helper function to create spatial index
 * @param {string} tableName - Table name
 * @param {string} columnName - Spatial column name
 */
async function createSpatialIndex(tableName, columnName = 'location') {
  try {
    const indexName = `${tableName}_${columnName}_idx`;
    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName} USING GIST(${columnName})`
    );
    logger.info(`Spatial index created: ${indexName}`);
  } catch (error) {
    logger.error(`Error creating spatial index on ${tableName}.${columnName}:`, error);
    throw error;
  }
}

/**
 * Execute raw spatial query
 * @param {string} query - SQL query
 * @param {object} options - Query options
 * @returns {Promise<Array>} Query results
 */
async function spatialQuery(query, options = {}) {
  try {
    const [results] = await sequelize.query(query, {
      type: Sequelize.QueryTypes.SELECT,
      ...options
    });
    return results;
  } catch (error) {
    logger.error('Spatial query error:', error);
    throw error;
  }
}

module.exports = sequelize;
module.exports.initializePostGIS = initializePostGIS;
module.exports.testConnection = testConnection;
module.exports.createSpatialIndex = createSpatialIndex;
module.exports.spatialQuery = spatialQuery;
