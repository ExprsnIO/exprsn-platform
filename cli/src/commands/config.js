/**
 * Configuration Management Commands
 */

const chalk = require('chalk');
const { ConfigManager } = require('../modules/config-manager');

module.exports = function(program) {
  const config = program.command('config').description('Manage configuration files');

  // List all .env files
  config
    .command('list')
    .alias('ls')
    .description('List all configuration files')
    .option('-s, --service <service>', 'Filter by service')
    .action(async (options) => {
      const manager = new ConfigManager();
      await manager.listConfigs(options);
    });

  // Show configuration
  config
    .command('show <service>')
    .description('Show service configuration')
    .option('-k, --key <key>', 'Show specific key')
    .action(async (service, options) => {
      const manager = new ConfigManager();
      await manager.showConfig(service, options);
    });

  // Get specific value
  config
    .command('get <service> <key>')
    .description('Get configuration value')
    .action(async (service, key) => {
      const manager = new ConfigManager();
      await manager.getConfigValue(service, key);
    });

  // Set configuration value
  config
    .command('set <service> <key> <value>')
    .description('Set configuration value')
    .option('-c, --create', 'Create config file if it doesn\'t exist')
    .action(async (service, key, value, options) => {
      const manager = new ConfigManager();
      await manager.setConfigValue(service, key, value, options);
    });

  // Delete configuration key
  config
    .command('delete <service> <key>')
    .description('Delete configuration key')
    .option('-f, --force', 'Force deletion without confirmation')
    .action(async (service, key, options) => {
      const manager = new ConfigManager();
      await manager.deleteConfigValue(service, key, options);
    });

  // Edit configuration interactively
  config
    .command('edit <service>')
    .description('Edit service configuration interactively')
    .action(async (service) => {
      const manager = new ConfigManager();
      await manager.editConfig(service);
    });

  // Validate configuration
  config
    .command('validate <service>')
    .description('Validate service configuration')
    .action(async (service) => {
      const manager = new ConfigManager();
      await manager.validateConfig(service);
    });

  // Generate configuration template
  config
    .command('init <service>')
    .description('Initialize configuration from template')
    .option('-f, --force', 'Overwrite existing configuration')
    .action(async (service, options) => {
      const manager = new ConfigManager();
      await manager.initConfig(service, options);
    });

  // Backup/restore
  config
    .command('backup')
    .description('Backup all configurations')
    .option('-o, --output <path>', 'Backup output path')
    .action(async (options) => {
      const manager = new ConfigManager();
      await manager.backupConfigs(options);
    });

  config
    .command('restore <path>')
    .description('Restore configurations from backup')
    .option('-f, --force', 'Force restore without confirmation')
    .action(async (path, options) => {
      const manager = new ConfigManager();
      await manager.restoreConfigs(path, options);
    });

  // Environment-specific configs
  config
    .command('env')
    .description('Manage environment configurations')
    .option('-l, --list', 'List environments')
    .option('-s, --switch <env>', 'Switch to environment')
    .option('-c, --create <env>', 'Create new environment')
    .action(async (options) => {
      const manager = new ConfigManager();
      await manager.manageEnvironments(options);
    });
};
