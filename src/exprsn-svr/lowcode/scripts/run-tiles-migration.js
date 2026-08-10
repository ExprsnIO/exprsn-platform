/**
 * Run Tiles Migration
 *
 * Manually runs the tiles system migration.
 */

const { sequelize } = require('../models');
const { QueryInterface } = require('sequelize');

const migration = require('../migrations/20251226170000-create-tiles-system');

async function runMigration() {
  try {
    console.log('🔧 Running tiles migration...');

    const queryInterface = sequelize.getQueryInterface();

    await migration.up(queryInterface, sequelize.Sequelize);

    console.log('✅ Tiles migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error running migration:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

runMigration();
