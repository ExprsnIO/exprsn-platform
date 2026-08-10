/**
 * Force Sequelize to sync all lowcode models with the database
 * This refreshes Sequelize's internal schema cache
 */

const path = require('path');
const modelsPath = path.join(__dirname, '../models');
const db = require(modelsPath);

(async () => {
  try {
    console.log('🔄 Syncing all lowcode models with database...\n');

    const modelNames = [
      'Application',
      'Entity',
      'AppForm',
      'Grid',
      'DataSource',
      'Card',
      'Poll',
      'Process',
      'DecisionTable',
      'GlobalVariable',
      'Tile',
      'ApplicationTile'
    ];

    for (const modelName of modelNames) {
      if (db[modelName]) {
        try {
          await db[modelName].sync({ alter: false });
          console.log(`✅ ${modelName} synced`);
        } catch (error) {
          console.log(`⚠️  ${modelName} sync skipped: ${error.message}`);
        }
      }
    }

    console.log('\n✅ Model sync complete! Server should now see all tables.');
    await db.sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  }
})();
