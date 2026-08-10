const path = require('path');
const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME || 'exprsn_payments',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: console.log
  }
);

async function runMigrations() {
  try {
    console.log('Running migrations...');

    // Read migration files
    const fs = require('fs');
    const migrationsPath = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(migrationsPath).sort();

    for (const file of files) {
      if (file.endsWith('.js')) {
        console.log(`Running migration: ${file}`);
        const migration = require(path.join(migrationsPath, file));
        await migration.up(sequelize.getQueryInterface(), Sequelize);
        console.log(`✓ ${file} completed`);
      }
    }

    console.log('\n✓ All migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
