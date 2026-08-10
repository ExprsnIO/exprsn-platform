/**
 * Sync Report Models to Database
 * Uses Sequelize sync to create report tables
 */

const { sequelize, Report, ReportSchedule, ReportExecution } = require('../models');

async function syncReportModels() {
  try {
    console.log('🚀 Syncing Report Models to Database...\n');

    // Sync Report model
    console.log('Creating reports table...');
    await Report.sync({ force: false });
    console.log('✅ reports table created');

    // Sync ReportSchedule model
    console.log('Creating report_schedules table...');
    await ReportSchedule.sync({ force: false });
    console.log('✅ report_schedules table created');

    // Sync ReportExecution model
    console.log('Creating report_executions table...');
    await ReportExecution.sync({ force: false });
    console.log('✅ report_executions table created');

    console.log('\n✅ All report tables synced successfully!');

    // Verify by querying the models
    const reportCount = await Report.count();
    const scheduleCount = await ReportSchedule.count();
    const executionCount = await ReportExecution.count();

    console.log('\nTable Statistics:');
    console.log(`  Reports: ${reportCount}`);
    console.log(`  Schedules: ${scheduleCount}`);
    console.log(`  Executions: ${executionCount}`);

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Sync failed:', error.message);

    if (error.message.includes('already exists')) {
      console.log('\n✅ Tables already exist - sync not needed');
      await sequelize.close();
      process.exit(0);
    } else {
      console.error('\nFull error:', error);
      await sequelize.close();
      process.exit(1);
    }
  }
}

// Run sync
syncReportModels();
