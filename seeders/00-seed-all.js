/**
 * ═══════════════════════════════════════════════════════════════════════
 * Master Seeder - Populates all Exprsn service databases with sample data
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Usage: node seeders/00-seed-all.js
 *
 * This script orchestrates seeding of all 18 Exprsn services in the correct
 * order to respect dependencies.
 */

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Color output for terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '═'.repeat(70));
  log(`  ${title}`, 'bright');
  console.log('═'.repeat(70) + '\n');
}

async function seedAll() {
  logSection('Exprsn Platform Sample Data Seeder');

  const startTime = Date.now();
  const results = {
    success: [],
    failed: [],
    skipped: []
  };

  // Seed services in dependency order
  const seeders = [
    { name: 'exprsn-ca', path: './01-seed-ca.js', critical: true },
    { name: 'exprsn-auth', path: './02-seed-auth.js', critical: false },
    { name: 'exprsn-vault', path: './03-seed-vault.js', critical: false },
    { name: 'exprsn-moderator', path: './04-seed-moderator.js', critical: false },
    { name: 'exprsn-svr', path: './05-seed-svr.js', critical: false },
    { name: 'exprsn-timeline', path: './06-seed-timeline.js', critical: false },
    { name: 'exprsn-spark', path: './07-seed-spark.js', critical: false },
    { name: 'exprsn-filevault', path: './08-seed-filevault.js', critical: false },
    { name: 'exprsn-gallery', path: './09-seed-gallery.js', critical: false },
    { name: 'exprsn-live', path: './10-seed-live.js', critical: false },
    { name: 'exprsn-nexus', path: './11-seed-nexus.js', critical: false },
    { name: 'exprsn-pulse', path: './12-seed-pulse.js', critical: false },
    { name: 'exprsn-herald', path: './13-seed-herald.js', critical: false },
    { name: 'exprsn-prefetch', path: './14-seed-prefetch.js', critical: false },
    { name: 'exprsn-setup', path: './15-seed-setup.js', critical: false },
    { name: 'exprsn-workflow', path: './16-seed-workflow.js', critical: false },
    { name: 'exprsn-forge', path: './17-seed-forge.js', critical: false }
  ];

  for (const seeder of seeders) {
    try {
      log(`\n📦 Seeding ${seeder.name}...`, 'blue');

      const seederModule = require(seeder.path);
      const result = await seederModule.seed();

      results.success.push({
        service: seeder.name,
        recordsCreated: result.recordsCreated || 0,
        duration: result.duration || 0
      });

      log(`✅ ${seeder.name} seeded successfully (${result.recordsCreated || 0} records)`, 'green');

    } catch (error) {
      if (seeder.critical) {
        log(`❌ CRITICAL: Failed to seed ${seeder.name}`, 'red');
        log(`Error: ${error.message}`, 'red');
        throw error; // Stop execution for critical services
      } else {
        log(`⚠️  Failed to seed ${seeder.name}: ${error.message}`, 'yellow');
        results.failed.push({ service: seeder.name, error: error.message });
      }
    }
  }

  // Summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  logSection('Seeding Summary');
  log(`Total Duration: ${duration}s`, 'bright');
  log(`\nSuccessful: ${results.success.length}`, 'green');

  if (results.success.length > 0) {
    results.success.forEach(r => {
      console.log(`  ✅ ${r.service}: ${r.recordsCreated} records`);
    });
  }

  if (results.failed.length > 0) {
    log(`\nFailed: ${results.failed.length}`, 'red');
    results.failed.forEach(r => {
      console.log(`  ❌ ${r.service}: ${r.error}`);
    });
  }

  if (results.skipped.length > 0) {
    log(`\nSkipped: ${results.skipped.length}`, 'yellow');
    results.skipped.forEach(s => {
      console.log(`  ⏭️  ${s}`);
    });
  }

  log('\n✨ Seeding complete!', 'bright');

  return results;
}

// Run if called directly
if (require.main === module) {
  seedAll()
    .then(() => process.exit(0))
    .catch((error) => {
      log(`\n💥 Fatal error: ${error.message}`, 'red');
      console.error(error);
      process.exit(1);
    });
}

module.exports = { seedAll };
