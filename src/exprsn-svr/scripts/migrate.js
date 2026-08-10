/**
 * ═══════════════════════════════════════════════════════════
 * Database Migration Script
 * Runs all pending Sequelize migrations
 * ═══════════════════════════════════════════════════════════
 */

const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs').promises;
const config = require('../config');
const logger = require('../utils/logger');

// Create Sequelize instance
const sequelize = new Sequelize(
  config.database.name,
  config.database.username,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect,
    logging: (msg) => logger.info(msg)
  }
);

/**
 * Create SequelizeMeta table if it doesn't exist
 */
async function ensureMetaTable() {
  const [results] = await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "SequelizeMeta" (
      name VARCHAR(255) NOT NULL PRIMARY KEY
    );
  `);
  logger.info('SequelizeMeta table ensured');
}

/**
 * Get list of executed migrations
 */
async function getExecutedMigrations() {
  const [results] = await sequelize.query(
    'SELECT name FROM "SequelizeMeta" ORDER BY name ASC'
  );
  return results.map(r => r.name);
}

/**
 * Get list of pending migrations
 */
async function getPendingMigrations(migrationsPath) {
  const files = await fs.readdir(migrationsPath);
  const migrationFiles = files
    .filter(f => f.endsWith('.js'))
    .sort();

  const executed = await getExecutedMigrations();
  const pending = migrationFiles.filter(f => !executed.includes(f));

  return pending;
}

/**
 * Run a single migration
 */
async function runMigration(migrationFile, migrationsPath) {
  const migrationPath = path.join(migrationsPath, migrationFile);
  const migration = require(migrationPath);

  logger.info(`Running migration: ${migrationFile}`);

  try {
    await migration.up(sequelize.getQueryInterface(), Sequelize);

    // Record migration
    await sequelize.query(
      'INSERT INTO "SequelizeMeta" (name) VALUES (:name)',
      {
        replacements: { name: migrationFile }
      }
    );

    logger.info(`✓ Migration completed: ${migrationFile}`);
    return true;
  } catch (error) {
    logger.error(`✗ Migration failed: ${migrationFile}`, error);
    throw error;
  }
}

/**
 * Main migration function
 */
async function migrate() {
  const migrationsPath = path.join(__dirname, '../migrations');

  try {
    // Connect to database
    await sequelize.authenticate();
    logger.info('Database connection established');

    // Ensure meta table exists
    await ensureMetaTable();

    // Get pending migrations
    const pending = await getPendingMigrations(migrationsPath);

    if (pending.length === 0) {
      logger.info('No pending migrations');
      return;
    }

    logger.info(`Found ${pending.length} pending migration(s)`);

    // Run each pending migration
    for (const migrationFile of pending) {
      await runMigration(migrationFile, migrationsPath);
    }

    logger.info(`✓ All migrations completed successfully`);

  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run migrations
migrate();
