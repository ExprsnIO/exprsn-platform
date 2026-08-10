/**
 * System Operations Commands
 */

const chalk = require('chalk');
const { SystemManager } = require('../modules/system-manager');

module.exports = function(program) {
  const system = program.command('system').description('System operations and maintenance');

  // Initialize system
  system
    .command('init')
    .description('Initialize the entire Exprsn system')
    .option('-f, --force', 'Force initialization (resets everything)')
    .option('--skip-db', 'Skip database creation')
    .option('--skip-migrations', 'Skip migrations')
    .option('--skip-seeds', 'Skip seeding')
    .action(async (options) => {
      const manager = new SystemManager();
      await manager.initialize(options);
    });

  // Database operations
  const db = system.command('db').description('Database operations');

  db
    .command('create')
    .description('Create all databases')
    .option('-s, --service <service>', 'Create database for specific service')
    .action(async (options) => {
      const manager = new SystemManager();
      await manager.createDatabases(options);
    });

  db
    .command('drop')
    .description('Drop databases')
    .option('-s, --service <service>', 'Drop database for specific service')
    .option('-f, --force', 'Force without confirmation')
    .action(async (options) => {
      const manager = new SystemManager();
      await manager.dropDatabases(options);
    });

  db
    .command('migrate')
    .description('Run database migrations')
    .option('-s, --service <service>', 'Migrate specific service')
    .option('-u, --undo', 'Undo last migration')
    .option('--all', 'Undo all migrations')
    .action(async (options) => {
      const manager = new SystemManager();
      await manager.runMigrations(options);
    });

  db
    .command('seed')
    .description('Seed databases')
    .option('-s, --service <service>', 'Seed specific service')
    .action(async (options) => {
      const manager = new SystemManager();
      await manager.seedDatabases(options);
    });

  db
    .command('backup')
    .description('Backup databases')
    .option('-s, --service <service>', 'Backup specific service')
    .option('-o, --output <path>', 'Output directory')
    .action(async (options) => {
      const manager = new SystemManager();
      await manager.backupDatabases(options);
    });

  db
    .command('restore <path>')
    .description('Restore databases from backup')
    .option('-s, --service <service>', 'Restore specific service')
    .action(async (path, options) => {
      const manager = new SystemManager();
      await manager.restoreDatabases(path, options);
    });

  // Reset operations
  system
    .command('reset')
    .description('Reset system (interactive menu)')
    .option('--full', 'Full reset (nuclear option)')
    .option('--data', 'Reset data only')
    .option('--cache', 'Clear cache only')
    .action(async (options) => {
      const manager = new SystemManager();
      await manager.reset(options);
    });

  // Cache management
  system
    .command('cache')
    .description('Manage Redis cache')
    .option('--clear', 'Clear all cache')
    .option('--flush', 'Flush Redis database')
    .option('--stats', 'Show cache statistics')
    .action(async (options) => {
      const manager = new SystemManager();
      await manager.manageCache(options);
    });

  // Health check
  system
    .command('health')
    .description('System health check')
    .option('-w, --watch', 'Continuous monitoring')
    .option('-i, --interval <seconds>', 'Check interval for watch mode', '5')
    .action(async (options) => {
      const manager = new SystemManager();
      await manager.healthCheck(options);
    });

  // Prerequisites check
  system
    .command('preflight')
    .description('Check system prerequisites')
    .option('--fix', 'Attempt to fix issues')
    .action(async (options) => {
      const manager = new SystemManager();
      await manager.preflight(options);
    });

  // Logs
  system
    .command('logs')
    .description('View system logs')
    .option('-s, --service <service>', 'Filter by service')
    .option('-l, --level <level>', 'Filter by log level')
    .option('-f, --follow', 'Follow log output')
    .option('-n, --lines <number>', 'Number of lines', '100')
    .action(async (options) => {
      const manager = new SystemManager();
      await manager.viewLogs(options);
    });
};
