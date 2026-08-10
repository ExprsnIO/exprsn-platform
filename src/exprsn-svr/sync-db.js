const { sequelize } = require('./config/database');
const models = require('./models');

async function syncDatabase() {
  try {
    console.log('Syncing database models...');
    console.log('Models loaded:', Object.keys(models));

    // Sync all models (creates tables if they don't exist)
    await sequelize.sync({ alter: false });

    console.log('Database synced successfully!');
    console.log('Tables created/verified:');

    // List all tables
    const tables = await sequelize.getQueryInterface().showAllTables();
    tables.forEach(table => console.log(`  - ${table}`));

    process.exit(0);
  } catch (error) {
    console.error('Failed to sync database:', error);
    console.error('Error details:', error.message);
    process.exit(1);
  }
}

syncDatabase();
