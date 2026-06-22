/**
 * Sync Database Models
 * Creates all tables from Sequelize models
 */

require('dotenv').config();
const { sequelize } = require('../src/config/database');
const models = require('../src/models');

async function syncModels() {
  console.log('🔧 Syncing database models...\n');

  try {
    // Test connection
    await sequelize.authenticate();
    console.log('✅ Database connection established\n');

    // Sync all models (creates tables)
    console.log('Creating tables from models...');
    await sequelize.sync({ force: false, alter: false });

    console.log('\n✅ All models synced successfully!\n');
    console.log('📋 Created tables:');
    Object.keys(models).forEach(modelName => {
      console.log(`   - ${models[modelName].tableName}`);
    });
    console.log('');

  } catch (error) {
    console.error('\n❌ Sync failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

syncModels();
