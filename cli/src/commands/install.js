/**
 * Installation Commands
 */

const chalk = require('chalk');
const { InstallManager } = require('../modules/install-manager');

module.exports = function(program) {
  const install = program.command('install').description('Install and configure system dependencies');

  // Detect system
  install
    .command('detect')
    .description('Detect system and available package managers')
    .action(async () => {
      const manager = new InstallManager();
      await manager.detectSystem();
    });

  // Install prerequisites
  install
    .command('prereqs')
    .alias('prerequisites')
    .description('Install system prerequisites')
    .option('-m, --method <method>', 'Installation method (apt|yum|brew|binary|docker)')
    .option('-y, --yes', 'Skip confirmations')
    .action(async (options) => {
      const manager = new InstallManager();
      await manager.installPrerequisites(options);
    });

  // Install PostgreSQL
  install
    .command('postgres')
    .description('Install PostgreSQL')
    .option('-v, --version <version>', 'PostgreSQL version', '15')
    .option('-m, --method <method>', 'Installation method')
    .action(async (options) => {
      const manager = new InstallManager();
      await manager.installPostgreSQL(options);
    });

  // Install Redis
  install
    .command('redis')
    .description('Install Redis')
    .option('-v, --version <version>', 'Redis version', '7')
    .option('-m, --method <method>', 'Installation method')
    .action(async (options) => {
      const manager = new InstallManager();
      await manager.installRedis(options);
    });

  // Install Node.js
  install
    .command('node')
    .description('Install Node.js')
    .option('-v, --version <version>', 'Node.js version', '18')
    .option('-m, --method <method>', 'Installation method')
    .action(async (options) => {
      const manager = new InstallManager();
      await manager.installNodeJS(options);
    });

  // Install Docker
  install
    .command('docker')
    .description('Install Docker and Docker Compose')
    .option('-m, --method <method>', 'Installation method')
    .action(async (options) => {
      const manager = new InstallManager();
      await manager.installDocker(options);
    });

  // Setup Docker containers
  install
    .command('docker-setup')
    .description('Setup Exprsn services in Docker')
    .option('-s, --services <services>', 'Comma-separated list of services')
    .option('--compose', 'Generate docker-compose.yml')
    .action(async (options) => {
      const manager = new InstallManager();
      await manager.setupDocker(options);
    });

  // Install all
  install
    .command('all')
    .description('Install all dependencies')
    .option('-m, --method <method>', 'Preferred installation method')
    .option('-y, --yes', 'Skip confirmations')
    .action(async (options) => {
      const manager = new InstallManager();
      await manager.installAll(options);
    });

  // Verify installation
  install
    .command('verify')
    .description('Verify all installations')
    .action(async () => {
      const manager = new InstallManager();
      await manager.verifyInstallation();
    });

  // Uninstall
  install
    .command('uninstall <component>')
    .description('Uninstall a component')
    .option('-f, --force', 'Force uninstall')
    .action(async (component, options) => {
      const manager = new InstallManager();
      await manager.uninstall(component, options);
    });

  // Update
  install
    .command('update')
    .description('Update Exprsn CLI and dependencies')
    .option('--cli', 'Update CLI only')
    .option('--deps', 'Update dependencies only')
    .action(async (options) => {
      const manager = new InstallManager();
      await manager.update(options);
    });
};
