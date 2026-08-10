#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Exprsn System Initialization Script
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Comprehensive system initialization with:
 * - Auto-detection of system services (PostgreSQL, Redis, Sendmail, etc.)
 * - Database migration execution
 * - Default data seeding (users, roles, permissions, workflows)
 * - Service health verification
 * - Environment configuration generation
 *
 * Usage:
 *   node scripts/init-system.js [--environment=<env>] [--force] [--skip-seeds]
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════

const PROJECT_ROOT = path.join(__dirname, '..');
const ENVIRONMENT = process.argv.find(arg => arg.startsWith('--environment='))?.split('=')[1] || 'development';
const FORCE_INIT = process.argv.includes('--force');
const SKIP_SEEDS = process.argv.includes('--skip-seeds');

// Service detection configurations
const SERVICES_TO_DETECT = {
  postgresql: {
    name: 'PostgreSQL',
    commands: ['psql --version', 'postgres --version'],
    ports: [5432],
    required: true,
    dockerImage: 'postgres:15-alpine'
  },
  redis: {
    name: 'Redis',
    commands: ['redis-cli --version', 'redis-server --version'],
    ports: [6379],
    required: true,
    dockerImage: 'redis:7-alpine'
  },
  sendmail: {
    name: 'Sendmail/Postfix',
    commands: ['sendmail -V', 'postfix version'],
    ports: [25],
    required: false,
    dockerImage: null // Not typically dockerized
  },
  dovecot: {
    name: 'Dovecot IMAP',
    commands: ['dovecot --version'],
    ports: [143, 993],
    required: false,
    dockerImage: null
  },
  nginx: {
    name: 'Nginx',
    commands: ['nginx -v'],
    ports: [80, 443],
    required: false,
    dockerImage: 'nginx:alpine'
  }
};

// All Exprsn services that need databases
const EXPRSN_SERVICES = [
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
  cyan: '\x1b[36m'
};

// ═══════════════════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════════════════

function log(message, color = colors.green) {
  console.log(`${color}[INFO]${colors.reset} ${message}`);
}

function warn(message) {
  console.log(`${colors.yellow}[WARN]${colors.reset} ${message}`);
}

function error(message) {
  console.log(`${colors.red}[ERROR]${colors.reset} ${message}`);
}

function success(message) {
  console.log(`${colors.green}[SUCCESS]${colors.reset} ${message}`);
}

function section(title) {
  console.log('\n' + colors.cyan + '═'.repeat(75) + colors.reset);
  console.log(colors.cyan + `  ${title}` + colors.reset);
  console.log(colors.cyan + '═'.repeat(75) + colors.reset + '\n');
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if a command exists
 */
async function commandExists(command) {
  try {
    await execAsync(command);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Check if a port is open
 */
async function isPortOpen(host, port) {
  return new Promise((resolve) => {
    const net = require('net');
    const socket = new net.Socket();

    socket.setTimeout(2000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      resolve(false);
    });

    socket.connect(port, host);
  });
}

/**
 * Ask user a yes/no question
 */
async function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${colors.yellow}${question} (y/n): ${colors.reset}`, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// System Service Detection
// ═══════════════════════════════════════════════════════════════════════════

async function detectService(serviceKey, config) {
  log(`Detecting ${config.name}...`);

  const results = {
    name: config.name,
    installed: false,
    running: false,
    version: null,
    ports: []
  };

  // Check if command exists
  for (const cmd of config.commands) {
    try {
      const { stdout } = await execAsync(cmd);
      results.installed = true;
      results.version = stdout.trim().split('\n')[0];
      break;
    } catch (err) {
      // Command not found, try next
    }
  }

  // Check if ports are open
  for (const port of config.ports) {
    const isOpen = await isPortOpen('localhost', port);
    if (isOpen) {
      results.running = true;
      results.ports.push(port);
    }
  }

  return results;
}

async function detectAllServices() {
  section('System Service Detection');

  const detectionResults = {};

  for (const [key, config] of Object.entries(SERVICES_TO_DETECT)) {
    const result = await detectService(key, config);
    detectionResults[key] = result;

    const statusIcon = result.running ? '✓' : (result.installed ? '○' : '✗');
    const statusText = result.running ? 'RUNNING' : (result.installed ? 'INSTALLED' : 'NOT FOUND');

    console.log(`[${statusText}] ${statusIcon} ${result.name}`);
    if (result.version) {
      console.log(`         Version: ${result.version}`);
    }
    if (result.ports.length > 0) {
      console.log(`         Ports: ${result.ports.join(', ')}`);
    }
  }

  return detectionResults;
}

// ═══════════════════════════════════════════════════════════════════════════
// PostgreSQL Setup
// ═══════════════════════════════════════════════════════════════════════════

async function verifyPostgreSQL(detection) {
  section('PostgreSQL Verification');

  if (!detection.postgresql.running) {
    error('PostgreSQL is not running!');

    if (detection.postgresql.installed) {
      warn('PostgreSQL is installed but not running.');
      const shouldStart = await askQuestion('Would you like to start PostgreSQL?');

      if (shouldStart) {
        log('Starting PostgreSQL...');
        try {
          // Try common start commands
          await execAsync('brew services start postgresql@15 || sudo systemctl start postgresql');
          await sleep(3000);
          success('PostgreSQL started successfully');
        } catch (err) {
          error('Failed to start PostgreSQL automatically');
          error('Please start PostgreSQL manually and run this script again');
          process.exit(1);
        }
      } else {
        error('PostgreSQL is required. Please start it and run this script again.');
        process.exit(1);
      }
    } else {
      error('PostgreSQL is not installed');
      error('Please install PostgreSQL and run this script again');
      error('  macOS: brew install postgresql@15');
      error('  Ubuntu/Debian: sudo apt-get install postgresql-15');
      error('  Docker: docker run -d -p 5432:5432 postgres:15-alpine');
      process.exit(1);
    }
  }

  success('PostgreSQL is running');
}

async function createDatabases() {
  section('Database Creation');

  log('Creating databases for all Exprsn services...');

  try {
    const scriptPath = path.join(PROJECT_ROOT, 'scripts', 'create-databases.sh');
    await execAsync(`bash "${scriptPath}" --environment=${ENVIRONMENT}`);
    success('All databases created successfully');
  } catch (err) {
    error('Failed to create databases:');
    console.error(err.message);
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Database Migrations
// ═══════════════════════════════════════════════════════════════════════════

async function runMigrations() {
  section('Database Migrations');

  log('Running migrations for all services...');

  const servicesWithMigrations = ['ca', 'auth', 'spark', 'timeline', 'nexus', 'moderator',
                                   'filevault', 'gallery', 'herald', 'workflow'];

  for (const service of servicesWithMigrations) {
    const migrationScript = path.join(PROJECT_ROOT, 'src', `exprsn-${service}`, 'scripts', 'migrate.js');
    const sqlMigration = path.join(PROJECT_ROOT, 'src', `exprsn-${service}`, 'database', 'schema.sql');

    try {
      // Try JavaScript migration script first
      if (await fileExists(migrationScript)) {
        log(`Running ${service} migrations...`);
        await execAsync(`node "${migrationScript}"`);
        success(`${service} migrations complete`);
      }
      // Fall back to SQL file
      else if (await fileExists(sqlMigration)) {
        log(`Applying ${service} schema...`);
        const dbName = `exprsn_${service}${ENVIRONMENT === 'development' ? '_dev' : ''}`;
        await execAsync(`psql -d ${dbName} -f "${sqlMigration}"`);
        success(`${service} schema applied`);
      } else {
        warn(`No migrations found for ${service}`);
      }
    } catch (err) {
      warn(`Migration failed for ${service}: ${err.message}`);
      // Continue with other services
    }
  }

  success('All migrations executed');
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Default Data Seeding
// ═══════════════════════════════════════════════════════════════════════════

async function seedDefaultData() {
  if (SKIP_SEEDS) {
    warn('Skipping data seeding (--skip-seeds flag)');
    return;
  }

  section('Default Data Seeding');

  log('Seeding default data...');

  const seedScript = path.join(PROJECT_ROOT, 'scripts', 'seed-defaults.js');

  if (await fileExists(seedScript)) {
    try {
      await execAsync(`node "${seedScript}" --environment=${ENVIRONMENT}`);
      success('Default data seeded successfully');
    } catch (err) {
      warn(`Seeding failed: ${err.message}`);
    }
  } else {
    warn('Seed script not found - will create minimal defaults');
    await createMinimalDefaults();
  }
}

async function createMinimalDefaults() {
  log('Creating minimal default data...');

  // Load dotenv
  require('dotenv').config({ path: path.join(PROJECT_ROOT, '.env') });

  const { Client } = require('pg');
  const bcrypt = require('bcryptjs');

  const client = new Client({
    host: process.env.CA_DB_HOST || 'localhost',
    port: process.env.CA_DB_PORT || 5432,
    database: process.env.CA_DB_NAME || 'exprsn_ca_dev',
    user: process.env.CA_DB_USER || 'postgres',
    password: process.env.CA_DB_PASSWORD
  });

  try {
    await client.connect();

    // Create default admin user
    const adminPassword = await bcrypt.hash('admin123', 10);
    await client.query(`
      INSERT INTO users (id, email, username, password, email_verified, created_at, updated_at)
      VALUES (
        gen_random_uuid(),
        'admin@exprsn.local',
        'admin',
        $1,
        true,
        NOW(),
        NOW()
      )
      ON CONFLICT (email) DO NOTHING
    `, [adminPassword]);

    success('Default admin user created (admin@exprsn.local / admin123)');

    await client.end();
  } catch (err) {
    warn(`Could not create defaults: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Environment Configuration
// ═══════════════════════════════════════════════════════════════════════════

async function generateEnvironmentConfig(detection) {
  section('Environment Configuration');

  const envPath = path.join(PROJECT_ROOT, '.env');
  const envExamplePath = path.join(PROJECT_ROOT, '.env.example');

  // Check if .env already exists
  if (await fileExists(envPath) && !FORCE_INIT) {
    log('.env file already exists');
    const shouldOverwrite = await askQuestion('Would you like to regenerate .env file?');
    if (!shouldOverwrite) {
      log('Keeping existing .env file');
      return;
    }
  }

  log('Generating .env file...');

  // Read .env.example
  let envContent = '';
  if (await fileExists(envExamplePath)) {
    envContent = await fs.readFile(envExamplePath, 'utf8');
  } else {
    // Create minimal .env
    envContent = generateMinimalEnv(detection);
  }

  // Write .env
  await fs.writeFile(envPath, envContent);
  success('.env file created');

  // Generate cryptographic keys
  log('Generating cryptographic keys...');
  const setupScript = path.join(PROJECT_ROOT, 'src', 'exprsn-ca', 'scripts', 'setup.js');
  if (await fileExists(setupScript)) {
    await execAsync(`node "${setupScript}" --non-interactive`);
    success('Cryptographic keys generated');
  }
}

function generateMinimalEnv(detection) {
  return `# Exprsn Environment Configuration
# Generated: ${new Date().toISOString()}
# Environment: ${ENVIRONMENT}

NODE_ENV=${ENVIRONMENT}

# Database (PostgreSQL)
DB_HOST=${detection.postgresql.running ? 'localhost' : '127.0.0.1'}
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=

# Redis
REDIS_ENABLED=${detection.redis.running ? 'true' : 'false'}
REDIS_HOST=${detection.redis.running ? 'localhost' : '127.0.0.1'}
REDIS_PORT=6379
REDIS_PASSWORD=

# Service URLs
CA_URL=http://localhost:3000
AUTH_URL=http://localhost:3001
SPARK_URL=http://localhost:3002
TIMELINE_URL=http://localhost:3004

# Email (if available)
EMAIL_PROVIDER=smtp
SMTP_HOST=localhost
SMTP_PORT=25
EMAIL_FROM=noreply@exprsn.local

# Security (will be generated)
SESSION_SECRET=
JWT_PRIVATE_KEY=
JWT_PUBLIC_KEY=

# Auto-start services (production-ready services)
AUTO_START_SERVICES=ca,setup,auth,timeline,prefetch,bridge,nexus,pulse,vault
`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Service Health Checks
// ═══════════════════════════════════════════════════════════════════════════

async function verifySystemHealth() {
  section('System Health Verification');

  const checks = [];

  // PostgreSQL connection
  log('Checking PostgreSQL connection...');
  try {
    await execAsync('psql -c "SELECT 1" postgres');
    checks.push({ name: 'PostgreSQL', status: 'OK' });
  } catch (err) {
    checks.push({ name: 'PostgreSQL', status: 'FAIL', error: err.message });
  }

  // Redis connection (if available)
  log('Checking Redis connection...');
  try {
    await execAsync('redis-cli ping');
    checks.push({ name: 'Redis', status: 'OK' });
  } catch (err) {
    checks.push({ name: 'Redis', status: 'SKIP', error: 'Not available' });
  }

  // Database existence
  log('Checking database existence...');
  let dbCount = 0;
  for (const service of EXPRSN_SERVICES) {
    try {
      const dbName = `exprsn_${service}${ENVIRONMENT === 'development' ? '_dev' : ''}`;
      await execAsync(`psql -lqt | cut -d \\| -f 1 | grep -qw ${dbName}`);
      dbCount++;
    } catch (err) {
      // Database doesn't exist
    }
  }
  checks.push({ name: 'Databases', status: 'INFO', info: `${dbCount}/${EXPRSN_SERVICES.length} created` });

  // Display results
  console.log('\nHealth Check Results:');
  for (const check of checks) {
    const statusColor = check.status === 'OK' ? colors.green :
                        check.status === 'FAIL' ? colors.red : colors.yellow;
    console.log(`  ${statusColor}[${check.status}]${colors.reset} ${check.name}`);
    if (check.info) console.log(`         ${check.info}`);
    if (check.error) console.log(`         ${check.error}`);
  }

  const failures = checks.filter(c => c.status === 'FAIL');
  if (failures.length > 0) {
    warn(`${failures.length} health check(s) failed`);
  } else {
    success('All health checks passed');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Execution
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log(colors.cyan + '╔' + '═'.repeat(75) + '╗' + colors.reset);
  console.log(colors.cyan + '║' + ' '.repeat(20) + 'Exprsn System Initialization' + ' '.repeat(27) + '║' + colors.reset);
  console.log(colors.cyan + '╚' + '═'.repeat(75) + '╝' + colors.reset);
  console.log('');
  log(`Environment: ${ENVIRONMENT}`);
  log(`Force init: ${FORCE_INIT}`);
  log(`Skip seeds: ${SKIP_SEEDS}`);
  console.log('');

  try {
    // Step 1: Detect system services
    const detection = await detectAllServices();

    // Step 2: Verify PostgreSQL
    await verifyPostgreSQL(detection);

    // Step 3: Generate environment configuration
    await generateEnvironmentConfig(detection);

    // Step 4: Create databases
    await createDatabases();

    // Step 5: Run migrations
    await runMigrations();

    // Step 6: Seed default data
    await seedDefaultData();

    // Step 7: Verify system health
    await verifySystemHealth();

    // Success!
    console.log('\n' + colors.green + '╔' + '═'.repeat(75) + '╗' + colors.reset);
    console.log(colors.green + '║' + ' '.repeat(24) + 'Initialization Complete!' + ' '.repeat(27) + '║' + colors.reset);
    console.log(colors.green + '╚' + '═'.repeat(75) + '╝' + colors.reset);
    console.log('');
    success('Exprsn system is ready!');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Review .env file and update as needed');
    console.log('  2. Start services: npm start');
    console.log('  3. Access CA web interface: http://localhost:3000');
    console.log('  4. Default admin: admin@exprsn.local / admin123');
    console.log('');

  } catch (err) {
    console.log('');
    error('Initialization failed:');
    console.error(err);
    console.log('');
    error('Please fix the issues above and run this script again');
    process.exit(1);
  }
}

// Run main function
if (require.main === module) {
  main();
}

module.exports = { main };
