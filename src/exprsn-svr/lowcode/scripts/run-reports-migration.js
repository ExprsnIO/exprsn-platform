/**
 * Run Reports System Migration
 * Standalone script to create reports, report_schedules, and report_executions tables
 */

const { sequelize } = require('../models');
const migration = require('../migrations/20251226120000-create-reports-system');

async function runMigration() {
  try {
    console.log('🚀 Running Reports System Migration...\n');

    // Get QueryInterface
    const queryInterface = sequelize.getQueryInterface();

    // Run the up migration
    await migration.up(queryInterface, sequelize.Sequelize);

    console.log('✅ Reports system tables created successfully!');
    console.log('   - reports');
    console.log('   - report_schedules');
    console.log('   - report_executions\n');

    // Verify tables exist
    const tables = await queryInterface.showAllTables();
    const reportTables = tables.filter(t =>
      t === 'reports' || t === 'report_schedules' || t === 'report_executions'
    );

    if (reportTables.length === 3) {
      console.log('✅ All report tables verified in database');
    } else {
      console.log('⚠️  Warning: Some tables may not have been created');
      console.log('   Found:', reportTables);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);

    // Check if error is because tables already exist
    if (error.message.includes('already exists')) {
      console.log('\n✅ Tables already exist - migration not needed');
      process.exit(0);
    } else {
      console.error('\nFull error:', error);
      process.exit(1);
    }
  }
}

// Run migration
runMigration();
