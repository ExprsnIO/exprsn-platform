/**
 * Uninstall Module
 * Removes Exprsn and optionally databases
 */

const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const EXPRSN_ROOT = path.resolve(__dirname, '../..');

async function uninstall(options) {
  console.log(chalk.bold.red('\n⚠️  Exprsn Uninstall\n'));
  
  if (!options.yes) {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to uninstall Exprsn?',
        default: false
      }
    ]);
    
    if (!confirm) {
      console.log(chalk.yellow('Uninstall cancelled'));
      return;
    }
  }
  
  // Stop all services
  const spinner = ora('Stopping services...').start();
  try {
    execSync('pkill -f "node.*exprsn"', { stdio: 'ignore' });
    spinner.succeed('Services stopped');
  } catch {
    spinner.info('No running services found');
  }
  
  if (options.full) {
    // Drop databases
    spinner.text = 'Dropping databases...';
    spinner.start();
    
    const databases = [
      'exprsn_ca',
      'exprsn_auth',
      'exprsn_timeline',
      'exprsn_spark',
      'exprsn_moderator',
      'exprsn_gallery',
      'exprsn_live',
      'exprsn_vault',
      'exprsn_herald',
      'exprsn_workflow',
      'exprsn_payments',
      'exprsn_atlas'
    ];
    
    for (const db of databases) {
      try {
        execSync('dropdb ' + db, { stdio: 'ignore' });
      } catch {
        // Database may not exist
      }
    }
    spinner.succeed('Databases dropped');
    
    // Clear Redis
    spinner.text = 'Clearing Redis...';
    spinner.start();
    try {
      execSync('redis-cli FLUSHALL', { stdio: 'ignore' });
      spinner.succeed('Redis cleared');
    } catch {
      spinner.warn('Could not clear Redis');
    }
  }
  
  // Remove node_modules
  if (!options.keepData) {
    spinner.text = 'Removing dependencies...';
    spinner.start();
    try {
      execSync('rm -rf node_modules src/*/node_modules', { cwd: EXPRSN_ROOT });
      spinner.succeed('Dependencies removed');
    } catch {
      spinner.warn('Could not remove dependencies');
    }
  }
  
  // Remove .env file
  const envFile = path.join(EXPRSN_ROOT, '.env');
  if (fs.existsSync(envFile) && !options.keepData) {
    spinner.text = 'Removing configuration...';
    spinner.start();
    fs.unlinkSync(envFile);
    spinner.succeed('Configuration removed');
  }
  
  console.log(chalk.green('\n✅ Uninstall complete'));
  
  if (!options.full) {
    console.log(chalk.yellow('\nDatabases preserved. Use --full to remove everything.'));
  }
}

module.exports = {
  uninstall
};
