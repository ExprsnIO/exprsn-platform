/**
 * System Operations Manager
 * Handles database operations, migrations, system initialization
 */

const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const { Listr } = require('listr2');
const { ServiceManager } = require('./service-manager');
const { SERVICES } = require('../utils/service-config');
const { logger } = require('../utils/logger');

const execAsync = promisify(exec);

class SystemManager {
  constructor() {
    this.rootDir = global.EXPRSN_ROOT || path.resolve(__dirname, '../../..');
    this.serviceManager = new ServiceManager();
  }

  async initialize(options = {}) {
    if (options.force) {
      const confirm = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: chalk.red('This will RESET the entire system. Are you sure?'),
        default: false
      }]);
      if (!confirm.proceed) return;
    }

    const tasks = new Listr([
      {
        title: 'Create databases',
        skip: () => options.skipDb,
        task: async () => await this.createDatabases()
      },
      {
        title: 'Run migrations',
        skip: () => options.skipMigrations,
        task: async () => await this.runMigrations()
      },
      {
        title: 'Seed databases',
        skip: () => options.skipSeeds,
        task: async () => await this.seedDatabases()
      }
    ]);

    try {
      await tasks.run();
      console.log(chalk.green('\n✓ System initialized successfully\n'));
    } catch (error) {
      console.error(chalk.red('\n✗ System initialization failed\n'));
      logger.error('Init error:', error);
    }
  }

  async createDatabases(options = {}) {
    const services = options.service ?
      SERVICES.filter(s => s.id === options.service) :
      SERVICES.filter(s => s.status === 'production');

    for (const service of services) {
      const dbName = `exprsn_${service.id}`;
      try {
        await execAsync(`createdb ${dbName} 2>/dev/null || true`);
        console.log(chalk.green(`✓ Created database: ${dbName}`));
      } catch (error) {
        console.log(chalk.yellow(`  Database ${dbName} may already exist`));
      }
    }
  }

  async dropDatabases(options = {}) {
    if (!options.force) {
      const confirm = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: chalk.red('This will DELETE all databases. Continue?'),
        default: false
      }]);
      if (!confirm.proceed) return;
    }

    const services = options.service ?
      SERVICES.filter(s => s.id === options.service) :
      SERVICES;

    for (const service of services) {
      const dbName = `exprsn_${service.id}`;
      try {
        await execAsync(`dropdb ${dbName} 2>/dev/null || true`);
        console.log(chalk.green(`✓ Dropped database: ${dbName}`));
      } catch (error) {
        console.log(chalk.yellow(`  Database ${dbName} not found`));
      }
    }
  }

  async runMigrations(options = {}) {
    const services = options.service ?
      SERVICES.filter(s => s.id === options.service) :
      SERVICES.filter(s => s.status === 'production');

    for (const service of services) {
      const servicePath = path.join(this.rootDir, service.path);
      const migrationPath = path.join(servicePath, 'migrations');

      if (!await fs.pathExists(migrationPath)) continue;

      try {
        const cmd = options.undo ?
          (options.all ? 'db:migrate:undo:all' : 'db:migrate:undo') :
          'db:migrate';

        await execAsync(`npx sequelize-cli ${cmd}`, { cwd: servicePath });
        console.log(chalk.green(`✓ Migrated: ${service.name}`));
      } catch (error) {
        console.log(chalk.red(`✗ Migration failed: ${service.name}`));
        logger.error(`Migration error for ${service.name}:`, error);
      }
    }
  }

  async seedDatabases(options = {}) {
    const services = options.service ?
      SERVICES.filter(s => s.id === options.service) :
      SERVICES.filter(s => s.status === 'production');

    for (const service of services) {
      const servicePath = path.join(this.rootDir, service.path);
      const seederPath = path.join(servicePath, 'seeders');

      if (!await fs.pathExists(seederPath)) continue;

      try {
        await execAsync('npx sequelize-cli db:seed:all', { cwd: servicePath });
        console.log(chalk.green(`✓ Seeded: ${service.name}`));
      } catch (error) {
        console.log(chalk.yellow(`  Seeding skipped: ${service.name}`));
      }
    }
  }

  async backupDatabases(options = {}) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = options.output || path.join(this.rootDir, 'backups', `db-${timestamp}`);
    await fs.ensureDir(backupDir);

    const services = options.service ?
      SERVICES.filter(s => s.id === options.service) :
      SERVICES;

    for (const service of services) {
      const dbName = `exprsn_${service.id}`;
      const backupFile = path.join(backupDir, `${service.id}.sql`);

      try {
        await execAsync(`pg_dump ${dbName} > ${backupFile}`);
        console.log(chalk.green(`✓ Backed up: ${dbName}`));
      } catch (error) {
        console.log(chalk.yellow(`  Backup skipped: ${dbName}`));
      }
    }

    console.log(chalk.gray(`\nBackup location: ${backupDir}\n`));
  }

  async restoreDatabases(backupPath, options = {}) {
    if (!await fs.pathExists(backupPath)) {
      console.log(chalk.red(`Backup not found: ${backupPath}`));
      return;
    }

    const files = await fs.readdir(backupPath);

    for (const file of files) {
      if (!file.endsWith('.sql')) continue;

      const serviceName = file.replace('.sql', '');
      const dbName = `exprsn_${serviceName}`;
      const backupFile = path.join(backupPath, file);

      try {
        await execAsync(`psql ${dbName} < ${backupFile}`);
        console.log(chalk.green(`✓ Restored: ${dbName}`));
      } catch (error) {
        console.log(chalk.red(`✗ Restore failed: ${dbName}`));
      }
    }
  }

  async reset(options = {}) {
    if (options.full) {
      await this.dropDatabases({ force: true });
      await this.manageCache({ clear: true });
      await this.initialize();
    } else if (options.data) {
      await this.runMigrations({ undo: true, all: true });
      await this.runMigrations();
      await this.seedDatabases();
    } else if (options.cache) {
      await this.manageCache({ clear: true });
    } else {
      const answer = await inquirer.prompt([{
        type: 'list',
        name: 'option',
        message: 'What would you like to reset?',
        choices: [
          { name: 'Full system reset (nuclear option)', value: 'full' },
          { name: 'Data only (migrations + seeds)', value: 'data' },
          { name: 'Cache only', value: 'cache' },
          { name: 'Cancel', value: 'cancel' }
        ]
      }]);

      if (answer.option !== 'cancel') {
        await this.reset({ [answer.option]: true });
      }
    }
  }

  async manageCache(options = {}) {
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = process.env.REDIS_PORT || 6379;

    if (options.clear || options.flush) {
      const spinner = ora('Clearing Redis cache...').start();
      try {
        await execAsync(`redis-cli -h ${redisHost} -p ${redisPort} FLUSHALL`);
        spinner.succeed('Redis cache cleared');
      } catch (error) {
        spinner.fail('Failed to clear cache');
        console.log(chalk.yellow('Redis may not be running\n'));
      }
    } else if (options.stats) {
      try {
        const { stdout } = await execAsync(`redis-cli -h ${redisHost} -p ${redisPort} INFO stats`);
        console.log(chalk.cyan('\n━━━ Redis Statistics ━━━\n'));
        console.log(stdout);
      } catch (error) {
        console.log(chalk.red('Failed to get cache statistics'));
      }
    }
  }

  async healthCheck(options = {}) {
    await this.serviceManager.healthCheck(options);
  }

  async preflight(options = {}) {
    const { checkPrerequisites, displayPrerequisites } = require('../utils/system-check');

    const results = await checkPrerequisites();
    displayPrerequisites(results);

    if (options.fix && !results.success) {
      console.log(chalk.cyan('Attempting to fix issues...\n'));
      const { InstallManager } = require('./install-manager');
      const installer = new InstallManager();
      await installer.installPrerequisites({ yes: false });
    }
  }

  async viewLogs(options = {}) {
    const logDir = path.join(this.rootDir, 'logs');

    if (!await fs.pathExists(logDir)) {
      console.log(chalk.yellow('No logs directory found'));
      return;
    }

    let pattern = '*.log';
    if (options.service) {
      pattern = `${options.service}.log`;
    }

    const cmd = options.follow ?
      `tail -f ${logDir}/${pattern}` :
      `tail -n ${options.lines || 100} ${logDir}/${pattern}`;

    const child = exec(cmd);
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
  }
}

module.exports = { SystemManager };
