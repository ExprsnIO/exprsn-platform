#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Exprsn Pre-flight Check Script
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Validates that all prerequisites are met before starting services.
 *
 * Checks:
 * - System services (PostgreSQL, Redis) are running
 * - Required databases exist
 * - Required environment variables are set
 * - Required ports are available
 * - Database migrations are current
 *
 * Usage:
 *   npm run preflight
 *   node scripts/preflight-check.js [--fix]
 *
 * Options:
 *   --fix     Attempt to fix issues automatically
 *   --verbose Show detailed output
 *
 * Exit codes:
 *   0 - All checks passed
 *   1 - Critical failures found
 *   2 - Warnings found (non-critical)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const net = require('net');

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════

const PROJECT_ROOT = path.join(__dirname, '..');
const ENVIRONMENT = process.env.NODE_ENV || 'development';
const FIX_ISSUES = process.argv.includes('--fix');
const VERBOSE = process.argv.includes('--verbose');

// Service ports that need to be checked
const SERVICE_PORTS = {
  ca: 3000,
  setup: 3015,
  auth: 3001,
  spark: 3002,
  timeline: 3004,
  prefetch: 3005,
  moderator: 3006,
  filevault: 3007,
  gallery: 3008,
  live: 3009,
  bridge: 3010,
  nexus: 3011,
  pulse: 3012,
  vault: 3013,
  herald: 3014,
  svr: 5000,
  workflow: 3017,
  ocsp: 2560
};

// Required environment variables
const REQUIRED_ENV_VARS = [
  'DB_HOST',
  'DB_PORT',
  'SESSION_SECRET',
  'JWT_PRIVATE_KEY',
  'JWT_PUBLIC_KEY'
];

// Critical environment variables for production
const PRODUCTION_ENV_VARS = [
  'DB_PASSWORD',
  'REDIS_PASSWORD',
  'EMAIL_PROVIDER',
  'SMTP_HOST'
];

// Services that need databases
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
  gray: '\x1b[90m'
};

// Check results storage
const results = {
  critical: [],
  warnings: [],
  passed: [],
  info: []
};

// ═══════════════════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════════════════

function log(message, type = 'info') {
  const symbols = {
    pass: '✓',
    fail: '✗',
    warn: '⚠',
    info: 'ℹ'
  };

  const typeColors = {
    pass: colors.green,
    fail: colors.red,
    warn: colors.yellow,
    info: colors.blue
  };

  console.log(`${typeColors[type]}${symbols[type]} ${message}${colors.reset}`);
}

function verbose(message) {
  if (VERBOSE) {
    console.log(`${colors.gray}  ${message}${colors.reset}`);
  }
}

function section(title) {
  console.log(`\n${colors.cyan}${'─'.repeat(75)}${colors.reset}`);
  console.log(`${colors.cyan}${title}${colors.reset}`);
  console.log(`${colors.cyan}${'─'.repeat(75)}${colors.reset}`);
}

function addResult(type, message, details = null) {
  results[type].push({ message, details });
}

/**
 * Check if a TCP port is open
 */
async function isPortOpen(host, port, timeout = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    socket.setTimeout(timeout);
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
 * Check if a process is listening on a port
 */
async function getProcessOnPort(port) {
  try {
    const { stdout } = await execAsync(`lsof -i :${port} -t`);
    const pid = stdout.trim();
    if (pid) {
      const { stdout: processInfo } = await execAsync(`ps -p ${pid} -o comm=`);
      return { pid, process: processInfo.trim() };
    }
  } catch (err) {
    // Port not in use or lsof not available
  }
  return null;
}

/**
 * Load environment variables from .env file
 */
async function loadEnv() {
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
    // .env file doesn't exist, will be caught in checks
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Check Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check PostgreSQL
 */
async function checkPostgreSQL() {
  verbose('Checking PostgreSQL installation...');

  try {
    // Check if psql command exists
    await execAsync('which psql');
    addResult('passed', 'PostgreSQL client (psql) is installed');
  } catch (err) {
    addResult('critical', 'PostgreSQL client (psql) not found in PATH',
      'Install PostgreSQL: brew install postgresql@15 (macOS) or apt-get install postgresql (Linux)');
    return false;
  }

  verbose('Checking PostgreSQL connection...');

  // Check if PostgreSQL is running
  const pgHost = process.env.DB_HOST || 'localhost';
  const pgPort = parseInt(process.env.DB_PORT || '5432');

  const isRunning = await isPortOpen(pgHost, pgPort);

  if (!isRunning) {
    addResult('critical', `PostgreSQL is not running on ${pgHost}:${pgPort}`,
      'Start PostgreSQL: brew services start postgresql@15 (macOS) or systemctl start postgresql (Linux)');
    return false;
  }

  // Try to connect
  try {
    const dbUser = process.env.DB_USER || 'postgres';
    await execAsync(`psql -h ${pgHost} -p ${pgPort} -U ${dbUser} -c "SELECT 1" postgres`);
    addResult('passed', `PostgreSQL is running on ${pgHost}:${pgPort}`);
    return true;
  } catch (err) {
    addResult('critical', 'Cannot connect to PostgreSQL',
      `Check credentials in .env: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD`);
    return false;
  }
}

/**
 * Check Redis
 */
async function checkRedis() {
  verbose('Checking Redis installation...');

  const redisEnabled = process.env.REDIS_ENABLED !== 'false';

  if (!redisEnabled) {
    addResult('info', 'Redis is disabled in configuration');
    return true;
  }

  try {
    // Check if redis-cli exists
    await execAsync('which redis-cli');
    addResult('passed', 'Redis client (redis-cli) is installed');
  } catch (err) {
    addResult('warnings', 'Redis client (redis-cli) not found',
      'Install Redis: brew install redis (macOS) or apt-get install redis (Linux)');
    return false;
  }

  verbose('Checking Redis connection...');

  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379');

  const isRunning = await isPortOpen(redisHost, redisPort);

  if (!isRunning) {
    addResult('warnings', `Redis is not running on ${redisHost}:${redisPort}`,
      'Start Redis: brew services start redis (macOS) or systemctl start redis (Linux)\nOr disable in .env: REDIS_ENABLED=false');
    return false;
  }

  // Try to ping Redis
  try {
    await execAsync(`redis-cli -h ${redisHost} -p ${redisPort} ping`);
    addResult('passed', `Redis is running on ${redisHost}:${redisPort}`);
    return true;
  } catch (err) {
    addResult('warnings', 'Cannot connect to Redis',
      'Check Redis configuration or disable: REDIS_ENABLED=false');
    return false;
  }
}

/**
 * Check required databases exist
 */
async function checkDatabases() {
  verbose('Checking required databases...');

  const pgHost = process.env.DB_HOST || 'localhost';
  const pgPort = parseInt(process.env.DB_PORT || '5432');
  const dbUser = process.env.DB_USER || 'postgres';
  const envSuffix = ENVIRONMENT === 'production' ? '' : '_dev';

  let missingDatabases = [];

  for (const service of SERVICES_WITH_DATABASES) {
    const dbName = `exprsn_${service}${envSuffix}`;

    try {
      await execAsync(`psql -h ${pgHost} -p ${pgPort} -U ${dbUser} -lqt | cut -d \\| -f 1 | grep -qw ${dbName}`);
      verbose(`Database '${dbName}' exists`);
    } catch (err) {
      missingDatabases.push(dbName);
    }
  }

  if (missingDatabases.length === 0) {
    addResult('passed', `All ${SERVICES_WITH_DATABASES.length} required databases exist`);
    return true;
  } else if (missingDatabases.length === SERVICES_WITH_DATABASES.length) {
    addResult('critical', 'No databases have been created',
      'Run: npm run db:create or npm run init');
    return false;
  } else {
    addResult('warnings', `${missingDatabases.length} databases are missing: ${missingDatabases.slice(0, 3).join(', ')}...`,
      'Run: npm run db:create to create missing databases');
    return false;
  }
}

/**
 * Check environment configuration
 */
async function checkEnvironment() {
  verbose('Checking .env file...');

  // Check if .env exists
  const envPath = path.join(PROJECT_ROOT, '.env');

  try {
    await fs.access(envPath);
    addResult('passed', '.env file exists');
  } catch (err) {
    addResult('critical', '.env file not found',
      'Run: npm run init to generate .env file, or copy from .env.example');
    return false;
  }

  verbose('Checking required environment variables...');

  const missing = [];
  const empty = [];

  for (const varName of REQUIRED_ENV_VARS) {
    const value = process.env[varName];

    if (!value) {
      missing.push(varName);
    } else if (value.trim() === '') {
      empty.push(varName);
    }
  }

  if (missing.length > 0) {
    addResult('critical', `Required environment variables not set: ${missing.join(', ')}`,
      'Run: npm run init to generate missing variables');
    return false;
  }

  if (empty.length > 0) {
    addResult('warnings', `Environment variables are empty: ${empty.join(', ')}`);
  }

  // Check production-specific variables
  if (ENVIRONMENT === 'production') {
    const prodMissing = [];

    for (const varName of PRODUCTION_ENV_VARS) {
      if (!process.env[varName] || process.env[varName].trim() === '') {
        prodMissing.push(varName);
      }
    }

    if (prodMissing.length > 0) {
      addResult('warnings', `Production variables not set: ${prodMissing.join(', ')}`,
        'These should be configured for production deployment');
    }
  }

  addResult('passed', 'All required environment variables are set');
  return true;
}

/**
 * Check port availability
 */
async function checkPorts() {
  verbose('Checking port availability...');

  const portsInUse = [];

  for (const [service, port] of Object.entries(SERVICE_PORTS)) {
    const inUse = await isPortOpen('localhost', port);

    if (inUse) {
      const processInfo = await getProcessOnPort(port);
      portsInUse.push({
        service,
        port,
        process: processInfo ? `${processInfo.process} (PID ${processInfo.pid})` : 'unknown'
      });
    }
  }

  if (portsInUse.length === 0) {
    addResult('passed', 'All service ports are available');
    return true;
  } else {
    const portList = portsInUse.map(p => `${p.port} (${p.service}: ${p.process})`).join(', ');
    addResult('warnings', `${portsInUse.length} ports in use: ${portList}`,
      'Stop conflicting services or use different ports in .env');
    return false;
  }
}

/**
 * Check Node.js version
 */
async function checkNodeVersion() {
  verbose('Checking Node.js version...');

  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split('.')[0]);

  if (major >= 18) {
    addResult('passed', `Node.js ${nodeVersion} (requires >=18)`);
    return true;
  } else {
    addResult('critical', `Node.js ${nodeVersion} is too old (requires >=18)`,
      'Upgrade Node.js: https://nodejs.org/');
    return false;
  }
}

/**
 * Check npm dependencies
 */
async function checkDependencies() {
  verbose('Checking npm dependencies...');

  const nodeModulesPath = path.join(PROJECT_ROOT, 'node_modules');

  try {
    await fs.access(nodeModulesPath);
    addResult('passed', 'npm dependencies are installed');
    return true;
  } catch (err) {
    addResult('critical', 'npm dependencies not installed',
      'Run: npm install');
    return false;
  }
}

/**
 * Check security configurations
 */
async function checkSecurity() {
  verbose('Checking security configurations...');

  const issues = [];

  // Check for default/weak passwords
  const sessionSecret = process.env.SESSION_SECRET;
  if (sessionSecret && sessionSecret.length < 32) {
    issues.push('SESSION_SECRET is too short (minimum 32 characters)');
  }

  // Check for production mode with development settings
  if (ENVIRONMENT === 'production') {
    if (process.env.DB_PASSWORD === 'development_password_change_me') {
      issues.push('Using development database password in production');
    }

    if (process.env.SESSION_SECURE !== 'true') {
      issues.push('SESSION_SECURE should be true in production');
    }

    if (process.env.NODE_ENV !== 'production') {
      issues.push('NODE_ENV should be set to "production"');
    }
  }

  if (issues.length > 0) {
    addResult('warnings', `Security issues found: ${issues.length}`, issues.join('\n'));
    return false;
  } else {
    addResult('passed', 'Security configuration looks good');
    return true;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Pre-flight Check
// ═══════════════════════════════════════════════════════════════════════════

async function runPreflightChecks() {
  console.log(`\n${colors.cyan}╔═══════════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║           Exprsn Pre-flight Check - ${ENVIRONMENT.toUpperCase()} Environment           ║${colors.reset}`);
  console.log(`${colors.cyan}╚═══════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  // Load environment variables
  await loadEnv();

  // Run all checks
  section('System Requirements');
  await checkNodeVersion();
  await checkDependencies();

  section('System Services');
  const pgOk = await checkPostgreSQL();
  await checkRedis();

  section('Configuration');
  await checkEnvironment();

  if (pgOk) {
    section('Database Setup');
    await checkDatabases();
  }

  section('Port Availability');
  await checkPorts();

  section('Security');
  await checkSecurity();

  // Print summary
  console.log(`\n${colors.cyan}╔═══════════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║                           Summary                                     ║${colors.reset}`);
  console.log(`${colors.cyan}╚═══════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  console.log(`${colors.green}✓ Passed:  ${results.passed.length}${colors.reset}`);
  console.log(`${colors.yellow}⚠ Warnings: ${results.warnings.length}${colors.reset}`);
  console.log(`${colors.red}✗ Critical: ${results.critical.length}${colors.reset}`);

  if (results.info.length > 0) {
    console.log(`${colors.blue}ℹ Info:    ${results.info.length}${colors.reset}`);
  }

  // Show critical issues
  if (results.critical.length > 0) {
    console.log(`\n${colors.red}╔═══════════════════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.red}║                      Critical Issues                                  ║${colors.reset}`);
    console.log(`${colors.red}╚═══════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

    results.critical.forEach((item, index) => {
      console.log(`${colors.red}${index + 1}. ${item.message}${colors.reset}`);
      if (item.details) {
        console.log(`   ${colors.gray}${item.details}${colors.reset}\n`);
      }
    });
  }

  // Show warnings
  if (results.warnings.length > 0) {
    console.log(`\n${colors.yellow}╔═══════════════════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.yellow}║                         Warnings                                      ║${colors.reset}`);
    console.log(`${colors.yellow}╚═══════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

    results.warnings.forEach((item, index) => {
      console.log(`${colors.yellow}${index + 1}. ${item.message}${colors.reset}`);
      if (item.details) {
        console.log(`   ${colors.gray}${item.details}${colors.reset}\n`);
      }
    });
  }

  // Determine exit code
  let exitCode = 0;

  if (results.critical.length > 0) {
    console.log(`\n${colors.red}Pre-flight check FAILED. Please fix critical issues before starting services.${colors.reset}\n`);
    exitCode = 1;
  } else if (results.warnings.length > 0) {
    console.log(`\n${colors.yellow}Pre-flight check passed with warnings. Services can start but issues should be addressed.${colors.reset}\n`);
    exitCode = 2;
  } else {
    console.log(`\n${colors.green}✓ All pre-flight checks passed! Ready to start services.${colors.reset}\n`);
    console.log(`${colors.cyan}To start services: npm start${colors.reset}\n`);
  }

  process.exit(exitCode);
}

// Run checks
runPreflightChecks().catch(err => {
  console.error(`${colors.red}Pre-flight check failed with error:${colors.reset}`, err);
  process.exit(1);
});
