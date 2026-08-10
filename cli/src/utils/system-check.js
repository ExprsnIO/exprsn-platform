/**
 * System Prerequisites Check
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const semver = require('semver');
const chalk = require('chalk');

const execAsync = promisify(exec);

/**
 * Check if a command exists
 */
async function commandExists(command) {
  try {
    await execAsync(`which ${command}`);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get command version
 */
async function getCommandVersion(command, versionArg = '--version') {
  try {
    const { stdout } = await execAsync(`${command} ${versionArg}`);
    return stdout.trim();
  } catch (error) {
    return null;
  }
}

/**
 * Check Node.js version
 */
async function checkNode() {
  const version = process.version;
  const required = '18.0.0';
  const satisfied = semver.satisfies(version, `>=${required}`);

  return {
    name: 'Node.js',
    required: `>= ${required}`,
    installed: version,
    satisfied,
    critical: true,
    message: satisfied ? 'OK' : `Node.js ${required} or higher is required`
  };
}

/**
 * Check npm version
 */
async function checkNpm() {
  try {
    const version = await getCommandVersion('npm');
    const versionMatch = version.match(/(\d+\.\d+\.\d+)/);
    const installed = versionMatch ? versionMatch[1] : null;

    return {
      name: 'npm',
      required: '>= 8.0.0',
      installed,
      satisfied: installed && semver.satisfies(installed, '>=8.0.0'),
      critical: true,
      message: installed ? 'OK' : 'npm is not installed'
    };
  } catch (error) {
    return {
      name: 'npm',
      required: '>= 8.0.0',
      installed: null,
      satisfied: false,
      critical: true,
      message: 'npm is not installed'
    };
  }
}

/**
 * Check PostgreSQL
 */
async function checkPostgreSQL() {
  const exists = await commandExists('psql');

  if (!exists) {
    return {
      name: 'PostgreSQL',
      required: '>= 12.0',
      installed: null,
      satisfied: false,
      critical: true,
      message: 'PostgreSQL is not installed'
    };
  }

  try {
    const version = await getCommandVersion('psql');
    const versionMatch = version.match(/(\d+\.\d+)/);
    const installed = versionMatch ? versionMatch[1] + '.0' : null;

    return {
      name: 'PostgreSQL',
      required: '>= 12.0',
      installed,
      satisfied: installed && semver.satisfies(installed, '>=12.0.0'),
      critical: true,
      message: installed ? 'OK' : 'Could not determine PostgreSQL version'
    };
  } catch (error) {
    return {
      name: 'PostgreSQL',
      required: '>= 12.0',
      installed: null,
      satisfied: false,
      critical: true,
      message: 'PostgreSQL is installed but not accessible'
    };
  }
}

/**
 * Check Redis
 */
async function checkRedis() {
  const exists = await commandExists('redis-cli');

  if (!exists) {
    return {
      name: 'Redis',
      required: '>= 6.0',
      installed: null,
      satisfied: false,
      critical: false,
      message: 'Redis is not installed (optional but recommended)'
    };
  }

  try {
    const { stdout } = await execAsync('redis-cli --version');
    const versionMatch = stdout.match(/(\d+\.\d+\.\d+)/);
    const installed = versionMatch ? versionMatch[1] : null;

    return {
      name: 'Redis',
      required: '>= 6.0',
      installed,
      satisfied: installed && semver.satisfies(installed, '>=6.0.0'),
      critical: false,
      message: installed ? 'OK' : 'Could not determine Redis version'
    };
  } catch (error) {
    return {
      name: 'Redis',
      required: '>= 6.0',
      installed: null,
      satisfied: false,
      critical: false,
      message: 'Redis is installed but not accessible'
    };
  }
}

/**
 * Check Git
 */
async function checkGit() {
  const exists = await commandExists('git');

  return {
    name: 'Git',
    required: 'any',
    installed: exists ? await getCommandVersion('git') : null,
    satisfied: exists,
    critical: false,
    message: exists ? 'OK' : 'Git is not installed (recommended for development)'
  };
}

/**
 * Check Docker
 */
async function checkDocker() {
  const exists = await commandExists('docker');

  if (!exists) {
    return {
      name: 'Docker',
      required: 'any',
      installed: null,
      satisfied: false,
      critical: false,
      message: 'Docker is not installed (optional)'
    };
  }

  const version = await getCommandVersion('docker');

  return {
    name: 'Docker',
    required: 'any',
    installed: version,
    satisfied: true,
    critical: false,
    message: 'OK'
  };
}

/**
 * Check all prerequisites
 */
async function checkPrerequisites() {
  const checks = await Promise.all([
    checkNode(),
    checkNpm(),
    checkPostgreSQL(),
    checkRedis(),
    checkGit(),
    checkDocker()
  ]);

  const missing = checks.filter(c => !c.satisfied);
  const critical = missing.filter(c => c.critical);

  return {
    checks,
    missing,
    success: critical.length === 0,
    critical: critical.length > 0
  };
}

/**
 * Display prerequisites check results
 */
function displayPrerequisites(results) {
  console.log(chalk.cyan('\n━━━ System Prerequisites ━━━\n'));

  for (const check of results.checks) {
    const icon = check.satisfied ? chalk.green('✓') : chalk.red('✗');
    const status = check.satisfied ? chalk.green('OK') : chalk.red('Missing');

    console.log(`  ${icon} ${check.name.padEnd(15)} ${status}`);
    if (!check.satisfied) {
      console.log(chalk.gray(`    Required: ${check.required}`));
      console.log(chalk.yellow(`    ${check.message}`));
    }
  }

  console.log();

  if (results.success) {
    console.log(chalk.green('✓ All critical prerequisites satisfied\n'));
  } else {
    console.log(chalk.red('✗ Some critical prerequisites are missing\n'));
    console.log(chalk.yellow('Run "exprsn install prereqs" to install missing dependencies\n'));
  }
}

module.exports = {
  checkPrerequisites,
  displayPrerequisites,
  commandExists,
  getCommandVersion
};
