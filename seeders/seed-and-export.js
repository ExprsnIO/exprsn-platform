/**
 * ═══════════════════════════════════════════════════════════════════════
 * Master Script - Seed All Databases and Export to Excel
 * ═══════════════════════════════════════════════════════════════════════
 *
 * This script:
 * 1. Seeds all service databases with sample data
 * 2. Exports all data to Excel workbooks
 *
 * Usage: node seeders/seed-and-export.js
 */

const { seedAll } = require('./00-seed-all');
const { exportAll } = require('./export-to-excel');

// Color output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '═'.repeat(70));
  log(`  ${title}`, 'bright');
  console.log('═'.repeat(70));
}

async function main() {
  const startTime = Date.now();

  logSection('Exprsn Platform - Seed Data & Export to Excel');
  log('\nThis will populate all service databases with sample data', 'cyan');
  log('and export everything to Excel format.\n', 'cyan');

  try {
    // Step 1: Seed databases
    logSection('STEP 1: Seeding Databases');
    log('This may take a few minutes...\n', 'yellow');

    const seedResults = await seedAll();

    // Step 2: Export to Excel
    logSection('STEP 2: Exporting to Excel');
    log('Extracting data from all databases...\n', 'yellow');

    const exportResults = await exportAll();

    // Final summary
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);

    logSection('FINAL SUMMARY');

    log('\n📊 Seeding Results:', 'bright');
    log(`   ✅ Successful: ${seedResults.success.length} services`, 'green');
    log(`   ❌ Failed: ${seedResults.failed.length} services`, seedResults.failed.length > 0 ? 'red' : 'green');

    log('\n📁 Export Results:', 'bright');
    log(`   ✅ Exported: ${exportResults.success.length} services`, 'green');
    log(`   ❌ Failed: ${exportResults.failed.length} services`, exportResults.failed.length > 0 ? 'red' : 'green');
    log(`   ⏭️  Skipped: ${exportResults.skipped.length} services`, 'yellow');

    if (exportResults.success.length > 0) {
      log('\n📂 Excel Files Generated:', 'bright');
      exportResults.success.forEach(r => {
        console.log(`   ${r.service}.xlsx (${r.tables} tables, ${r.rows} rows)`);
      });
    }

    log(`\n⏱️  Total Time: ${totalDuration}s`, 'bright');
    log('\n✨ All done!', 'green');

  } catch (error) {
    log(`\n💥 Fatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Run
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
