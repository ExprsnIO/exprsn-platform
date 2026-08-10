#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Exprsn System Reset Script
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Provides various reset operations for the Exprsn ecosystem.
 *
 * Reset Options:
 * - full:    Drop all databases, regenerate secrets, fresh start
 * - data:    Keep schemas, delete all data (truncate tables)
 * - seeds:   Re-run default data seeding only
 * - secrets: Regenerate JWT keys and session secrets
 * - cache:   Clear Redis cache
 *
 * Usage:
 *   npm run reset              # Interactive mode
 *   npm run reset:full         # Full reset (drop databases, regenerate secrets)
 *   npm run reset:data         # Clear all data, keep schemas
 *   npm run reset:seeds        # Re-run default data seeding
 *   npm run reset:secrets      # Regenerate secrets only
 *   npm run reset:cache        # Clear Redis cache only
 *
 * Command line:
 *   node scripts/reset-system.js [--full|--data|--seeds|--secrets|--cache]
 *   node scripts/reset-system.js --environment=<env> --confirm
 *
 * Options:
 *   --full         Full reset (databases + secrets)
 *   --data         Clear data only (keep schemas)
 *   --seeds        Re-seed default data
 *   --secrets      Regenerate secrets
 *   --cache        Clear Redis cache
 *   --environment  Target environment (development/production)
 *   --confirm      Skip confirmation prompts
 *   --yes          Alias for --confirm
 *
 * ⚠️  WARNING: These operations are DESTRUCTIVE and cannot be undone!
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════

const PROJECT_ROOT = path.join(__dirname, '..');
const ENVIRONMENT = process.argv.find(arg => arg.startsWith('--environment='))?.split('=')[1] ||
                    process.env.NODE_ENV || 'development';

const RESET_FULL = process.argv.includes('--full');
const RESET_DATA = process.argv.includes('--data');
const RESET_SEEDS = process.argv.includes('--seeds');
const RESET_SECRETS = process.argv.includes('--secrets');
const RESET_CACHE = process.argv.includes('--cache');
const SKIP_CONFIRM = process.argv.includes('--confirm') || process.argv.includes('--yes');

// Services with databases
const SERVICES_WITH_DATABASES = [
  'ca', 'setup', 'auth', 'spark', 'timeline', 'prefetch',
  'moderator', 'filevault', 'gallery', 'live', 'bridge',
  'nexus', 'pulse', 'vault', 'herald', 'svr', 'workflow', 'forge'
];

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

// ═══════════════════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════════════════

function log(message, color = colors.green) {
  console.log(`${color}[INFO]${colors.reset} ${message}`);
}

function warn(message) {
  console.log(`${colors.yellow}[WARNING]${colors.reset} ${message}`);
}

function error(message) {
  console.log(`${colors.red}[ERROR]${colors.reset} ${message}`);
}

function success(message) {
  console.log(`${colors.green}[SUCCESS]${colors.reset} ${message}`);
}

function section(title) {
  console.log(`\n${colors.cyan}${'═'.repeat(75)}${colors.reset}`);
  console.log(`${colors.cyan}${title}${colors.reset}`);
  console.log(`${colors.cyan}${'═'.repeat(75)}${colors.reset}\n`);
}

/**
 * Ask user a yes/no question
 */
async function askQuestion(question, defaultAnswer = false) {
  if (SKIP_CONFIRM) {
    return true;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    const defaultText = defaultAnswer ? '[Y/n]' : '[y/N]';
    rl.question(`${colors.yellow}${question} ${defaultText}: ${colors.reset}`, (answer) => {
      rl.close();

      if (answer === '') {
        resolve(defaultAnswer);
      } else {
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      }
    });
  });
}

/**
 * Show interactive menu
 */
async function showMenu() {
  console.log(`\n${colors.cyan}╔═══════════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║                    Exprsn System Reset                                ║${colors.reset}`);
  console.log(`${colors.cyan}╚═══════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  console.log(`Environment: ${colors.bold}${ENVIRONMENT}${colors.reset}\n`);

  console.log('Select reset operation:\n');
  console.log(`  ${colors.cyan}1.${colors.reset} Full Reset       - Drop all databases, regenerate secrets`);
  console.log(`  ${colors.cyan}2.${colors.reset} Data Reset       - Clear all data, keep schemas`);
  console.log(`  ${colors.cyan}3.${colors.reset} Re-seed Data     - Re-run default data seeding`);
  console.log(`  ${colors.cyan}4.${colors.reset} Regenerate Keys  - Generate new JWT keys and secrets`);
  console.log(`  ${colors.cyan}5.${colors.reset} Clear Cache      - Clear Redis cache`);
  console.log(`  ${colors.cyan}6.${colors.reset} Exit\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${colors.yellow}Enter choice (1-6): ${colors.reset}`, (answer) => {
      rl.close();
      resolve(parseInt(answer));
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Reset Operations
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Drop all databases
 */
async function dropAllDatabases() {
  section('Dropping All Databases');

  const confirm = await askQuestion(
    `⚠️  This will DROP all ${SERVICES_WITH_DATABASES.length} databases. Continue?`,
    false
  );

  if (!confirm) {
    warn('Database drop cancelled');
    return false;
  }

  const pgHost = process.env.DB_HOST || 'localhost';
  const pgPort = parseInt(process.env.DB_PORT || '5432');
  const dbUser = process.env.DB_USER || 'postgres';
  const envSuffix = ENVIRONMENT === 'production' ? '' : '_dev';

  let dropped = 0;
  let failed = 0;

  for (const service of SERVICES_WITH_DATABASES) {
    const dbName = `exprsn_${service}${envSuffix}`;

    try {
      log(`Dropping database: ${dbName}`);
      await execAsync(`psql -h ${pgHost} -p ${pgPort} -U ${dbUser} -c "DROP DATABASE IF EXISTS ${dbName}"`);
      dropped++;
    } catch (err) {
      error(`Failed to drop ${dbName}: ${err.message}`);
      failed++;
    }
  }

  success(`Dropped ${dropped} databases${failed > 0 ? `, ${failed} failed` : ''}`);
  return true;
}

/**
 * Truncate all tables (clear data, keep schemas)
 */
async function truncateAllTables() {
  section('Clearing All Data');

  const confirm = await askQuestion(
    `⚠️  This will DELETE all data from ${SERVICES_WITH_DATABASES.length} databases. Continue?`,
    false
  );

  if (!confirm) {
    warn('Data clear cancelled');
    return false;
  }

  const pgHost = process.env.DB_HOST || 'localhost';
  const pgPort = parseInt(process.env.DB_PORT || '5432');
  const dbUser = process.env.DB_USER || 'postgres';
  const envSuffix = ENVIRONMENT === 'production' ? '' : '_dev';

  let cleared = 0;
  let failed = 0;

  for (const service of SERVICES_WITH_DATABASES) {
    const dbName = `exprsn_${service}${envSuffix}`;

    try {
      log(`Clearing data in: ${dbName}`);

      // Get all table names and truncate them
      const truncateSQL = `
        DO $$
        DECLARE
          r RECORD;
        BEGIN
          FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
            EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
          END LOOP;
        END $$;
      `;

      await execAsync(`psql -h ${pgHost} -p ${pgPort} -U ${dbUser} -d ${dbName} -c "${truncateSQL}"`);
      cleared++;
    } catch (err) {
      error(`Failed to clear ${dbName}: ${err.message}`);
      failed++;
    }
  }

  success(`Cleared data in ${cleared} databases${failed > 0 ? `, ${failed} failed` : ''}`);
  return true;
}

/**
 * Re-run default data seeding
 */
async function reseedData() {
  section('Re-seeding Default Data');

  const confirm = await askQuestion(
    'This will re-run default data seeding. Continue?',
    true
  );

  if (!confirm) {
    warn('Re-seeding cancelled');
    return false;
  }

  log('Running seed script...');

  try {
    const seedScript = path.join(PROJECT_ROOT, 'scripts', 'seed-defaults.js');
    await execAsync(`node ${seedScript} --environment=${ENVIRONMENT}`);
    success('Default data seeded successfully');
    return true;
  } catch (err) {
    error(`Seeding failed: ${err.message}`);
    return false;
  }
}

/**
 * Regenerate secrets (JWT keys, session secret)
 */
async function regenerateSecrets() {
  section('Regenerating Secrets');

  const confirm = await askQuestion(
    '⚠️  This will generate new JWT keys and session secrets. Existing tokens will be invalidated. Continue?',
    false
  );

  if (!confirm) {
    warn('Secret regeneration cancelled');
    return false;
  }

  try {
    const envPath = path.join(PROJECT_ROOT, '.env');
    let envContent = await fs.readFile(envPath, 'utf-8');

    // Generate session secret
    log('Generating session secret...');
    const sessionSecret = crypto.randomBytes(32).toString('hex');
    envContent = envContent.replace(
      /SESSION_SECRET=.*/,
      `SESSION_SECRET=${sessionSecret}`
    );

    // Generate JWT keys
    log('Generating JWT key pair...');
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    // Base64 encode for storage
    const jwtPrivateKey = Buffer.from(privateKey).toString('base64');
    const jwtPublicKey = Buffer.from(publicKey).toString('base64');

    envContent = envContent.replace(
      /JWT_PRIVATE_KEY=.*/,
      `JWT_PRIVATE_KEY=${jwtPrivateKey}`
    );
    envContent = envContent.replace(
      /JWT_PUBLIC_KEY=.*/,
      `JWT_PUBLIC_KEY=${jwtPublicKey}`
    );

    // Write updated .env
    await fs.writeFile(envPath, envContent);

    success('Secrets regenerated successfully');
    warn('All existing JWT tokens are now invalid. Users will need to re-authenticate.');
    return true;
  } catch (err) {
    error(`Failed to regenerate secrets: ${err.message}`);
    return false;
  }
}

/**
 * Clear Redis cache
 */
async function clearCache() {
  section('Clearing Redis Cache');

  const redisEnabled = process.env.REDIS_ENABLED !== 'false';

  if (!redisEnabled) {
    warn('Redis is disabled in configuration');
    return false;
  }

  const confirm = await askQuestion(
    'This will clear all Redis cache data. Continue?',
    true
  );

  if (!confirm) {
    warn('Cache clear cancelled');
    return false;
  }

  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379');

  try {
    log('Flushing Redis cache...');
    await execAsync(`redis-cli -h ${redisHost} -p ${redisPort} FLUSHALL`);
    success('Redis cache cleared successfully');
    return true;
  } catch (err) {
    error(`Failed to clear cache: ${err.message}`);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Reset Logic
// ═══════════════════════════════════════════════════════════════════════════

async function performFullReset() {
  section('Full System Reset');

  warn('This will:');
  console.log('  • Drop all databases');
  console.log('  • Regenerate JWT keys and session secrets');
  console.log('  • Clear Redis cache');
  console.log('  • Recreate databases');
  console.log('  • Run migrations');
  console.log('  • Seed default data\n');

  const confirm = await askQuestion(
    '⚠️  ⚠️  ⚠️  This is DESTRUCTIVE and cannot be undone. Type "RESET" to confirm',
    false
  );

  if (!confirm && !SKIP_CONFIRM) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise((resolve) => {
      rl.question(`${colors.red}Type "RESET" to confirm: ${colors.reset}`, (ans) => {
        rl.close();
        resolve(ans);
      });
    });

    if (answer !== 'RESET') {
      error('Full reset cancelled');
      return false;
    }
  }

  // Execute full reset sequence
  await dropAllDatabases();
  await regenerateSecrets();
  await clearCache();

  log('\nRunning system initialization...');

  try {
    const initScript = path.join(PROJECT_ROOT, 'scripts', 'init-system.js');
    await execAsync(`node ${initScript} --environment=${ENVIRONMENT}`);

    section('Full Reset Complete');
    success('System has been fully reset and re-initialized');
    console.log('\nNext steps:');
    console.log('  1. Review .env configuration');
    console.log('  2. npm start - Start all services');
    console.log('  3. Change default passwords\n');

    return true;
  } catch (err) {
    error(`Initialization failed: ${err.message}`);
    return false;
  }
}

/**
 * Main entry point
 */
async function main() {
  // Load environment variables
  try {
    const envPath = path.join(PROJECT_ROOT, '.env');
    const envContent = await fs.readFile(envPath, 'utf-8');

    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  } catch (err) {
    warn('.env file not found');
  }

  // Check if specific reset operation was requested
  if (RESET_FULL) {
    await performFullReset();
  } else if (RESET_DATA) {
    await truncateAllTables();
  } else if (RESET_SEEDS) {
    await reseedData();
  } else if (RESET_SECRETS) {
    await regenerateSecrets();
  } else if (RESET_CACHE) {
    await clearCache();
  } else {
    // Interactive mode
    const choice = await showMenu();

    switch (choice) {
      case 1:
        await performFullReset();
        break;
      case 2:
        await truncateAllTables();
        break;
      case 3:
        await reseedData();
        break;
      case 4:
        await regenerateSecrets();
        break;
      case 5:
        await clearCache();
        break;
      case 6:
        log('Exiting...');
        break;
      default:
        error('Invalid choice');
        break;
    }
  }
}

// Run main
main().catch(err => {
  console.error(`${colors.red}Reset failed with error:${colors.reset}`, err);
  process.exit(1);
});
