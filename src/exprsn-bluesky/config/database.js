const { Sequelize } = require('sequelize');
const { logger } = require('@exprsn/shared');
require('dotenv').config();

// Configuration object for sequelize-cli
const config = {
  development: {
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'exprsn_bluesky',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    define: {
      underscored: true,
      timestamps: true
    }
  },
  test: {
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'exprsn_bluesky',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    define: {
      underscored: true,
      timestamps: true
    }
  },
  production: {
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'exprsn_bluesky',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 20,
      min: 5,
      acquire: 60000,
      idle: 10000
    },
    define: {
      underscored: true,
      timestamps: true
    }
  }
};

// Sequelize instance for the application
const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    ...dbConfig,
    logging: process.env.NODE_ENV === 'development' && logger ? (msg) => logger.debug(msg) : false
  }
);

async function initializeDatabase() {
  try {
    await sequelize.authenticate();
    if (logger) {
      logger.info('Database connection established successfully');
    }

    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: false });
      if (logger) {
        logger.info('Database synchronized');
      }
    }

    return sequelize;
  } catch (error) {
    if (logger) {
      logger.error('Unable to connect to database', {
        error: error.message,
        stack: error.stack
      });
    }
    throw error;
  }
}

// Export for sequelize-cli
module.exports = config;

// Also export sequelize instance and init function for app usage
module.exports.sequelize = sequelize;
module.exports.initializeDatabase = initializeDatabase;
