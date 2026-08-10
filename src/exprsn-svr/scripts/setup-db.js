/**
 * Database Setup Script
 * Syncs all models and creates tables
 */

require('dotenv').config();
const { syncDatabase } = require('../config/database');
const logger = require('../utils/logger');

async function setupDatabase() {
  try {
    logger.info('Starting database setup...');

    // Load models
    require('../models/Page');

    // Sync database (alter: true will update existing tables)
    const success = await syncDatabase({ alter: true });

    if (success) {
      logger.info('Database setup completed successfully!');
      process.exit(0);
    } else {
      logger.error('Database setup failed');
      process.exit(1);
    }
  } catch (error) {
    logger.error('Database setup error:', error);
    process.exit(1);
  }
}

setupDatabase();
