/**
 * Installation Manager
 * Handles installation of dependencies via multiple package managers
 */

const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const { commandExists } = require('../utils/system-check');
const { logger } = require('../utils/logger');

const execAsync = promisify(exec);

class InstallManager {
  constructor() {
    this.platform = os.platform();
    this.arch = os.arch();
  }

  async detectSystem() {
    console.log(chalk.cyan('\n━━━ System Information ━━━\n'));
    console.log(`  Platform:     ${this.platform}`);
    console.log(`  Architecture: ${this.arch}`);
    console.log(`  OS Release:   ${os.release()}`);
    console.log(`  Node.js:      ${process.version}`);
    console.log();

    console.log(chalk.cyan('━━━ Available Package Managers ━━━\n'));

    const managers = {
      apt: await commandExists('apt'),
      yum: await commandExists('yum'),
      brew: await commandExists('brew'),
      docker: await commandExists('docker'),
      npm: await commandExists('npm')
    };

    Object.entries(managers).forEach(([name, available]) => {
      const icon = available ? chalk.green('✓') : chalk.gray('✗');
      console.log(`  ${icon} ${name.padEnd(10)} ${available ? 'Available' : 'Not installed'}`);
    });

    console.log();
    return managers;
  }

  async determineMethod(preferredMethod) {
    if (preferredMethod) return preferredMethod;

    const managers = await this.detectSystem();

    // Auto-detect best method
    if (this.platform === 'linux') {
      if (managers.apt) return 'apt';
      if (managers.yum) return 'yum';
      if (managers.docker) return 'docker';
    } else if (this.platform === 'darwin') {
      if (managers.brew) return 'brew';
      if (managers.docker) return 'docker';
    }

    return 'binary';
  }

  async installPrerequisites(options = {}) {
    const method = await this.determineMethod(options.method);

    console.log(chalk.cyan(`\nUsing installation method: ${method}\n`));

    if (!options.yes) {
      const confirm = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: 'Install prerequisites?',
        default: true
      }]);

      if (!confirm.proceed) return;
    }

    await this.installPostgreSQL({ method });
    await this.installRedis({ method });
    await this.installNodeJS({ method });
  }

  async installPostgreSQL(options = {}) {
    const method = await this.determineMethod(options.method);
    const version = options.version || '15';
    const spinner = ora(`Installing PostgreSQL ${version}...`).start();

    try {
      switch (method) {
        case 'apt':
          await execAsync(`sudo apt update && sudo apt install -y postgresql-${version} postgresql-contrib`);
          await execAsync('sudo systemctl start postgresql');
          await execAsync('sudo systemctl enable postgresql');
          break;

        case 'yum':
          await execAsync(`sudo yum install -y postgresql${version}-server postgresql${version}-contrib`);
          await execAsync('sudo postgresql-setup initdb');
          await execAsync('sudo systemctl start postgresql');
          await execAsync('sudo systemctl enable postgresql');
          break;

        case 'brew':
          await execAsync(`brew install postgresql@${version}`);
          await execAsync(`brew services start postgresql@${version}`);
          break;

        case 'docker':
          await execAsync(`docker run -d --name exprsn-postgres -e POSTGRES_PASSWORD=exprsn -p 5432:5432 postgres:${version}`);
          break;

        default:
          spinner.info('Please install PostgreSQL manually');
          console.log(chalk.gray('Download from: https://www.postgresql.org/download/\n'));
          return;
      }

      spinner.succeed(`PostgreSQL ${version} installed successfully`);
    } catch (error) {
      spinner.fail('PostgreSQL installation failed');
      logger.error('PostgreSQL install error:', error);
      console.log(chalk.yellow('You may need to install PostgreSQL manually\n'));
    }
  }

  async installRedis(options = {}) {
    const method = await this.determineMethod(options.method);
    const version = options.version || '7';
    const spinner = ora(`Installing Redis ${version}...`).start();

    try {
      switch (method) {
        case 'apt':
          await execAsync('sudo apt update && sudo apt install -y redis-server');
          await execAsync('sudo systemctl start redis-server');
          await execAsync('sudo systemctl enable redis-server');
          break;

        case 'yum':
          await execAsync('sudo yum install -y redis');
          await execAsync('sudo systemctl start redis');
          await execAsync('sudo systemctl enable redis');
          break;

        case 'brew':
          await execAsync('brew install redis');
          await execAsync('brew services start redis');
          break;

        case 'docker':
          await execAsync(`docker run -d --name exprsn-redis -p 6379:6379 redis:${version}`);
          break;

        default:
          spinner.info('Please install Redis manually');
          console.log(chalk.gray('Download from: https://redis.io/download\n'));
          return;
      }

      spinner.succeed(`Redis ${version} installed successfully`);
    } catch (error) {
      spinner.fail('Redis installation failed');
      logger.error('Redis install error:', error);
      console.log(chalk.yellow('Redis is optional but recommended\n'));
    }
  }

  async installNodeJS(options = {}) {
    const currentVersion = process.version;
    console.log(chalk.green(`✓ Node.js ${currentVersion} is already installed`));
  }

  async installDocker(options = {}) {
    const method = await this.determineMethod(options.method);
    const spinner = ora('Installing Docker...').start();

    try {
      switch (method) {
        case 'apt':
          await execAsync('curl -fsSL https://get.docker.com -o get-docker.sh');
          await execAsync('sudo sh get-docker.sh');
          await execAsync('sudo systemctl start docker');
          await execAsync('sudo systemctl enable docker');
          await execAsync('rm get-docker.sh');
          break;

        case 'yum':
          await execAsync('sudo yum install -y docker');
          await execAsync('sudo systemctl start docker');
          await execAsync('sudo systemctl enable docker');
          break;

        case 'brew':
          await execAsync('brew install --cask docker');
          break;

        default:
          spinner.info('Please install Docker manually');
          console.log(chalk.gray('Download from: https://www.docker.com/get-started\n'));
          return;
      }

      spinner.succeed('Docker installed successfully');
    } catch (error) {
      spinner.fail('Docker installation failed');
      logger.error('Docker install error:', error);
    }
  }

  async setupDocker(options = {}) {
    console.log(chalk.cyan('\n━━━ Docker Setup ━━━\n'));

    if (options.compose) {
      const compose = this.generateDockerCompose(options.services);
      const fs = require('fs-extra');
      const path = require('path');
      const composePath = path.join(global.EXPRSN_ROOT || process.cwd(), 'docker-compose.yml');

      await fs.writeFile(composePath, compose);
      console.log(chalk.green(`✓ Generated docker-compose.yml`));
      console.log(chalk.gray(`Location: ${composePath}\n`));
      console.log(chalk.cyan('Start services with: docker-compose up -d\n'));
    }
  }

  generateDockerCompose(services) {
    const serviceList = services ? services.split(',') : ['postgres', 'redis'];

    let compose = `version: '3.8'

services:
`;

    if (serviceList.includes('postgres')) {
      compose += `  postgres:
    image: postgres:15
    container_name: exprsn-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: exprsn
      POSTGRES_DB: exprsn
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - exprsn

`;
    }

    if (serviceList.includes('redis')) {
      compose += `  redis:
    image: redis:7
    container_name: exprsn-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - exprsn

`;
    }

    compose += `volumes:
  postgres_data:
  redis_data:

networks:
  exprsn:
    driver: bridge
`;

    return compose;
  }

  async installAll(options = {}) {
    await this.installPrerequisites(options);
    console.log(chalk.green('\n✓ All dependencies installed\n'));
  }

  async verifyInstallation() {
    const { checkPrerequisites, displayPrerequisites } = require('../utils/system-check');
    const results = await checkPrerequisites();
    displayPrerequisites(results);
  }

  async uninstall(component, options = {}) {
    console.log(chalk.yellow(`Uninstallation of ${component} must be done manually`));
    console.log(chalk.gray('This prevents accidental removal of system packages\n'));
  }

  async update(options = {}) {
    const spinner = ora('Checking for updates...').start();

    try {
      const rootDir = global.EXPRSN_ROOT || process.cwd();

      if (!options.deps || options.cli) {
        spinner.text = 'Updating Exprsn CLI...';
        await execAsync('npm install --save-dev @exprsn/cli@latest', { cwd: rootDir });
      }

      if (!options.cli || options.deps) {
        spinner.text = 'Updating dependencies...';
        await execAsync('npm update', { cwd: rootDir });
      }

      spinner.succeed('Update completed successfully');
    } catch (error) {
      spinner.fail('Update failed');
      logger.error('Update error:', error);
    }
  }
}

module.exports = { InstallManager };
