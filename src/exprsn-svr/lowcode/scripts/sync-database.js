/**
 * Database Sync Script
 *
 * Creates all lowcode platform database tables.
 * Run this once to initialize the lowcode database schema.
 */

const { sequelize } = require('../models');

async function syncDatabase() {
  try {
    console.log('[Sync] Connecting to database...');
    await sequelize.authenticate();
    console.log('[Sync] Database connection established');

    console.log('[Sync] Syncing all models...');
    console.log('[Sync] This will create all lowcode platform tables');

    // Sync all models (creates tables if they don't exist)
    // Use { force: true } to drop existing tables (careful in production!)
    // Use { alter: true } to modify existing tables to match models
    await sequelize.sync({ alter: true });

    console.log('[Sync] ✅ All tables created successfully!');
    console.log('[Sync] The following tables are now available:');

    const models = Object.keys(sequelize.models);
    models.forEach(model => {
      console.log(`  - ${sequelize.models[model].tableName}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('[Sync] ❌ Database sync failed:', error);
    process.exit(1);
  }
}

// Run sync
console.log('='.repeat(60));
console.log('Exprsn Low-Code Platform - Database Sync');
console.log('='.repeat(60));
syncDatabase();
