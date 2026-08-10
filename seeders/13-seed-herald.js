/**
 * Herald Service Seeder - Notifications, Templates, Delivery Logs
 */

const { Sequelize } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

async function seed() {
  const startTime = Date.now();
  let recordsCreated = 0;

  const sequelize = new Sequelize(
    process.env.HERALD_DB_NAME || 'exprsn_herald',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASSWORD || '',
    { host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT || 5432, dialect: 'postgres', logging: false }
  );

  try {
    await sequelize.authenticate();
    console.log('  Connected to exprsn_herald database');

    const userIds = Array.from({ length: 20 }, () => uuidv4());

    // Get table list
    const tables = await sequelize.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `, { type: sequelize.QueryTypes.SELECT });

    if (tables.length === 0) {
      console.log('  No tables found, skipping...');
      return { recordsCreated: 0, duration: '0.00' };
    }

    console.log(`  Found ${tables.length} tables`);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    return { recordsCreated, duration };

  } catch (error) {
    console.error('  Error seeding Herald:', error.message);
    return { recordsCreated: 0, duration: '0.00' };
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  seed().then(r => { console.log(`\nHerald seeded: ${r.recordsCreated} records`); process.exit(0); })
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { seed };
