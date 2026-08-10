/**
 * Configuration Manager
 * Manages .env files and service configurations
 */

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const Table = require('cli-table3');
const { SERVICES } = require('../utils/service-config');
const { logger } = require('../utils/logger');

class ConfigManager {
  constructor() {
    this.rootDir = global.EXPRSN_ROOT || path.resolve(__dirname, '../../..');
  }

  /**
   * Parse .env file content into key-value pairs
   */
  parseEnv(content) {
    const config = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();

        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        config[key] = value;
      }
    }

    return config;
  }

  /**
   * Serialize config object to .env format
   */
  serializeEnv(config) {
    return Object.entries(config)
      .map(([key, value]) => {
        // Quote values with spaces or special characters
        if (typeof value === 'string' && (value.includes(' ') || value.includes('#'))) {
          value = `"${value}"`;
        }
        return `${key}=${value}`;
      })
      .join('\n') + '\n';
  }

  /**
   * Get .env file path for a service
   */
  getEnvPath(serviceName) {
    const service = SERVICES.find(s => s.id === serviceName || s.name === serviceName);
    if (service) {
      return path.join(this.rootDir, service.path, '.env');
    }
    // Fallback to root .env
    return path.join(this.rootDir, '.env');
  }

  /**
   * List all configuration files
   */
  async listConfigs(options = {}) {
    const table = new Table({
      head: ['Service', 'Config File', 'Exists', 'Keys'].map(h => chalk.cyan(h))
    });

    const services = options.service ?
      SERVICES.filter(s => s.id === options.service || s.name === options.service) :
      SERVICES;

    for (const service of services) {
      const envPath = this.getEnvPath(service.id);
      const exists = await fs.pathExists(envPath);

      let keyCount = 0;
      if (exists) {
        const content = await fs.readFile(envPath, 'utf-8');
        const config = this.parseEnv(content);
        keyCount = Object.keys(config).length;
      }

      table.push([
        service.name,
        path.relative(this.rootDir, envPath),
        exists ? chalk.green('✓') : chalk.red('✗'),
        keyCount || '-'
      ]);
    }

    // Root config
    const rootEnvPath = path.join(this.rootDir, '.env');
    const rootExists = await fs.pathExists(rootEnvPath);
    let rootKeys = 0;
    if (rootExists) {
      const content = await fs.readFile(rootEnvPath, 'utf-8');
      rootKeys = Object.keys(this.parseEnv(content)).length;
    }

    table.push([
      'root',
      '.env',
      rootExists ? chalk.green('✓') : chalk.red('✗'),
      rootKeys || '-'
    ]);

    console.log('\n' + table.toString() + '\n');
  }

  /**
   * Show service configuration
   */
  async showConfig(serviceName, options = {}) {
    const envPath = this.getEnvPath(serviceName);

    if (!await fs.pathExists(envPath)) {
      console.log(chalk.yellow(`No configuration file found for ${serviceName}`));
      console.log(chalk.gray(`Expected path: ${envPath}\n`));
      return;
    }

    const content = await fs.readFile(envPath, 'utf-8');
    const config = this.parseEnv(content);

    console.log(chalk.cyan(`\n━━━ ${serviceName} Configuration ━━━\n`));

    if (options.key) {
      const value = config[options.key];
      if (value !== undefined) {
        console.log(`${options.key}=${value}\n`);
      } else {
        console.log(chalk.yellow(`Key '${options.key}' not found\n`));
      }
    } else {
      const table = new Table({
        head: ['Key', 'Value'].map(h => chalk.cyan(h)),
        colWidths: [40, 60]
      });

      Object.entries(config).forEach(([key, value]) => {
        // Mask sensitive values
        let displayValue = value;
        if (key.toLowerCase().includes('password') ||
            key.toLowerCase().includes('secret') ||
            key.toLowerCase().includes('key')) {
          displayValue = '********';
        }

        table.push([key, displayValue]);
      });

      console.log(table.toString() + '\n');
      console.log(chalk.gray(`Config file: ${envPath}\n`));
    }
  }

  /**
   * Get specific configuration value
   */
  async getConfigValue(serviceName, key) {
    const envPath = this.getEnvPath(serviceName);

    if (!await fs.pathExists(envPath)) {
      console.log(chalk.red(`Configuration file not found for ${serviceName}`));
      return;
    }

    const content = await fs.readFile(envPath, 'utf-8');
    const config = this.parseEnv(content);

    if (config[key] !== undefined) {
      console.log(config[key]);
    } else {
      console.log(chalk.yellow(`Key '${key}' not found`));
      process.exit(1);
    }
  }

  /**
   * Set configuration value
   */
  async setConfigValue(serviceName, key, value, options = {}) {
    const envPath = this.getEnvPath(serviceName);

    let config = {};

    if (await fs.pathExists(envPath)) {
      const content = await fs.readFile(envPath, 'utf-8');
      config = this.parseEnv(content);
    } else if (!options.create) {
      console.log(chalk.red(`Configuration file not found for ${serviceName}`));
      console.log(chalk.gray('Use --create flag to create a new file\n'));
      return;
    }

    const spinner = ora(`Setting ${key}...`).start();

    config[key] = value;
    const newContent = this.serializeEnv(config);

    await fs.ensureFile(envPath);
    await fs.writeFile(envPath, newContent);

    spinner.succeed(`${key} set successfully`);
    console.log(chalk.gray(`Config file: ${envPath}\n`));
  }

  /**
   * Delete configuration key
   */
  async deleteConfigValue(serviceName, key, options = {}) {
    const envPath = this.getEnvPath(serviceName);

    if (!await fs.pathExists(envPath)) {
      console.log(chalk.red(`Configuration file not found for ${serviceName}`));
      return;
    }

    if (!options.force) {
      const confirm = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: `Delete ${key} from ${serviceName} configuration?`,
        default: false
      }]);

      if (!confirm.proceed) {
        console.log(chalk.yellow('Cancelled'));
        return;
      }
    }

    const content = await fs.readFile(envPath, 'utf-8');
    const config = this.parseEnv(content);

    if (config[key] === undefined) {
      console.log(chalk.yellow(`Key '${key}' not found`));
      return;
    }

    delete config[key];

    const spinner = ora(`Deleting ${key}...`).start();
    const newContent = this.serializeEnv(config);
    await fs.writeFile(envPath, newContent);

    spinner.succeed(`${key} deleted successfully`);
  }

  /**
   * Edit configuration interactively
   */
  async editConfig(serviceName) {
    const envPath = this.getEnvPath(serviceName);

    if (!await fs.pathExists(envPath)) {
      console.log(chalk.yellow(`No configuration file found for ${serviceName}`));
      const create = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: 'Create new configuration file?',
        default: true
      }]);

      if (!create.proceed) return;
      await fs.ensureFile(envPath);
      await fs.writeFile(envPath, '# Configuration for ' + serviceName + '\n\n');
    }

    const content = await fs.readFile(envPath, 'utf-8');
    const config = this.parseEnv(content);

    console.log(chalk.cyan(`\n━━━ Editing ${serviceName} Configuration ━━━\n`));

    const choices = [
      { name: 'Add new key', value: 'add' },
      { name: 'Edit existing key', value: 'edit' },
      { name: 'Delete key', value: 'delete' },
      { name: 'Done', value: 'done' }
    ];

    let editing = true;

    while (editing) {
      const action = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices
      }]);

      switch (action.action) {
        case 'add':
          const newKey = await inquirer.prompt([
            { type: 'input', name: 'key', message: 'Key name:' },
            { type: 'input', name: 'value', message: 'Value:' }
          ]);
          config[newKey.key] = newKey.value;
          console.log(chalk.green(`✓ ${newKey.key} added\n`));
          break;

        case 'edit':
          const editKey = await inquirer.prompt([{
            type: 'list',
            name: 'key',
            message: 'Select key to edit:',
            choices: Object.keys(config)
          }]);
          const editValue = await inquirer.prompt([{
            type: 'input',
            name: 'value',
            message: `New value for ${editKey.key}:`,
            default: config[editKey.key]
          }]);
          config[editKey.key] = editValue.value;
          console.log(chalk.green(`✓ ${editKey.key} updated\n`));
          break;

        case 'delete':
          const deleteKey = await inquirer.prompt([{
            type: 'list',
            name: 'key',
            message: 'Select key to delete:',
            choices: Object.keys(config)
          }]);
          delete config[deleteKey.key];
          console.log(chalk.green(`✓ ${deleteKey.key} deleted\n`));
          break;

        case 'done':
          editing = false;
          break;
      }
    }

    const spinner = ora('Saving configuration...').start();
    const newContent = this.serializeEnv(config);
    await fs.writeFile(envPath, newContent);
    spinner.succeed('Configuration saved successfully');
  }

  /**
   * Validate configuration
   */
  async validateConfig(serviceName) {
    const envPath = this.getEnvPath(serviceName);

    if (!await fs.pathExists(envPath)) {
      console.log(chalk.red(`✗ Configuration file not found for ${serviceName}\n`));
      return;
    }

    const spinner = ora('Validating configuration...').start();

    try {
      const content = await fs.readFile(envPath, 'utf-8');
      const config = this.parseEnv(content);

      const issues = [];

      // Check for required keys (basic validation)
      const requiredKeys = ['NODE_ENV', 'PORT'];
      for (const key of requiredKeys) {
        if (!config[key]) {
          issues.push(`Missing required key: ${key}`);
        }
      }

      spinner.stop();

      if (issues.length === 0) {
        console.log(chalk.green(`✓ Configuration is valid\n`));
      } else {
        console.log(chalk.yellow(`⚠ Configuration has issues:\n`));
        issues.forEach(issue => console.log(chalk.yellow(`  • ${issue}`)));
        console.log();
      }
    } catch (error) {
      spinner.fail('Validation failed');
      console.error(chalk.red('Error:'), error.message);
    }
  }

  /**
   * Initialize configuration from template
   */
  async initConfig(serviceName, options = {}) {
    const envPath = this.getEnvPath(serviceName);
    const examplePath = envPath.replace('.env', '.env.example');

    if (await fs.pathExists(envPath) && !options.force) {
      console.log(chalk.yellow(`Configuration file already exists for ${serviceName}`));
      const overwrite = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: 'Overwrite existing configuration?',
        default: false
      }]);

      if (!overwrite.proceed) return;
    }

    const spinner = ora('Initializing configuration...').start();

    try {
      if (await fs.pathExists(examplePath)) {
        await fs.copy(examplePath, envPath);
        spinner.succeed('Configuration initialized from template');
      } else {
        // Create basic template
        const template = `# Configuration for ${serviceName}
NODE_ENV=development
PORT=${SERVICES.find(s => s.id === serviceName)?.port || 3000}

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=exprsn_${serviceName}
DB_USER=postgres
DB_PASSWORD=

# Redis
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
`;
        await fs.writeFile(envPath, template);
        spinner.succeed('Configuration initialized with defaults');
      }

      console.log(chalk.gray(`Config file: ${envPath}\n`));
    } catch (error) {
      spinner.fail('Failed to initialize configuration');
      console.error(chalk.red('Error:'), error.message);
    }
  }

  /**
   * Backup configurations
   */
  async backupConfigs(options = {}) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = options.output || path.join(this.rootDir, 'backups', `config-${timestamp}`);

    const spinner = ora('Creating backup...').start();

    try {
      await fs.ensureDir(backupDir);

      let count = 0;

      // Backup root .env
      const rootEnv = path.join(this.rootDir, '.env');
      if (await fs.pathExists(rootEnv)) {
        await fs.copy(rootEnv, path.join(backupDir, 'root.env'));
        count++;
      }

      // Backup service configs
      for (const service of SERVICES) {
        const envPath = this.getEnvPath(service.id);
        if (await fs.pathExists(envPath)) {
          await fs.copy(envPath, path.join(backupDir, `${service.id}.env`));
          count++;
        }
      }

      spinner.succeed(`Backed up ${count} configuration files`);
      console.log(chalk.gray(`Backup location: ${backupDir}\n`));
    } catch (error) {
      spinner.fail('Backup failed');
      console.error(chalk.red('Error:'), error.message);
    }
  }

  /**
   * Restore configurations from backup
   */
  async restoreConfigs(backupPath, options = {}) {
    if (!await fs.pathExists(backupPath)) {
      console.log(chalk.red(`Backup not found: ${backupPath}`));
      return;
    }

    if (!options.force) {
      const confirm = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: 'This will overwrite existing configurations. Continue?',
        default: false
      }]);

      if (!confirm.proceed) return;
    }

    const spinner = ora('Restoring configurations...').start();

    try {
      const files = await fs.readdir(backupPath);
      let count = 0;

      for (const file of files) {
        if (!file.endsWith('.env')) continue;

        const source = path.join(backupPath, file);

        if (file === 'root.env') {
          await fs.copy(source, path.join(this.rootDir, '.env'));
          count++;
        } else {
          const serviceName = file.replace('.env', '');
          const dest = this.getEnvPath(serviceName);
          await fs.copy(source, dest);
          count++;
        }
      }

      spinner.succeed(`Restored ${count} configuration files`);
    } catch (error) {
      spinner.fail('Restore failed');
      console.error(chalk.red('Error:'), error.message);
    }
  }

  /**
   * Manage environments
   */
  async manageEnvironments(options = {}) {
    if (options.list) {
      console.log(chalk.cyan('\n━━━ Environments ━━━\n'));
      console.log('  • development');
      console.log('  • production');
      console.log('  • staging');
      console.log();
    } else if (options.switch) {
      const env = options.switch;
      await this.setConfigValue('root', 'NODE_ENV', env, { create: true });
    } else if (options.create) {
      console.log(chalk.yellow('Environment creation is done through configuration files'));
      console.log(chalk.gray('Create .env files for each environment\n'));
    } else {
      console.log(chalk.yellow('Please specify an option: --list, --switch, or --create'));
    }
  }
}

module.exports = { ConfigManager };
