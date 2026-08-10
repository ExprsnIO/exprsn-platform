#!/usr/bin/env node

const { program } = require('commander');
const chalk = require('chalk');
const path = require('path');

// Import commands
const initCommand = require('./commands/init');
const localCommand = require('./commands/local');
const containerCommand = require('./commands/container');
const cloudCommand = require('./commands/cloud');
const configCommand = require('./commands/config');
const envCommand = require('./commands/env');

// CLI version from package.json
const packageJson = require('../package.json');

// ASCII Art Banner
const banner = `
${chalk.cyan('╔═══════════════════════════════════════════════════════════════╗')}
${chalk.cyan('║')}     ${chalk.bold.white('EXPRSN PLATFORM DEPLOYMENT CLI')}                     ${chalk.cyan('║')}
${chalk.cyan('║')}     ${chalk.gray('Certificate Authority & Token Platform')}              ${chalk.cyan('║')}
${chalk.cyan('╚═══════════════════════════════════════════════════════════════╝')}
`;

console.log(banner);

// Configure CLI
program
  .name('exprsn-deploy')
  .description('Deployment and configuration CLI for Exprsn Platform')
  .version(packageJson.version);

// Init command - Interactive setup wizard
program
  .command('init')
  .description('Initialize deployment configuration with interactive prompts')
  .option('-e, --env <environment>', 'Environment (production|staging|dev|testing)', 'production')
  .option('-o, --output <path>', 'Output directory for configuration files', process.cwd())
  .action(initCommand);

// Local deployment command
program
  .command('local')
  .description('Deploy to local machine (Ubuntu, Fedora, or macOS)')
  .option('-p, --platform <platform>', 'Platform (ubuntu|fedora|macos)', 'auto')
  .option('-e, --env <environment>', 'Environment (production|staging|dev|testing)', 'production')
  .option('--no-services', 'Skip service installation (PostgreSQL, Redis, RabbitMQ)')
  .option('--nginx', 'Install and configure NGINX')
  .option('--ssl', 'Generate and configure SSL certificates')
  .action(localCommand);

// Container deployment command
program
  .command('container')
  .description('Deploy using Docker containers')
  .option('-m, --mode <mode>', 'Mode (up|down|restart|rebuild)', 'up')
  .option('-e, --env <environment>', 'Environment (production|staging|dev|testing)', 'production')
  .option('--logs', 'Show container logs after deployment')
  .action(containerCommand);

// Cloud deployment command
program
  .command('cloud')
  .description('Deploy to cloud provider (DigitalOcean, AWS, or Azure)')
  .option('-p, --provider <provider>', 'Provider (digitalocean|aws|azure)', 'digitalocean')
  .option('-e, --env <environment>', 'Environment (production|staging|dev|testing)', 'production')
  .option('-r, --region <region>', 'Cloud region')
  .option('-s, --size <size>', 'Instance size')
  .option('--ssh-key <path>', 'Path to SSH private key')
  .action(cloudCommand);

// Config command - Database and Redis configuration
program
  .command('config')
  .description('Configure database and caching services')
  .option('-t, --type <type>', 'Configuration type (database|redis|rabbitmq|all)', 'all')
  .option('-e, --env <environment>', 'Environment (production|staging|dev|testing)', 'production')
  .option('--host <host>', 'Service host')
  .option('--port <port>', 'Service port')
  .option('--user <user>', 'Username')
  .option('--password <password>', 'Password')
  .option('--test', 'Test connection after configuration')
  .action(configCommand);

// Env command - Generate environment files
program
  .command('env')
  .description('Generate .env files for different environments')
  .option('-e, --env <environment>', 'Environment (production|staging|dev|testing)', 'production')
  .option('-o, --output <path>', 'Output file path', '.env')
  .option('--copy-from <source>', 'Copy from existing .env file')
  .option('--interactive', 'Interactive mode with prompts')
  .action(envCommand);

// Status command - Check deployment status
program
  .command('status')
  .description('Check deployment and service status')
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    const { checkStatus } = require('./lib/status');
    await checkStatus(options);
  });

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
  console.log('\n' + chalk.yellow('💡 Tip: Start with') + chalk.cyan(' exprsn-deploy init') + chalk.yellow(' to set up your deployment\n'));
}

// Error handling
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('\n✖ Unhandled error:'), error.message);
  if (error.stack) {
    console.error(chalk.gray(error.stack));
  }
  process.exit(1);
});
