/**
 * ═══════════════════════════════════════════════════════════
 * Run Git Setup Migrations
 * Runs only the Git-related migrations
 * ═══════════════════════════════════════════════════════════
 */

const path = require('path');
const { Sequelize } = require('sequelize');
const fs = require('fs');

// Database configuration
const config = require('../config/database.js');
const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

// Initialize Sequelize
const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: dbConfig.dialect,
    logging: console.log
  }
);

const runMigrations = async () => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Running Git Setup Migrations');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Test connection
    await sequelize.authenticate();
    console.log('✓ Database connection successful\n');

    // Ensure SequelizeMeta table exists
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "SequelizeMeta" (
        "name" VARCHAR(255) NOT NULL PRIMARY KEY
      );
    `);

    // Check which migrations have already run
    const [executedMigrations] = await sequelize.query(
      'SELECT name FROM "SequelizeMeta"'
    );
    const executed = new Set(executedMigrations.map(m => m.name));

    // Git-related migrations to run
    const gitMigrations = [
      '20251227000001-create-git-system.js',
      '20251227000002-create-git-setup-system.js'
    ];

    const migrationsPath = path.join(__dirname, '..', 'migrations');

    console.log('Migrations to process:');
    for (const migrationFile of gitMigrations) {
      const status = executed.has(migrationFile) ? '✓ (already run)' : '→ (pending)';
      console.log(`  ${status} ${migrationFile}`);
    }
    console.log('');

    // Run pending migrations
    for (const migrationFile of gitMigrations) {
      if (executed.has(migrationFile)) {
        console.log(`Skipping ${migrationFile} (already executed)`);
        continue;
      }

      console.log(`\nExecuting migration: ${migrationFile}`);
      console.log('─'.repeat(60));

      const migrationPath = path.join(migrationsPath, migrationFile);

      if (!fs.existsSync(migrationPath)) {
        console.log(`✗ Migration file not found: ${migrationPath}`);
        continue;
      }

      const migration = require(migrationPath);

      try {
        // Run the migration
        await migration.up(sequelize.getQueryInterface(), Sequelize);

        // Record it in SequelizeMeta
        await sequelize.query(
          'INSERT INTO "SequelizeMeta" (name) VALUES (?)',
          {
            replacements: [migrationFile]
          }
        );

        console.log(`✓ Migration ${migrationFile} executed successfully\n`);
      } catch (error) {
        console.error(`✗ Migration ${migrationFile} failed:`, error.message);

        // Check if it's a "relation already exists" error
        if (error.message.includes('already exists')) {
          console.log('  Tables may already exist. Marking as complete...');

          // Still record it as run
          try {
            await sequelize.query(
              'INSERT INTO "SequelizeMeta" (name) VALUES (?) ON CONFLICT DO NOTHING',
              {
                replacements: [migrationFile]
              }
            );
            console.log(`✓ Migration ${migrationFile} marked as complete\n`);
          } catch (insertError) {
            console.error('  Could not mark migration as complete:', insertError.message);
          }
        } else {
          throw error;
        }
      }
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✓ Git Setup Migrations Complete!');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('Next steps:');
    console.log('  1. Test the setup:');
    console.log('     node src/exprsn-svr/lowcode/scripts/test-git-setup.js');
    console.log('');
    console.log('  2. Initialize default data:');
    console.log('     node src/exprsn-svr/lowcode/scripts/init-git-setup.js');
    console.log('');

  } catch (error) {
    console.error('✗ Migration failed:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
};

// Run migrations
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('Migration script completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = runMigrations;
