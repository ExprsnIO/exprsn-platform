#!/usr/bin/env node

/**
 * Exprsn Installation CLI
 * Cross-platform installer for the Exprsn Certificate Authority Ecosystem
 * 
 * Supports: macOS, Ubuntu, Debian, Fedora, Arch Linux, CentOS, RHEL, and more
 */

const { program } = require('commander');
const chalk = require('chalk');
const boxen = require('boxen');
const updateNotifier = require('update-notifier');
const pkg = require('./package.json');
const { detectOS } = require('./utils/os-detect');
const { install } = require('./lib/install');
const { configure } = require('./lib/configure');
const { checkDependencies } = require('./lib/check');
const { start, stop, restart, status } = require('./lib/services');
const { uninstall } = require('./lib/uninstall');

// Check for updates
updateNotifier({ pkg }).notify();

// Display banner
console.log(boxen(
  chalk.bold.cyan('Exprsn Installation CLI') + '\n' +
  chalk.gray('Certificate Authority Ecosystem Installer'),
  {
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: 'cyan'
  }
));

program
  .name('exprsn-install')
  .description('Install and manage the Exprsn Certificate Authority Ecosystem')
  .version(pkg.version);

// Install command
program
  .command('install')
  .description('Install Exprsn and all system dependencies')
  .option('-s, --skip-deps', 'Skip system dependency installation')
  .option('-y, --yes', 'Accept all defaults (non-interactive)')
  .option('--dev', 'Install development dependencies')
  .option('--production', 'Install for production (optimized settings)')
  .action(async (options) => {
    try {
      const os = await detectOS();
      console.log(chalk.blue(`\n📦 Detected OS: ${os.name} ${os.version}`));
      await install(os, options);
    } catch (error) {
      console.error(chalk.red(`\n❌ Installation failed: ${error.message}`));
      process.exit(1);
    }
  });

// Configure command
program
  .command('configure')
  .description('Configure Exprsn environment and settings')
  .option('-i, --interactive', 'Interactive configuration wizard')
  .option('-f, --file <path>', 'Load configuration from file')
  .action(async (options) => {
    try {
      await configure(options);
    } catch (error) {
      console.error(chalk.red(`\n❌ Configuration failed: ${error.message}`));
      process.exit(1);
    }
  });

// Check command
program
  .command('check')
  .description('Check system requirements and dependencies')
  .option('-v, --verbose', 'Show detailed information')
  .option('--fix', 'Attempt to fix issues automatically')
  .action(async (options) => {
    try {
      await checkDependencies(options);
    } catch (error) {
      console.error(chalk.red(`\n❌ Check failed: ${error.message}`));
      process.exit(1);
    }
  });

// Service management commands
program
  .command('start [services...]')
  .description('Start Exprsn services')
  .option('-a, --all', 'Start all services')
  .action(async (services, options) => {
    try {
      await start(services, options);
    } catch (error) {
      console.error(chalk.red(`\n❌ Start failed: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('stop [services...]')
  .description('Stop Exprsn services')
  .option('-a, --all', 'Stop all services')
  .action(async (services, options) => {
    try {
      await stop(services, options);
    } catch (error) {
      console.error(chalk.red(`\n❌ Stop failed: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('restart [services...]')
  .description('Restart Exprsn services')
  .option('-a, --all', 'Restart all services')
  .action(async (services, options) => {
    try {
      await restart(services, options);
    } catch (error) {
      console.error(chalk.red(`\n❌ Restart failed: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show status of all Exprsn services')
  .option('-j, --json', 'Output as JSON')
  .action(async (options) => {
    try {
      await status(options);
    } catch (error) {
      console.error(chalk.red(`\n❌ Status check failed: ${error.message}`));
      process.exit(1);
    }
  });

// Uninstall command
program
  .command('uninstall')
  .description('Uninstall Exprsn (keeps databases by default)')
  .option('--full', 'Complete uninstall including databases')
  .option('--keep-data', 'Keep all data and databases')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (options) => {
    try {
      await uninstall(options);
    } catch (error) {
      console.error(chalk.red(`\n❌ Uninstall failed: ${error.message}`));
      process.exit(1);
    }
  });

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
