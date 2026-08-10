/**
 * Main Installation Module
 * Handles installation of Exprsn and all dependencies
 */

const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');
const { Listr } = require('listr');
const PackageManager = require('../utils/package-manager');
const { isRoot, hasSudo, exec } = require('../utils/os-detect');
const fs = require('fs');

const EXPRSN_ROOT = path.resolve(__dirname, '../..');

/**
 * System dependencies by OS
 */
const DEPENDENCIES = {
  macos: {
    packages: ['postgresql@15', 'redis', 'node@18', 'npm', 'ffmpeg'],
    optional: ['elasticsearch'],
    services: ['postgresql@15', 'redis']
  },
  ubuntu: {
    packages: ['postgresql-15', 'postgresql-contrib', 'redis-server', 'nodejs', 'npm', 'ffmpeg', 'build-essential'],
    optional: ['elasticsearch'],
    services: ['postgresql', 'redis-server']
  },
  debian: {
    packages: ['postgresql-15', 'postgresql-contrib', 'redis-server', 'nodejs', 'npm', 'ffmpeg', 'build-essential'],
    optional: ['elasticsearch'],
    services: ['postgresql', 'redis-server']
  },
  fedora: {
    packages: ['postgresql-server', 'postgresql-contrib', 'redis', 'nodejs', 'npm', 'ffmpeg', 'gcc-c++', 'make'],
    optional: ['elasticsearch'],
    services: ['postgresql', 'redis'],
    init: ['postgresql-setup --initdb']
  },
  arch: {
    packages: ['postgresql', 'redis', 'nodejs', 'npm', 'ffmpeg', 'base-devel'],
    optional: ['elasticsearch'],
    services: ['postgresql', 'redis'],
    init: ['initdb -D /var/lib/postgres/data']
  },
  rhel: {
    packages: ['postgresql-server', 'postgresql-contrib', 'redis', 'nodejs', 'npm', 'ffmpeg', 'gcc-c++', 'make'],
    optional: ['elasticsearch'],
    services: ['postgresql', 'redis'],
    init: ['postgresql-setup --initdb']
  },
  centos: {
    packages: ['postgresql-server', 'postgresql-contrib', 'redis', 'nodejs', 'npm', 'ffmpeg', 'gcc-c++', 'make'],
    optional: ['elasticsearch'],
    services: ['postgresql', 'redis'],
    init: ['postgresql-setup --initdb']
  }
};

/**
 * Get dependencies for OS
 */
function getDependencies(osId) {
  return DEPENDENCIES[osId] || DEPENDENCIES.ubuntu;
}

/**
 * Check prerequisites
 */
async function checkPrerequisites(os) {
  console.log(chalk.blue('\n📋 Checking prerequisites...\n'));
  
  const checks = [];
  
  // Check if running as root (not recommended)
  if (isRoot()) {
    console.log(chalk.yellow('⚠️  Running as root is not recommended'));
    const { continueAsRoot } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continueAsRoot',
        message: 'Continue anyway?',
        default: false
      }
    ]);
    if (!continueAsRoot) {
      process.exit(0);
    }
  }
  
  // Check sudo availability (for Linux)
  if (os.platform === 'linux' && !isRoot() && !hasSudo()) {
    console.log(chalk.red('❌ sudo is required but not available'));
    process.exit(1);
  }
  
  // Check package manager
  if (!os.packageManager) {
    console.log(chalk.red('❌ No supported package manager found'));
    console.log(chalk.yellow('Supported: brew (macOS), apt, dnf, yum, pacman, zypper'));
    process.exit(1);
  }
  
  console.log(chalk.green('✓ Package manager: ') + chalk.cyan(os.packageManager));
  
  // Check disk space (need at least 5GB)
  const diskSpace = exec("df -k . | tail -1 | awk '{print $4}'");
  if (diskSpace) {
    const spaceGB = parseInt(diskSpace) / 1024 / 1024;
    if (spaceGB < 5) {
      console.log(chalk.yellow('⚠️  Low disk space: ' + spaceGB.toFixed(1) + 'GB available'));
      console.log(chalk.yellow('   At least 5GB recommended'));
    } else {
      console.log(chalk.green('✓ Disk space: ') + chalk.cyan(spaceGB.toFixed(1) + 'GB'));
    }
  }
  
  // Check memory (need at least 4GB)
  if (os.totalMemory < 4) {
    console.log(chalk.yellow('⚠️  Low memory: ' + os.totalMemory + 'GB'));
    console.log(chalk.yellow('   At least 4GB recommended'));
  } else {
    console.log(chalk.green('✓ Memory: ') + chalk.cyan(os.totalMemory + 'GB'));
  }
  
  console.log(chalk.green('✓ CPU cores: ') + chalk.cyan(os.cpus));
  
  return true;
}

/**
 * Install Node.js
 */
async function installNodeJS(pm, os) {
  const nodeVersion = exec('node --version');
  
  if (nodeVersion) {
    const version = nodeVersion.replace('v', '');
    const major = parseInt(version.split('.')[0]);
    
    if (major >= 18) {
      console.log(chalk.green('✓ Node.js already installed: ') + chalk.cyan(nodeVersion));
      return true;
    } else {
      console.log(chalk.yellow('⚠️  Node.js version too old: ' + nodeVersion));
      console.log(chalk.yellow('   Upgrading to Node.js 18...'));
    }
  }
  
  // Install Node.js based on OS
  if (os.id === 'macos') {
    await pm.install('node@18');
    await pm.execCommand('brew link --overwrite node@18');
  } else if (os.packageManager === 'apt') {
    // Use NodeSource repository for latest Node.js
    await pm.execCommand('curl -fsSL https://deb.nodesource.com/setup_18.x | bash -');
    await pm.install('nodejs');
  } else if (os.packageManager === 'dnf' || os.packageManager === 'yum') {
    await pm.execCommand('curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -');
    await pm.install('nodejs');
  } else if (os.packageManager === 'pacman') {
    await pm.install('nodejs');
  } else {
    await pm.install('nodejs');
  }
  
  return true;
}

/**
 * Install system dependencies
 */
async function installSystemDependencies(pm, os, options) {
  console.log(chalk.blue('\n📦 Installing system dependencies...\n'));
  
  const deps = getDependencies(os.id);
  
  // Update package lists
  await pm.update();
  
  // Install main dependencies
  console.log(chalk.cyan('\n→ Installing required packages...'));
  for (const pkg of deps.packages) {
    if (!pm.isInstalled(pkg)) {
      await pm.install(pkg);
    } else {
      console.log(chalk.gray('  ✓ Already installed: ' + pkg));
    }
  }
  
  // Install optional dependencies
  if (options.dev) {
    console.log(chalk.cyan('\n→ Installing optional packages...'));
    for (const pkg of deps.optional || []) {
      try {
        if (!pm.isInstalled(pkg)) {
          await pm.install(pkg);
        } else {
          console.log(chalk.gray('  ✓ Already installed: ' + pkg));
        }
      } catch (error) {
        console.log(chalk.yellow('  ⚠️  Failed to install optional package: ' + pkg));
      }
    }
  }
  
  // Run initialization commands
  if (deps.init) {
    console.log(chalk.cyan('\n→ Running initialization commands...'));
    for (const cmd of deps.init) {
      try {
        await pm.execCommand(cmd, { silent: true });
      } catch (error) {
        console.log(chalk.yellow('  ⚠️  Init command may have failed: ' + cmd));
      }
    }
  }
  
  return true;
}

/**
 * Start system services
 */
async function startSystemServices(pm, os) {
  console.log(chalk.blue('\n🚀 Starting system services...\n'));
  
  const deps = getDependencies(os.id);
  
  for (const service of deps.services || []) {
    await pm.startService(service);
    if (os.platform === 'linux') {
      await pm.enableService(service);
    }
  }
  
  return true;
}

/**
 * Install Exprsn dependencies
 */
async function installExprsnDependencies() {
  console.log(chalk.blue('\n📦 Installing Exprsn dependencies...\n'));
  
  const spinner = ora('Installing npm packages...').start();
  
  try {
    const { execSync } = require('child_process');
    execSync('npm install', { 
      cwd: EXPRSN_ROOT,
      stdio: 'inherit'
    });
    spinner.succeed('Exprsn dependencies installed');
    return true;
  } catch (error) {
    spinner.fail('Failed to install Exprsn dependencies');
    throw error;
  }
}

/**
 * Main install function
 */
async function install(os, options) {
  console.log(chalk.bold.blue('\n🔧 Installing Exprsn Certificate Authority Ecosystem\n'));
  
  // Check prerequisites
  await checkPrerequisites(os);
  
  // Create package manager instance
  const pm = new PackageManager(os.packageManager, os.platform === 'linux');
  
  if (!options.skipDeps) {
    // Install Node.js first
    await installNodeJS(pm, os);
    
    // Install system dependencies
    await installSystemDependencies(pm, os, options);
    
    // Start system services
    await startSystemServices(pm, os);
  } else {
    console.log(chalk.yellow('\n⚠️  Skipping system dependencies installation'));
  }
  
  // Install Exprsn dependencies
  await installExprsnDependencies();
  
  // Initialize Exprsn
  console.log(chalk.blue('\n🔧 Initializing Exprsn...\n'));
  
  if (options.yes) {
    const { execSync } = require('child_process');
    execSync('npm run init', { 
      cwd: EXPRSN_ROOT,
      stdio: 'inherit'
    });
  } else {
    const { runInit } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'runInit',
        message: 'Initialize Exprsn (create databases, run migrations)?',
        default: true
      }
    ]);
    
    if (runInit) {
      const { execSync } = require('child_process');
      execSync('npm run init', { 
        cwd: EXPRSN_ROOT,
        stdio: 'inherit'
      });
    }
  }
  
  // Success!
  console.log(chalk.bold.green('\n✨ Installation complete!\n'));
  console.log(chalk.cyan('Next steps:'));
  console.log(chalk.white('  1. Review configuration: ') + chalk.gray('exprsn-install configure'));
  console.log(chalk.white('  2. Start services: ') + chalk.gray('npm start'));
  console.log(chalk.white('  3. Check status: ') + chalk.gray('exprsn-install status'));
  console.log();
}

module.exports = {
  install
};
