/**
 * Database Migration Script
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'exprsn',
  user: process.env.DB_USER || 'exprsn',
  password: process.env.DB_PASSWORD || 'password',
});

const MIGRATIONS_DIR = path.join(__dirname, '../src/database/migrations');

/**
 * Get all migration files
 */
function getMigrationFiles() {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith('.sql')).sort();

  return files;
}

/**
 * Run migrations
 */
async function runMigrations() {
  const client = await pool.connect();

  try {
    // Create migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Checking for pending migrations...\n');

    const migrationFiles = getMigrationFiles();

    for (const file of migrationFiles) {
      // Check if migration has been applied
      const result = await client.query('SELECT * FROM schema_migrations WHERE filename = $1', [file]);

      if (result.rows.length === 0) {
        console.log(`Running migration: ${file}`);

        // Read and execute migration
        const migrationPath = path.join(MIGRATIONS_DIR, file);
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

        await client.query('BEGIN');

        try {
          await client.query(migrationSQL);
          await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
          await client.query('COMMIT');

          console.log(`✓ Migration ${file} applied successfully\n`);
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      } else {
        console.log(`⊘ Migration ${file} already applied`);
      }
    }

    console.log('\nAll migrations completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Rollback last migration
 */
async function rollbackMigration() {
  const client = await pool.connect();

  try {
    // Get last applied migration
    const result = await client.query(
      'SELECT * FROM schema_migrations ORDER BY applied_at DESC LIMIT 1'
    );

    if (result.rows.length === 0) {
      console.log('No migrations to rollback');
      return;
    }

    const lastMigration = result.rows[0];
    console.log(`Rolling back migration: ${lastMigration.filename}`);

    // Delete record
    await client.query('DELETE FROM schema_migrations WHERE filename = $1', [lastMigration.filename]);

    console.log('✓ Migration rolled back successfully');
    console.log('Note: Rollback only removes the migration record.');
    console.log('You may need to manually undo schema changes.');
  } catch (error) {
    console.error('Rollback failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Main execution
const args = process.argv.slice(2);
const isRollback = args.includes('--rollback');

if (isRollback) {
  rollbackMigration().catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else {
  runMigrations().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
