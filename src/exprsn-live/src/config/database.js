/**
 * Exprsn Live - Database Configuration
 * Sequelize ORM setup and connection management
 */

const { Sequelize } = require('sequelize');
const config = require('./index');
const logger = require('../utils/logger');

// Create Sequelize instance
const sequelize = new Sequelize(
  config.database.database,
  config.database.username,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect,
    pool: config.database.pool,
    logging: config.database.logging,
    define: {
      timestamps: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
);

// Test database connection
async function testConnection() {
  try {
    await sequelize.authenticate();
    logger.info('Database connection established successfully');
    return true;
  } catch (error) {
    logger.error('Unable to connect to database:', error);
    return false;
  }
}

// Sync database models
async function syncDatabase(options = {}) {
  try {
    await sequelize.sync(options);
    logger.info('Database models synchronized');
    return true;
  } catch (error) {
    logger.error('Failed to sync database models:', error);
    return false;
  }
}

// Close database connection
async function closeConnection() {
  try {
    await sequelize.close();
    logger.info('Database connection closed');
    return true;
  } catch (error) {
    logger.error('Failed to close database connection:', error);
    return false;
  }
}

module.exports = {
  sequelize,
  testConnection,
  syncDatabase,
  closeConnection
};
