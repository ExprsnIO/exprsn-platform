/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Timeline - PostgreSQL Migration Script
 * ═══════════════════════════════════════════════════════════════════════
 */

const { sequelize } = require('../src/models');
const logger = require('../src/utils/logger');

async function migrate() {
  try {
    logger.info('Starting database migration...');

    // Test connection
    await sequelize.authenticate();
    logger.info('Database connection established');

    // Sync all models
    await sequelize.sync({ alter: true });
    logger.info('Database models synchronized successfully');

    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
