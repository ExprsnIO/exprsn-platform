/**
 * Service Manager - Start, stop, and configure services
 */

const fs = require('fs-extra');
const path = require('path');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const chalk = require('chalk');
const ora = require('ora');
const Table = require('cli-table3');
const axios = require('axios');
const { logger } = require('../utils/logger');
const { getServiceConfig, SERVICES } = require('../utils/service-config');

const execAsync = promisify(exec);

class ServiceManager {
  constructor() {
    this.rootDir = global.EXPRSN_ROOT || path.resolve(__dirname, '../../..');
    this.processes = new Map();
  }

  /**
   * List all services and their status
   */
  async listServices(options = {}) {
    const spinner = ora('Checking service status...').start();

    try {
      const services = await this.getAllServiceStatus();
      spinner.stop();

      const table = new Table({
        head: ['Service', 'Port', 'Status', 'PID', 'Uptime', 'Health'].map(h => chalk.cyan(h)),
        style: { head: [], border: [] }
      });

      for (const service of services) {
        if (options.running && service.status !== 'running') continue;
        if (options.stopped && service.status === 'running') continue;

        const statusColor = service.status === 'running' ? 'green' : 'gray';
        const healthIcon = service.health === 'healthy' ? '✓' :
                          service.health === 'unhealthy' ? '✗' : '-';
        const healthColor = service.health === 'healthy' ? 'green' :
                           service.health === 'unhealthy' ? 'red' : 'gray';

        table.push([
          service.name,
          service.port || '-',
          chalk[statusColor](service.status),
          service.pid || '-',
          service.uptime || '-',
          chalk[healthColor](healthIcon)
        ]);
      }

      console.log('\n' + table.toString() + '\n');

      const running = services.filter(s => s.status === 'running').length;
      const total = services.length;
      console.log(chalk.gray(`${running}/${total} services running\n`));
    } catch (error) {
      spinner.fail('Failed to list services');
      logger.error('List services error:', error);
      throw error;
    }
  }

  /**
   * Start a service
   */
  async start(serviceName, options = {}) {
    const service = SERVICES.find(s => s.name === serviceName || s.id === serviceName);
    if (!service) {
      console.error(chalk.red(`✗ Service '${serviceName}' not found`));
      return;
    }

    const spinner = ora(`Starting ${service.name}...`).start();

    try {
      // Check if already running
      const isRunning = await this.isServiceRunning(service);
      if (isRunning) {
        spinner.warn(`${service.name} is already running`);
        return;
      }

      // Check dependencies (e.g., CA must start first)
      if (service.dependencies) {
        for (const dep of service.dependencies) {
          const depRunning = await this.isServiceRunning(dep);
          if (!depRunning) {
            spinner.fail(`Dependency ${dep.name} is not running`);
            console.log(chalk.yellow(`Please start ${dep.name} first`));
            return;
          }
        }
      }

      // Start the service
      const servicePath = path.join(this.rootDir, service.path);
      const env = {
        ...process.env,
        PORT: service.port,
        NODE_ENV: process.env.NODE_ENV || 'development'
      };

      const child = spawn('npm', ['start'], {
        cwd: servicePath,
        env,
        detached: true,
        stdio: options.watch ? 'inherit' : 'ignore'
      });

      if (!options.watch) {
        child.unref();
      }

      this.processes.set(service.id, {
        pid: child.pid,
        process: child
      });

      // Wait for service to be healthy
      await this.waitForHealth(service, 30000);

      spinner.succeed(`${service.name} started successfully (PID: ${child.pid})`);

      if (options.watch) {
        console.log(chalk.gray('Watching logs... Press Ctrl+C to exit\n'));
      }
    } catch (error) {
      spinner.fail(`Failed to start ${service.name}`);
      logger.error('Start service error:', error);
      throw error;
    }
  }

  /**
   * Stop a service
   */
  async stop(serviceName) {
    const service = SERVICES.find(s => s.name === serviceName || s.id === serviceName);
    if (!service) {
      console.error(chalk.red(`✗ Service '${serviceName}' not found`));
      return;
    }

    const spinner = ora(`Stopping ${service.name}...`).start();

    try {
      const pid = await this.getServicePID(service);
      if (!pid) {
        spinner.warn(`${service.name} is not running`);
        return;
      }

      // Try graceful shutdown first
      try {
        process.kill(pid, 'SIGTERM');
        await this.waitForStop(pid, 10000);
      } catch (error) {
        // Force kill if graceful shutdown fails
        process.kill(pid, 'SIGKILL');
      }

      this.processes.delete(service.id);
      spinner.succeed(`${service.name} stopped successfully`);
    } catch (error) {
      spinner.fail(`Failed to stop ${service.name}`);
      logger.error('Stop service error:', error);
      throw error;
    }
  }

  /**
   * Restart a service
   */
  async restart(serviceName, options = {}) {
    const service = SERVICES.find(s => s.name === serviceName || s.id === serviceName);
    if (!service) {
      console.error(chalk.red(`✗ Service '${serviceName}' not found`));
      return;
    }

    await this.stop(serviceName);
    await new Promise(resolve => setTimeout(resolve, 2000));
    await this.start(serviceName, options);
  }

  /**
   * Start all services
   */
  async startAll() {
    console.log(chalk.cyan('\n🚀 Starting all services...\n'));

    // Start CA first (critical dependency)
    const ca = SERVICES.find(s => s.id === 'ca');
    if (ca) {
      await this.start('ca');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Start setup service
    const setup = SERVICES.find(s => s.id === 'setup');
    if (setup) {
      await this.start('setup');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Start remaining production services
    const productionServices = SERVICES.filter(
      s => s.status === 'production' && s.id !== 'ca' && s.id !== 'setup'
    );

    for (const service of productionServices) {
      try {
        await this.start(service.id);
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(chalk.red(`Failed to start ${service.name}`));
      }
    }

    console.log(chalk.green('\n✓ All services started\n'));
  }

  /**
   * Stop all services
   */
  async stopAll() {
    console.log(chalk.cyan('\n🛑 Stopping all services...\n'));

    const runningServices = await this.getRunningServices();

    for (const service of runningServices) {
      try {
        await this.stop(service.id);
      } catch (error) {
        console.error(chalk.red(`Failed to stop ${service.name}`));
      }
    }

    console.log(chalk.green('\n✓ All services stopped\n'));
  }

  /**
   * Restart all services
   */
  async restartAll() {
    await this.stopAll();
    await new Promise(resolve => setTimeout(resolve, 3000));
    await this.startAll();
  }

  /**
   * Get detailed service status
   */
  async status(serviceName) {
    const service = SERVICES.find(s => s.name === serviceName || s.id === serviceName);
    if (!service) {
      console.error(chalk.red(`✗ Service '${serviceName}' not found`));
      return;
    }

    const spinner = ora('Getting service status...').start();

    try {
      const status = await this.getServiceStatus(service);
      spinner.stop();

      console.log(chalk.cyan(`\n━━━ ${service.name} Status ━━━\n`));
      console.log(`  Name:        ${service.name}`);
      console.log(`  ID:          ${service.id}`);
      console.log(`  Port:        ${service.port || 'N/A'}`);
      console.log(`  Status:      ${chalk[status.running ? 'green' : 'gray'](status.running ? 'Running' : 'Stopped')}`);
      console.log(`  PID:         ${status.pid || 'N/A'}`);
      console.log(`  Uptime:      ${status.uptime || 'N/A'}`);
      console.log(`  Health:      ${status.health ? chalk.green('✓ Healthy') : chalk.red('✗ Unhealthy')}`);
      console.log(`  Description: ${service.description}`);
      console.log(`  Type:        ${service.status}`);
      console.log();
    } catch (error) {
      spinner.fail('Failed to get service status');
      logger.error('Status error:', error);
      throw error;
    }
  }

  /**
   * View service logs
   */
  async logs(serviceName, options = {}) {
    const service = SERVICES.find(s => s.name === serviceName || s.id === serviceName);
    if (!service) {
      console.error(chalk.red(`✗ Service '${serviceName}' not found`));
      return;
    }

    const logPath = path.join(this.rootDir, 'logs', `${service.id}.log`);

    if (!await fs.pathExists(logPath)) {
      console.log(chalk.yellow(`No logs found for ${service.name}`));
      return;
    }

    if (options.follow) {
      const tail = spawn('tail', ['-f', logPath], { stdio: 'inherit' });
      console.log(chalk.gray(`Following logs for ${service.name}... Press Ctrl+C to exit\n`));
    } else {
      const { stdout } = await execAsync(`tail -n ${options.lines} ${logPath}`);
      console.log(stdout);
    }
  }

  /**
   * Enable service auto-start
   */
  async enable(serviceName) {
    const service = SERVICES.find(s => s.name === serviceName || s.id === serviceName);
    if (!service) {
      console.error(chalk.red(`✗ Service '${serviceName}' not found`));
      return;
    }

    const envPath = path.join(this.rootDir, '.env');
    let envContent = '';

    if (await fs.pathExists(envPath)) {
      envContent = await fs.readFile(envPath, 'utf-8');
    }

    const autoStartMatch = envContent.match(/AUTO_START_SERVICES=(.+)/);
    let services = [];

    if (autoStartMatch) {
      services = autoStartMatch[1].split(',').map(s => s.trim());
    }

    if (!services.includes(service.id)) {
      services.push(service.id);
      const newValue = services.join(',');

      if (autoStartMatch) {
        envContent = envContent.replace(/AUTO_START_SERVICES=.+/, `AUTO_START_SERVICES=${newValue}`);
      } else {
        envContent += `\nAUTO_START_SERVICES=${newValue}\n`;
      }

      await fs.writeFile(envPath, envContent);
      console.log(chalk.green(`✓ ${service.name} enabled for auto-start`));
    } else {
      console.log(chalk.yellow(`${service.name} is already enabled for auto-start`));
    }
  }

  /**
   * Disable service auto-start
   */
  async disable(serviceName) {
    const service = SERVICES.find(s => s.name === serviceName || s.id === serviceName);
    if (!service) {
      console.error(chalk.red(`✗ Service '${serviceName}' not found`));
      return;
    }

    const envPath = path.join(this.rootDir, '.env');

    if (!await fs.pathExists(envPath)) {
      console.log(chalk.yellow('No .env file found'));
      return;
    }

    let envContent = await fs.readFile(envPath, 'utf-8');
    const autoStartMatch = envContent.match(/AUTO_START_SERVICES=(.+)/);

    if (!autoStartMatch) {
      console.log(chalk.yellow(`${service.name} is not in auto-start list`));
      return;
    }

    const services = autoStartMatch[1].split(',').map(s => s.trim()).filter(s => s !== service.id);
    const newValue = services.join(',');

    envContent = envContent.replace(/AUTO_START_SERVICES=.+/, `AUTO_START_SERVICES=${newValue}`);
    await fs.writeFile(envPath, envContent);

    console.log(chalk.green(`✓ ${service.name} disabled from auto-start`));
  }

  /**
   * Health check for all services
   */
  async healthCheck(options = {}) {
    if (options.watch) {
      console.log(chalk.cyan('Starting continuous health monitoring... Press Ctrl+C to exit\n'));

      setInterval(async () => {
        console.clear();
        await this.listServices();
      }, 5000);
    } else {
      await this.listServices();
    }
  }

  // Helper methods

  async getAllServiceStatus() {
    const statuses = [];

    for (const service of SERVICES) {
      const status = await this.getServiceStatus(service);
      statuses.push({
        name: service.name,
        id: service.id,
        port: service.port,
        status: status.running ? 'running' : 'stopped',
        pid: status.pid,
        uptime: status.uptime,
        health: status.health ? 'healthy' : status.running ? 'unhealthy' : 'stopped'
      });
    }

    return statuses;
  }

  async getServiceStatus(service) {
    const running = await this.isServiceRunning(service);
    const pid = await this.getServicePID(service);
    const health = running ? await this.checkServiceHealth(service) : false;
    const uptime = pid ? await this.getProcessUptime(pid) : null;

    return { running, pid, health, uptime };
  }

  async isServiceRunning(service) {
    try {
      if (service.port) {
        const { stdout } = await execAsync(`lsof -i :${service.port} -t`);
        return stdout.trim().length > 0;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async getServicePID(service) {
    try {
      if (service.port) {
        const { stdout } = await execAsync(`lsof -i :${service.port} -t`);
        return stdout.trim() || null;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async checkServiceHealth(service) {
    if (!service.healthEndpoint) return true;

    try {
      const url = `http://localhost:${service.port}${service.healthEndpoint}`;
      const response = await axios.get(url, { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  async getProcessUptime(pid) {
    try {
      const { stdout } = await execAsync(`ps -o etime= -p ${pid}`);
      return stdout.trim();
    } catch (error) {
      return null;
    }
  }

  async getRunningServices() {
    const running = [];
    for (const service of SERVICES) {
      if (await this.isServiceRunning(service)) {
        running.push(service);
      }
    }
    return running;
  }

  async waitForHealth(service, timeout = 30000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await this.checkServiceHealth(service)) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error(`Service ${service.name} failed to become healthy within ${timeout}ms`);
  }

  async waitForStop(pid, timeout = 10000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        process.kill(pid, 0);
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        return true;
      }
    }

    throw new Error(`Process ${pid} did not stop within ${timeout}ms`);
  }
}

module.exports = { ServiceManager };
