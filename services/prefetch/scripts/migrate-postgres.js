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
      // platform: tables namespaced under 'prefetch' schema (single shared DB)
      define: config.database.define,
      logging: console.log
    }
  );

  try {
    logger.info('Starting database migration...');

    // Test connection
    await sequelize.authenticate();
    logger.info('Database connection established');

    // platform: schema comes from the orchestrator (DB_SCHEMA), defaulting to 'prefetch'
    const schema = process.env.DB_SCHEMA || 'prefetch';

    // Ensure the schema exists before creating tables in it
    await sequelize.createSchema(schema, {});
    logger.info(`${schema} schema ensured`);

    // Create prefetch jobs table.
    // NOTE: Postgres does not support MySQL-style inline INDEX declarations;
    // indexes are created as separate statements below.
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".prefetch_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        priority VARCHAR(20) DEFAULT 'medium',
        status VARCHAR(20) DEFAULT 'pending',
        result JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      );
    `);

    await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_prefetch_jobs_user_id ON "${schema}".prefetch_jobs (user_id);`);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_prefetch_jobs_status ON "${schema}".prefetch_jobs (status);`);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_prefetch_jobs_priority ON "${schema}".prefetch_jobs (priority);`);

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
