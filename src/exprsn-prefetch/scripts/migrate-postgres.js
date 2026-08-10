/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Prefetch - PostgreSQL Migration Script
 * ═══════════════════════════════════════════════════════════════════════
 */

const { Sequelize } = require('sequelize');
const config = require('../src/config');
const logger = require('../src/utils/logger');

async function migrate() {
  const sequelize = new Sequelize(
    config.database.database,
    config.database.username,
    config.database.password,
    {
      host: config.database.host,
      port: config.database.port,
      dialect: config.database.dialect,
      logging: console.log
    }
  );

  try {
    logger.info('Starting database migration...');

    // Test connection
    await sequelize.authenticate();
    logger.info('Database connection established');

    // Create prefetch jobs table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS prefetch_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        priority VARCHAR(20) DEFAULT 'medium',
        status VARCHAR(20) DEFAULT 'pending',
        result JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_status (status),
        INDEX idx_priority (priority)
      );
    `);

    logger.info('Prefetch jobs table created');

    await sequelize.close();
    logger.info('Migration completed successfully');

    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', error);
    await sequelize.close();
    process.exit(1);
  }
}

migrate();
