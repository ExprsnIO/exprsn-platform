/**
 * Database Migration Script
 * Runs all pending migrations in the migrations directory
 */

const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'exprsn_live',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  dialect: 'postgres',
  logging: false
};

async function runMigrations() {
  console.log('🔧 Starting database migrations...\n');

  const sequelize = new Sequelize(config);

  try {
    // Test connection
    await sequelize.authenticate();
    console.log('✅ Database connection established\n');

    // Create migrations table if it doesn't exist
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS sequelize_meta (
        name VARCHAR(255) PRIMARY KEY
      );
    `);

    // Get already executed migrations
    const [executedMigrations] = await sequelize.query(
      'SELECT name FROM sequelize_meta ORDER BY name'
    );
    const executedNames = new Set(executedMigrations.map(m => m.name));

    // Get all migration files
    const migrationsDir = path.join(__dirname, '../migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.js'))
      .sort();

    console.log(`Found ${migrationFiles.length} migration files`);
    console.log(`Already executed: ${executedNames.size}\n`);

    // Run pending migrations
    let executed = 0;
    for (const file of migrationFiles) {
      if (executedNames.has(file)) {
        console.log(`⏭️  Skipping ${file} (already executed)`);
        continue;
      }

      console.log(`⚙️  Running ${file}...`);

      const migration = require(path.join(migrationsDir, file));

      try {
        await migration.up(sequelize.getQueryInterface(), Sequelize);

        // Record migration
        await sequelize.query(
          'INSERT INTO sequelize_meta (name) VALUES (?)',
          { replacements: [file] }
        );

        console.log(`✅ Completed ${file}\n`);
        executed++;
      } catch (error) {
        console.error(`❌ Failed to run ${file}:`, error.message);
        throw error;
      }
    }

    if (executed === 0) {
      console.log('✨ No new migrations to run. Database is up to date!\n');
    } else {
      console.log(`\n✅ Successfully executed ${executed} migration(s)!\n`);
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

runMigrations();
