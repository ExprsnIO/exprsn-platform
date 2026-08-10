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
      underscored: true
    }
  }
);

// Test connection (skip in test environment)
if (process.env.NODE_ENV !== 'test') {
  sequelize.authenticate()
    .then(() => {
      logger.info('Database connection established successfully');
    })
    .catch((err) => {
      logger.error('Unable to connect to database:', err);
      process.exit(1);
    });
}

module.exports = sequelize;
