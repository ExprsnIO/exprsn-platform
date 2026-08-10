#!/usr/bin/env node

/**
 * Exprsn CLI - Main Entry Point
 * Interactive command-line interface for managing the Exprsn ecosystem
 */

const path = require('path');
const chalk = require('chalk');
const { Command } = require('commander');
const figlet = require('figlet');
const packageJson = require('../package.json');

// Import CLI modules
const InteractiveMode = require('../src/interactive');
const { setupCommands } = require('../src/commands');
const { checkPrerequisites } = require('../src/utils/system-check');
const { logger } = require('../src/utils/logger');

// Set the root directory
global.EXPRSN_ROOT = path.resolve(__dirname, '../..');

const program = new Command();

// Display banner
function showBanner() {
  console.clear();
  console.log(
    chalk.cyan(
      figlet.textSync('EXPRSN', {
        font: 'Standard',
        horizontalLayout: 'default'
      })
    )
  );
  console.log(chalk.gray(`  Certificate Authority Ecosystem Manager v${packageJson.version}\n`));
}

// Main CLI setup
program
  .name('exprsn')
  .description('Interactive CLI for managing the Exprsn Certificate Authority Ecosystem')
  .version(packageJson.version)
  .option('-i, --interactive', 'Start interactive mode (default)', true)
  .option('-q, --quiet', 'Suppress banner and non-essential output')
  .option('--no-color', 'Disable colored output');

// Setup all command modules
setupCommands(program);

// Parse arguments
program.parse(process.argv);

// Get options
const options = program.opts();

// Main execution
async function main() {
  try {
    // Show banner unless quiet mode
    if (!options.quiet) {
      showBanner();
    }

    // Check prerequisites
    const prereqCheck = await checkPrerequisites();
    if (!prereqCheck.success && prereqCheck.critical) {
      logger.error('Critical prerequisites not met. Please install required dependencies.');
      console.log(chalk.red('\n✗ Prerequisites Check Failed\n'));
      prereqCheck.missing.forEach(item => {
        console.log(chalk.yellow(`  • ${item.name}: ${item.message}`));
      });
      console.log(chalk.gray('\nRun "exprsn install" to install missing dependencies.\n'));
      process.exit(1);
    }

    // If no command specified, start interactive mode
    if (process.argv.length === 2 || options.interactive) {
      const interactive = new InteractiveMode();
      await interactive.start();
    }
  } catch (error) {
    logger.error('Fatal error:', error);
    console.error(chalk.red('\n✗ Fatal Error:'), error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
  console.error(chalk.red('\n✗ Unhandled Error:'), error.message);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\nExiting Exprsn CLI...'));
  process.exit(0);
});

// Start the CLI
main();
